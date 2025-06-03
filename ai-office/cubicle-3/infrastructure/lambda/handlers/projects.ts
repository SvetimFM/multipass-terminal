import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { MetricUnits } from '@aws-lambda-powertools/metrics';

const logger = new Logger({ serviceName: 'projects-handler' });
const tracer = new Tracer({ serviceName: 'projects-handler' });
const metrics = new Metrics({ namespace: 'AIOffice/Projects', serviceName: 'projects-handler' });

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});

const METADATA_TABLE_NAME = process.env.METADATA_TABLE_NAME!;
const PROJECT_BUCKET_NAME = process.env.PROJECT_BUCKET_NAME!;
const USAGE_TABLE_NAME = process.env.USAGE_TABLE_NAME!;

interface Project {
  projectId: string;
  userId: string;
  name: string;
  description?: string;
  status: 'active' | 'archived' | 'deleted';
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, any>;
  tags?: string[];
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

const trackUsage = async (userId: string, action: string) => {
  try {
    await dynamoClient.send(new PutCommand({
      TableName: USAGE_TABLE_NAME,
      Item: {
        userId,
        timestamp: Date.now(),
        action,
        service: 'projects',
        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60, // 90 days
      },
    }));
  } catch (error) {
    logger.error('Failed to track usage', { error, userId, action });
  }
};

export const handler: APIGatewayProxyHandler = tracer.captureLambdaHandler(async (event) => {
  logger.info('Request received', { event });
  
  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  const method = event.httpMethod;
  const projectId = event.pathParameters?.projectId;

  try {
    let response: APIGatewayProxyResult;

    switch (method) {
      case 'GET':
        if (projectId) {
          response = await getProject(userId, projectId);
        } else {
          response = await listProjects(userId, event.queryStringParameters);
        }
        break;

      case 'POST':
        response = await createProject(userId, JSON.parse(event.body || '{}'));
        break;

      case 'PUT':
        if (!projectId) {
          response = {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Project ID required' }),
          };
        } else {
          response = await updateProject(userId, projectId, JSON.parse(event.body || '{}'));
        }
        break;

      case 'DELETE':
        if (!projectId) {
          response = {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Project ID required' }),
          };
        } else {
          response = await deleteProject(userId, projectId);
        }
        break;

      default:
        response = {
          statusCode: 405,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }

    metrics.addMetric('RequestCount', MetricUnits.Count, 1);
    metrics.addMetadata('method', method);
    metrics.addMetadata('statusCode', response.statusCode.toString());
    
    return response;
  } catch (error) {
    logger.error('Request failed', { error, method, projectId });
    metrics.addMetric('ErrorCount', MetricUnits.Count, 1);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  } finally {
    metrics.publishStoredMetrics();
  }
});

async function getProject(userId: string, projectId: string): Promise<APIGatewayProxyResult> {
  const result = await dynamoClient.send(new GetCommand({
    TableName: METADATA_TABLE_NAME,
    Key: {
      pk: `USER#${userId}`,
      sk: `PROJECT#${projectId}`,
    },
  }));

  if (!result.Item) {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Project not found' }),
    };
  }

  // Generate presigned URLs for project files
  const filesResult = await s3Client.send(new ListObjectsV2Command({
    Bucket: PROJECT_BUCKET_NAME,
    Prefix: `${userId}/${projectId}/`,
    MaxKeys: 100,
  }));

  const files = await Promise.all(
    (filesResult.Contents || []).map(async (file) => ({
      key: file.Key,
      size: file.Size,
      lastModified: file.LastModified,
      url: await getSignedUrl(s3Client, new GetObjectCommand({
        Bucket: PROJECT_BUCKET_NAME,
        Key: file.Key!,
      }), { expiresIn: 3600 }),
    }))
  );

  await trackUsage(userId, 'get_project');

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      project: result.Item,
      files,
    }),
  };
}

