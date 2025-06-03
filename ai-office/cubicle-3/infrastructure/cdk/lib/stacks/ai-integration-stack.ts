import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as stepfunctionsTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { Config } from '../config';
import * as path from 'path';

interface AIIntegrationStackProps extends cdk.StackProps {
  config: Config;
  metadataTable: dynamodb.Table;
  usageTable: dynamodb.Table;
  projectBucket: s3.Bucket;
  executionQueue: sqs.Queue;
  notificationTopic: sns.Topic;
  restApi: apigateway.RestApi;
  logGroup: logs.LogGroup;
  encryptionKey: kms.Key;
}

export class AIIntegrationStack extends cdk.Stack {
  public readonly aiOrchestratorLambda: lambda.Function;
  public readonly promptQueue: sqs.Queue;
  public readonly aiStateMachine: stepfunctions.StateMachine;

  constructor(scope: Construct, id: string, props: AIIntegrationStackProps) {
    super(scope, id, props);

    const { config, metadataTable, usageTable, projectBucket, executionQueue, notificationTopic, restApi, logGroup, encryptionKey } = props;

    // Secrets for AI provider API keys
    const aiSecretsManager = new secretsmanager.Secret(this, 'AISecretsManager', {
      secretName: `${config.prefix}-ai-secrets`,
      description: 'API keys for AI providers',
      encryptionKey,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          anthropic: '',
          openai: '',
          replicate: '',
          huggingface: '',
        }),
        generateStringKey: 'placeholder',
      },
    });

    // Dead Letter Queue for failed AI requests
    const aiDlq = new sqs.Queue(this, 'AIDlq', {
      queueName: `${config.prefix}-ai-dlq`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    // Queue for AI prompt processing
    this.promptQueue = new sqs.Queue(this, 'PromptQueue', {
      queueName: `${config.prefix}-prompt-queue`,
      visibilityTimeout: cdk.Duration.minutes(15),
      deadLetterQueue: {
        queue: aiDlq,
        maxReceiveCount: 3,
      },
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    // Lambda Layer for AI SDKs
    const aiSdkLayer = new lambda.LayerVersion(this, 'AISdkLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda/layers/ai-sdk')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'AI SDK dependencies (Anthropic, OpenAI, etc.)',
    });

    // AI Orchestrator Lambda
    this.aiOrchestratorLambda = new lambdaNodejs.NodejsFunction(this, 'AIOrchestratorLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../../lambda/handlers/ai/orchestrator.ts'),
      environment: {
        METADATA_TABLE_NAME: metadataTable.tableName,
        USAGE_TABLE_NAME: usageTable.tableName,
        PROJECT_BUCKET_NAME: projectBucket.bucketName,
        PROMPT_QUEUE_URL: this.promptQueue.queueUrl,
        EXECUTION_QUEUE_URL: executionQueue.queueUrl,
        AI_SECRETS_ARN: aiSecretsManager.secretArn,
        DEFAULT_MODEL: config.ai.defaultModel,
        ENABLED_MODELS: config.ai.enabledModels.join(','),
        MAX_TOKENS_PER_REQUEST: config.ai.maxTokensPerRequest.toString(),
      },
      timeout: cdk.Duration.minutes(15),
      memorySize: 2048,
      layers: [aiSdkLayer],
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
      reservedConcurrentExecutions: 50,
    });

    // Grant permissions
    metadataTable.grantReadWriteData(this.aiOrchestratorLambda);
    usageTable.grantWriteData(this.aiOrchestratorLambda);
    projectBucket.grantRead(this.aiOrchestratorLambda);
    this.promptQueue.grantSendMessages(this.aiOrchestratorLambda);
    executionQueue.grantSendMessages(this.aiOrchestratorLambda);
    aiSecretsManager.grantRead(this.aiOrchestratorLambda);

    // Grant Bedrock permissions
    this.aiOrchestratorLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: config.ai.enabledModels.map(model => 
        `arn:aws:bedrock:${this.region}::foundation-model/${model}`
      ),
    }));

    // Model Router Lambda
    const modelRouterLambda = new lambdaNodejs.NodejsFunction(this, 'ModelRouterLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../../lambda/handlers/ai/model-router.ts'),
      environment: {
        ENABLED_MODELS: config.ai.enabledModels.join(','),
        USAGE_TABLE_NAME: usageTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
    });

    usageTable.grantReadData(modelRouterLambda);

    // Context Manager Lambda
    const contextManagerLambda = new lambdaNodejs.NodejsFunction(this, 'ContextManagerLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../../lambda/handlers/ai/context-manager.ts'),
      environment: {
        METADATA_TABLE_NAME: metadataTable.tableName,
        PROJECT_BUCKET_NAME: projectBucket.bucketName,
      },
      timeout: cdk.Duration.minutes(2),
      memorySize: 1024,
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
    });

    metadataTable.grantReadWriteData(contextManagerLambda);
    projectBucket.grantRead(contextManagerLambda);

    // Prompt Processor Lambda
    const promptProcessorLambda = new lambdaNodejs.NodejsFunction(this, 'PromptProcessorLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../../lambda/handlers/ai/prompt-processor.ts'),
      environment: {
        AI_ORCHESTRATOR_FUNCTION_NAME: this.aiOrchestratorLambda.functionName,
        NOTIFICATION_TOPIC_ARN: notificationTopic.topicArn,
      },
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
      reservedConcurrentExecutions: 20,
    });

    this.aiOrchestratorLambda.grantInvoke(promptProcessorLambda);
    notificationTopic.grantPublish(promptProcessorLambda);

    // SQS event source for prompt processing
    promptProcessorLambda.addEventSource(new lambda.EventSourceMapping(this, 'PromptQueueEventSource', {
      eventSourceArn: this.promptQueue.queueArn,
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(10),
    }));

    // Step Functions State Machine for AI workflows
    const routeModel = new stepfunctionsTasks.LambdaInvoke(this, 'RouteModel', {
      lambdaFunction: modelRouterLambda,
      outputPath: '$.Payload',
    });

    const buildContext = new stepfunctionsTasks.LambdaInvoke(this, 'BuildContext', {
      lambdaFunction: contextManagerLambda,
      outputPath: '$.Payload',
    });

    const invokeAI = new stepfunctionsTasks.LambdaInvoke(this, 'InvokeAI', {
      lambdaFunction: this.aiOrchestratorLambda,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    const notifySuccess = new stepfunctionsTasks.SnsPublish(this, 'NotifySuccess', {
      topic: notificationTopic,
      message: stepfunctions.TaskInput.fromJsonPathAt('$'),
    });

    const notifyFailure = new stepfunctionsTasks.SnsPublish(this, 'NotifyFailure', {
      topic: notificationTopic,
      message: stepfunctions.TaskInput.fromJsonPathAt('$'),
    });

    const aiSucceeded = new stepfunctions.Succeed(this, 'AISucceeded');
    const aiFailed = new stepfunctions.Fail(this, 'AIFailed');

    const definition = routeModel
      .next(buildContext)
      .next(invokeAI)
      .next(new stepfunctions.Choice(this, 'CheckAIResult')
        .when(stepfunctions.Condition.stringEquals('$.status', 'success'),
          notifySuccess.next(aiSucceeded))
        .otherwise(
          notifyFailure.next(aiFailed)));

    this.aiStateMachine = new stepfunctions.StateMachine(this, 'AIStateMachine', {
      stateMachineName: `${config.prefix}-ai-workflow`,
      definition,
      timeout: cdk.Duration.hours(1),
      tracingEnabled: true,
      logs: {
        destination: logGroup,
        level: stepfunctions.LogLevel.ALL,
      },
    });

    // API Gateway integration
    const aiResource = restApi.root.getResource('v1')?.addResource('ai') || restApi.root.addResource('ai');
    
    const promptResource = aiResource.addResource('prompt');
    promptResource.addMethod('POST', new apigateway.LambdaIntegration(this.aiOrchestratorLambda), {
      authorizationType: apigateway.AuthorizationType.COGNITO,
      requestModels: {
        'application/json': new apigateway.Model(this, 'PromptRequestModel', {
          restApi,
          contentType: 'application/json',
          schema: {
            type: apigateway.JsonSchemaType.OBJECT,
            properties: {
              prompt: { type: apigateway.JsonSchemaType.STRING },
              model: { type: apigateway.JsonSchemaType.STRING },
              temperature: { type: apigateway.JsonSchemaType.NUMBER },
              maxTokens: { type: apigateway.JsonSchemaType.INTEGER },
              context: { type: apigateway.JsonSchemaType.OBJECT },
            },
            required: ['prompt'],
          },
        }),
      },
      requestValidator: new apigateway.RequestValidator(this, 'PromptRequestValidator', {
        restApi,
        requestValidatorName: 'prompt-validator',
        validateRequestBody: true,
        validateRequestParameters: false,
      }),
    });

    // CloudWatch Metrics and Alarms
    const aiErrorMetric = new cloudwatch.Metric({
      namespace: 'AIOffice/AI',
      metricName: 'Errors',
      dimensionsMap: {
        Environment: config.environment,
      },
    });

    new cloudwatch.Alarm(this, 'AIErrorAlarm', {
      metric: aiErrorMetric,
      threshold: 10,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'High AI error rate detected',
    }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(notificationTopic));

    const aiLatencyMetric = new cloudwatch.Metric({
      namespace: 'AIOffice/AI',
      metricName: 'Latency',
      dimensionsMap: {
        Environment: config.environment,
      },
      statistic: 'p99',
    });

    new cloudwatch.Alarm(this, 'AILatencyAlarm', {
      metric: aiLatencyMetric,
      threshold: 30000, // 30 seconds
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'High AI latency detected',
    }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(notificationTopic));

    // Cost optimization: Reserved capacity for predictable workloads
    if (config.isProd) {
      new lambda.CfnFunction(this, 'ReservedConcurrency', {
        functionName: this.aiOrchestratorLambda.functionName,
        reservedConcurrentExecutions: 25,
      });
    }

    // Outputs
    new cdk.CfnOutput(this, 'AIOrchestratorFunctionName', {
      value: this.aiOrchestratorLambda.functionName,
      exportName: `${config.prefix}-ai-orchestrator-function`,
    });

    new cdk.CfnOutput(this, 'PromptQueueUrl', {
      value: this.promptQueue.queueUrl,
      exportName: `${config.prefix}-prompt-queue-url`,
    });

    new cdk.CfnOutput(this, 'AIStateMachineArn', {
      value: this.aiStateMachine.stateMachineArn,
      exportName: `${config.prefix}-ai-state-machine-arn`,
    });
  }
}