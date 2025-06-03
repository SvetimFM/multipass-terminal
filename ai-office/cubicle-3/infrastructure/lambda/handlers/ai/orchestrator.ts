import { APIGatewayProxyHandler, SQSHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { MetricUnits } from '@aws-lambda-powertools/metrics';
import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const logger = new Logger({ serviceName: 'ai-orchestrator' });
const tracer = new Tracer({ serviceName: 'ai-orchestrator' });
const metrics = new Metrics({ namespace: 'AIOffice/AI', serviceName: 'ai-orchestrator' });

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});
const sqsClient = new SQSClient({});
const secretsClient = new SecretsManagerClient({});
const bedrockClient = new BedrockRuntimeClient({});

const METADATA_TABLE_NAME = process.env.METADATA_TABLE_NAME!;
const USAGE_TABLE_NAME = process.env.USAGE_TABLE_NAME!;
const PROJECT_BUCKET_NAME = process.env.PROJECT_BUCKET_NAME!;
const PROMPT_QUEUE_URL = process.env.PROMPT_QUEUE_URL!;
const EXECUTION_QUEUE_URL = process.env.EXECUTION_QUEUE_URL!;
const AI_SECRETS_ARN = process.env.AI_SECRETS_ARN!;
const DEFAULT_MODEL = process.env.DEFAULT_MODEL!;
const ENABLED_MODELS = process.env.ENABLED_MODELS!.split(',');
const MAX_TOKENS_PER_REQUEST = parseInt(process.env.MAX_TOKENS_PER_REQUEST!);

interface AIRequest {
  requestId: string;
  userId: string;
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  context?: {
    projectId?: string;
    sessionId?: string;
    files?: string[];
  };
  stream?: boolean;
}

interface AIResponse {
  requestId: string;
  status: 'success' | 'error';
  content?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
  metadata?: Record<string, any>;
}

let aiClients: Record<string, any> = {};

const initializeAIClients = async () => {
  if (Object.keys(aiClients).length > 0) return;

  try {
    const secretResponse = await secretsClient.send(new GetSecretValueCommand({
      SecretId: AI_SECRETS_ARN,
    }));

    const secrets = JSON.parse(secretResponse.SecretString!);

    if (secrets.anthropic) {
      aiClients.anthropic = new Anthropic({
        apiKey: secrets.anthropic,
      });
    }

    if (secrets.openai) {
      aiClients.openai = new OpenAI({
        apiKey: secrets.openai,
      });
    }

    logger.info('AI clients initialized');
  } catch (error) {
    logger.error('Failed to initialize AI clients', { error });
    throw new Error('Failed to initialize AI clients');
  }
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

// API Gateway handler for direct invocations
export const handler: APIGatewayProxyHandler = tracer.captureLambdaHandler(async (event) => {
  logger.info('AI request received', { event });

  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const request: AIRequest = {
      requestId: uuidv4(),
      userId,
      prompt: body.prompt,
      model: body.model || DEFAULT_MODEL,
      temperature: body.temperature || 0.7,
      maxTokens: Math.min(body.maxTokens || 4096, MAX_TOKENS_PER_REQUEST),
      context: body.context,
      stream: body.stream || false,
    };

    if (!request.prompt) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Prompt is required' }),
      };
    }

    if (!ENABLED_MODELS.includes(request.model!)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: `Model ${request.model} is not enabled` }),
      };
    }

    // For streaming responses, queue the request and return immediately
    if (request.stream) {
      await sqsClient.send(new SendMessageCommand({
        QueueUrl: PROMPT_QUEUE_URL,
        MessageBody: JSON.stringify(request),
        MessageAttributes: {
          userId: { DataType: 'String', StringValue: userId },
          requestId: { DataType: 'String', StringValue: request.requestId },
        },
      }));

      return {
        statusCode: 202,
        headers: corsHeaders,
        body: JSON.stringify({
          requestId: request.requestId,
          message: 'Request queued for processing',
        }),
      };
    }

    // For non-streaming, process immediately
    const response = await processAIRequest(request);

    return {
      statusCode: response.status === 'success' ? 200 : 500,
      headers: corsHeaders,
      body: JSON.stringify(response),
    };
  } catch (error) {
    logger.error('AI request failed', { error });
    metrics.addMetric('Errors', MetricUnits.Count, 1);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  } finally {
    metrics.publishStoredMetrics();
  }
});

// SQS handler for queued requests
export const sqsHandler: SQSHandler = tracer.captureLambdaHandler(async (event) => {
  await initializeAIClients();

  for (const record of event.Records) {
    try {
      const request: AIRequest = JSON.parse(record.body);
      const response = await processAIRequest(request);

      // Store result for retrieval
      await dynamoClient.send(new PutCommand({
        TableName: METADATA_TABLE_NAME,
        Item: {
          pk: `USER#${request.userId}`,
          sk: `AI_REQUEST#${request.requestId}`,
          ...response,
          createdAt: Date.now(),
          ttl: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
        },
      }));

      // If needed, send to execution queue for further processing
      if (response.metadata?.requiresExecution) {
        await sqsClient.send(new SendMessageCommand({
          QueueUrl: EXECUTION_QUEUE_URL,
          MessageBody: JSON.stringify({
            requestId: request.requestId,
            userId: request.userId,
            code: response.content,
            language: response.metadata.language,
          }),
        }));
      }
    } catch (error) {
      logger.error('Failed to process queued AI request', { error, record });
      throw error; // Let it go to DLQ
    }
  }
});