async function listProjects(userId: string, queryParams: any): Promise<APIGatewayProxyResult> {
  const limit = parseInt(queryParams?.limit || '20');
  const exclusiveStartKey = queryParams?.nextToken ? JSON.parse(Buffer.from(queryParams.nextToken, 'base64').toString()) : undefined;

  const result = await dynamoClient.send(new QueryCommand({
    TableName: METADATA_TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':skPrefix': 'PROJECT#',
    },
    Limit: limit,
    ExclusiveStartKey: exclusiveStartKey,
    ScanIndexForward: false, // Most recent first
  }));

  const nextToken = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : undefined;

  await trackUsage(userId, 'list_projects');

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      projects: result.Items || [],
      nextToken,
    }),
  };
}

async function createProject(userId: string, body: any): Promise<APIGatewayProxyResult> {
  const { name, description, metadata, tags } = body;

  if (!name) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Project name required' }),
    };
  }

  const projectId = uuidv4();
  const timestamp = Date.now();

  const project: Project = {
    projectId,
    userId,
    name,
    description,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    metadata,
    tags,
  };

  await dynamoClient.send(new PutCommand({
    TableName: METADATA_TABLE_NAME,
    Item: {
      pk: `USER#${userId}`,
      sk: `PROJECT#${projectId}`,
      ...project,
      gsi1pk: 'PROJECT',
      gsi1sk: `${timestamp}#${projectId}`,
    },
  }));

  // Create project directory in S3
  await s3Client.send(new PutObjectCommand({
    Bucket: PROJECT_BUCKET_NAME,
    Key: `${userId}/${projectId}/.keep`,
    Body: '',
  }));

  await trackUsage(userId, 'create_project');
  metrics.addMetric('ProjectsCreated', MetricUnits.Count, 1);

  return {
    statusCode: 201,
    headers: corsHeaders,
    body: JSON.stringify({ project }),
  };
}

async function updateProject(userId: string, projectId: string, body: any): Promise<APIGatewayProxyResult> {
  const { name, description, metadata, tags, status } = body;

  const updateExpression: string[] = ['SET updatedAt = :updatedAt'];
  const expressionAttributeValues: Record<string, any> = {
    ':updatedAt': Date.now(),
  };

  if (name !== undefined) {
    updateExpression.push('name = :name');
    expressionAttributeValues[':name'] = name;
  }

  if (description !== undefined) {
    updateExpression.push('description = :description');
    expressionAttributeValues[':description'] = description;
  }

  if (metadata !== undefined) {
    updateExpression.push('metadata = :metadata');
    expressionAttributeValues[':metadata'] = metadata;
  }

  if (tags !== undefined) {
    updateExpression.push('tags = :tags');
    expressionAttributeValues[':tags'] = tags;
  }

  if (status !== undefined) {
    updateExpression.push('status = :status');
    expressionAttributeValues[':status'] = status;
  }

  try {
    const result = await dynamoClient.send(new UpdateCommand({
      TableName: METADATA_TABLE_NAME,
      Key: {
        pk: `USER#${userId}`,
        sk: `PROJECT#${projectId}`,
      },
      UpdateExpression: updateExpression.join(', '),
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
      ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
    }));

    await trackUsage(userId, 'update_project');

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ project: result.Attributes }),
    };
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Project not found' }),
      };
    }
    throw error;
  }
}

async function deleteProject(userId: string, projectId: string): Promise<APIGatewayProxyResult> {
  // Soft delete - update status instead of removing
  const result = await dynamoClient.send(new UpdateCommand({
    TableName: METADATA_TABLE_NAME,
    Key: {
      pk: `USER#${userId}`,
      sk: `PROJECT#${projectId}`,
    },
    UpdateExpression: 'SET status = :status, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':status': 'deleted',
      ':updatedAt': Date.now(),
    },
    ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
    ReturnValues: 'NONE',
  }));

  // Optionally archive S3 objects (move to glacier or delete after retention period)
  // For now, we'll keep them for recovery purposes

  await trackUsage(userId, 'delete_project');
  metrics.addMetric('ProjectsDeleted', MetricUnits.Count, 1);

  return {
    statusCode: 204,
    headers: corsHeaders,
    body: '',
  };
}