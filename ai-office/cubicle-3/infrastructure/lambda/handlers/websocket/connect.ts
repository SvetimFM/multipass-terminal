import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { MetricUnits } from '@aws-lambda-powertools/metrics';

const logger = new Logger({ serviceName: 'websocket-connect' });
const tracer = new Tracer({ serviceName: 'websocket-connect' });
const metrics = new Metrics({ namespace: 'AIOffice/WebSocket', serviceName: 'websocket-connect' });

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const METADATA_TABLE_NAME = process.env.METADATA_TABLE_NAME!;
const USER_POOL_ID = process.env.USER_POOL_ID!;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID!;

// Create verifier outside handler for reuse
const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: 'id',
  clientId: USER_POOL_CLIENT_ID,
});

interface ConnectionData {
  connectionId: string;
  userId: string;
  connectedAt: number;
  ttl: number;
  metadata?: Record<string, any>;
}

export const handler: APIGatewayProxyHandler = tracer.captureLambdaHandler(async (event) => {
  logger.info('WebSocket connection request', { 
    connectionId: event.requestContext.connectionId,
    routeKey: event.requestContext.routeKey,
  });

  const connectionId = event.requestContext.connectionId!;
  const token = event.queryStringParameters?.token;

  if (!token) {
    logger.error('No token provided');
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Unauthorized: No token provided' }),
    };
  }

  try {
    // Verify JWT token
    const payload = await verifier.verify(token);
    const userId = payload.sub;

    if (!userId) {
      logger.error('No user ID in token');
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized: Invalid token' }),
      };
    }

    // Store connection information
    const connectionData: ConnectionData = {
      connectionId,
      userId,
      connectedAt: Date.now(),
      ttl: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hour TTL
      metadata: {
        userAgent: event.headers['User-Agent'],
        sourceIp: event.requestContext.identity.sourceIp,
      },
    };

    // Store connection by connectionId for disconnect lookup
    await dynamoClient.send(new PutCommand({
      TableName: METADATA_TABLE_NAME,
      Item: {
        pk: `CONNECTION#${connectionId}`,
        sk: 'METADATA',
        ...connectionData,
      },
    }));

    // Store connection by userId for sending messages to user
    await dynamoClient.send(new PutCommand({
      TableName: METADATA_TABLE_NAME,
      Item: {
        pk: `USER#${userId}`,
        sk: `CONNECTION#${connectionId}`,
        ...connectionData,
        gsi1pk: 'CONNECTION',
        gsi1sk: `${connectionData.connectedAt}#${connectionId}`,
      },
    }));

    metrics.addMetric('ConnectionsEstablished', MetricUnits.Count, 1);
    metrics.addMetadata('userId', userId);

    logger.info('WebSocket connection established', { connectionId, userId });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Connected successfully' }),
    };
  } catch (error) {
    logger.error('Failed to establish connection', { error, connectionId });
    metrics.addMetric('ConnectionsFailed', MetricUnits.Count, 1);

    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Unauthorized: Invalid token' }),
    };
  } finally {
    metrics.publishStoredMetrics();
  }
});

// WebSocket authorizer function (called before connect)
export const authorizer = async (event: any) => {
  logger.info('WebSocket authorization request', { event });

  const token = event.queryStringParameters?.token;
  
  if (!token) {
    logger.error('No token provided for authorization');
    return {
      principalId: 'anonymous',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [{
          Action: 'execute-api:Invoke',
          Effect: 'Deny',
          Resource: event.methodArn,
        }],
      },
    };
  }

  try {
    const payload = await verifier.verify(token);
    const userId = payload.sub;

    logger.info('Token verified successfully', { userId });

    return {
      principalId: userId,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [{
          Action: 'execute-api:Invoke',
          Effect: 'Allow',
          Resource: event.methodArn,
        }],
      },
      context: {
        userId,
        email: payload.email,
      },
    };
  } catch (error) {
    logger.error('Token verification failed', { error });

    return {
      principalId: 'anonymous',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [{
          Action: 'execute-api:Invoke',
          Effect: 'Deny',
          Resource: event.methodArn,
        }],
      },
    };
  }
};