async function processAIRequest(request: AIRequest): Promise<AIResponse> {
  const startTime = Date.now();
  metrics.addMetric('RequestCount', MetricUnits.Count, 1);
  metrics.addMetadata('model', request.model!);

  try {
    // Build context from files if provided
    let contextContent = '';
    if (request.context?.files && request.context.files.length > 0) {
      contextContent = await buildContextFromFiles(request.userId, request.context.projectId!, request.context.files);
    }

    const fullPrompt = contextContent ? `${contextContent}\n\n${request.prompt}` : request.prompt;

    let response: AIResponse;

    if (request.model!.startsWith('anthropic.')) {
      response = await invokeBedrockModel(request, fullPrompt);
    } else if (request.model!.startsWith('claude-')) {
      response = await invokeAnthropicModel(request, fullPrompt);
    } else if (request.model!.startsWith('gpt-')) {
      response = await invokeOpenAIModel(request, fullPrompt);
    } else {
      throw new Error(`Unsupported model: ${request.model}`);
    }

    // Track usage
    if (response.usage) {
      await trackUsage(request.userId, request.model!, response.usage);
      
      metrics.addMetric('TokensUsed', MetricUnits.Count, response.usage.totalTokens);
      metrics.addMetric('PromptTokens', MetricUnits.Count, response.usage.promptTokens);
      metrics.addMetric('CompletionTokens', MetricUnits.Count, response.usage.completionTokens);
    }

    const duration = Date.now() - startTime;
    metrics.addMetric('Latency', MetricUnits.Milliseconds, duration);

    return response;
  } catch (error: any) {
    logger.error('AI processing failed', { error, request });
    metrics.addMetric('Errors', MetricUnits.Count, 1);

    return {
      requestId: request.requestId,
      status: 'error',
      error: error.message || 'AI processing failed',
    };
  }
}

async function buildContextFromFiles(userId: string, projectId: string, files: string[]): Promise<string> {
  const contextParts: string[] = [];

  for (const file of files.slice(0, 5)) { // Limit to 5 files
    try {
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: PROJECT_BUCKET_NAME,
        Key: `${userId}/${projectId}/${file}`,
      }));

      const content = await response.Body!.transformToString();
      contextParts.push(`File: ${file}\n\`\`\`\n${content}\n\`\`\``);
    } catch (error) {
      logger.warn('Failed to load context file', { error, file });
    }
  }

  return contextParts.join('\n\n');
}

async function invokeBedrockModel(request: AIRequest, prompt: string): Promise<AIResponse> {
  const modelId = request.model!;
  
  const bedrockRequest = {
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      messages: [{
        role: 'user',
        content: prompt,
      }],
    }),
  };

  const response = await bedrockClient.send(new InvokeModelCommand(bedrockRequest));
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  return {
    requestId: request.requestId,
    status: 'success',
    content: responseBody.content[0].text,
    usage: {
      promptTokens: responseBody.usage.input_tokens,
      completionTokens: responseBody.usage.output_tokens,
      totalTokens: responseBody.usage.input_tokens + responseBody.usage.output_tokens,
    },
  };
}

async function invokeAnthropicModel(request: AIRequest, prompt: string): Promise<AIResponse> {
  await initializeAIClients();
  
  if (!aiClients.anthropic) {
    throw new Error('Anthropic client not initialized');
  }

  const response = await aiClients.anthropic.messages.create({
    model: request.model!,
    max_tokens: request.maxTokens!,
    temperature: request.temperature!,
    messages: [{
      role: 'user',
      content: prompt,
    }],
  });

  return {
    requestId: request.requestId,
    status: 'success',
    content: response.content[0].text,
    usage: {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    },
  };
}

async function invokeOpenAIModel(request: AIRequest, prompt: string): Promise<AIResponse> {
  await initializeAIClients();
  
  if (!aiClients.openai) {
    throw new Error('OpenAI client not initialized');
  }

  const response = await aiClients.openai.chat.completions.create({
    model: request.model!,
    messages: [{
      role: 'user',
      content: prompt,
    }],
    temperature: request.temperature!,
    max_tokens: request.maxTokens!,
  });

  return {
    requestId: request.requestId,
    status: 'success',
    content: response.choices[0].message.content!,
    usage: {
      promptTokens: response.usage!.prompt_tokens,
      completionTokens: response.usage!.completion_tokens,
      totalTokens: response.usage!.total_tokens,
    },
  };
}

async function trackUsage(userId: string, model: string, usage: AIResponse['usage']) {
  try {
    await dynamoClient.send(new PutCommand({
      TableName: USAGE_TABLE_NAME,
      Item: {
        userId,
        timestamp: Date.now(),
        service: 'ai',
        model,
        usage,
        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60, // 90 days
      },
    }));
  } catch (error) {
    logger.error('Failed to track usage', { error, userId, model });
  }
}