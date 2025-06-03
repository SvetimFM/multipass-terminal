import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { MetricUnits } from '@aws-lambda-powertools/metrics';

const logger = new Logger({ serviceName: 'websocket-message' });
const tracer = new Tracer({ serviceName: 'websocket-message' });
const metrics = new Metrics({ namespace: 'AIOffice/WebSocket', serviceName: 'websocket-message' });

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const METADATA_TABLE_NAME = process.env.METADATA_TABLE_NAME!;

export const handler: APIGatewayProxyHandler = tracer.captureLambdaHandler(async (event) => {
  logger.info('WebSocket message received', { 
    connectionId: event.requestContext.connectionId,
    body: event.body,
  });

  const connectionId = event.requestContext.connectionId!;
  const endpoint = `https://${event.requestContext.domainName}/${event.requestContext.stage}`;
  const apiClient = new ApiGatewayManagementApiClient({ endpoint });

  try {
    // Parse message
    const message = JSON.parse(event.body || '{}');
    metrics.addMetric('MessagesReceived', MetricUnits.Count, 1);
    metrics.addMetadata('messageType', message.type || 'unknown');

    // Get connection metadata
    const connectionResult = await dynamoClient.send(new GetCommand({
      TableName: METADATA_TABLE_NAME,
      Key: {
        pk: `CONNECTION#${connectionId}`,
        sk: 'METADATA',
      },
    }));

    if (!connectionResult.Item) {
      logger.error('Connection not found', { connectionId });
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Connection not found' }),
      };
    }

    const userId = connectionResult.Item.userId;

    // Handle different message types
    switch (message.type) {
      case 'ping':
        await handlePing(apiClient, connectionId);
        break;
      
      case 'broadcast':
        await handleBroadcast(apiClient, userId, message, connectionId);
        break;
      
      case 'subscribe':
        await handleSubscribe(userId, connectionId, message.channel);
        break;
      
      case 'unsubscribe':
        await handleUnsubscribe(userId, connectionId, message.channel);
        break;
      
      default:
        await apiClient.send(new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: JSON.stringify({
            type: 'error',
            message: `Unknown message type: ${message.type}`,
          }),
        }));
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Message processed' }),
    };
  } catch (error) {
    logger.error('Failed to process message', { error, connectionId });
    metrics.addMetric('MessagesFailed', MetricUnits.Count, 1);

    // Try to send error to client
    try {
      await apiClient.send(new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify({
          type: 'error',
          message: 'Failed to process message',
        }),
      }));
    } catch (sendError) {
      logger.error('Failed to send error to client', { sendError });
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  } finally {
    metrics.publishStoredMetrics();
  }
});

async function handlePing(apiClient: ApiGatewayManagementApiClient, connectionId: string) {
  await apiClient.send(new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: JSON.stringify({
      type: 'pong',
      timestamp: Date.now(),
    }),
  }));
}

async function handleBroadcast(
  apiClient: ApiGatewayManagementApiClient, 
  userId: string, 
  message: any, 
  senderConnectionId: string
) {
  // Get all connections for the user
  const connectionsResult = await dynamoClient.send(new QueryCommand({
    TableName: METADATA_TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':skPrefix': 'CONNECTION#',
    },
  }));

  const connections = connectionsResult.Items || [];
  const sendPromises = connections
    .filter(conn => conn.connectionId !== senderConnectionId) // Don't echo back to sender
    .map(async (conn) => {
      try {
        await apiClient.send(new PostToConnectionCommand({
          ConnectionId: conn.connectionId,
          Data: JSON.stringify({
            type: 'broadcast',
            from: senderConnectionId,
            data: message.data,
            timestamp: Date.now(),
          }),
        }));
      } catch (error: any) {
        // If connection is stale, it will be cleaned up by the disconnect handler
        if (error.statusCode === 410) {
          logger.info('Stale connection detected', { connectionId: conn.connectionId });
        } else {
          logger.error('Failed to send to connection', { error, connectionId: conn.connectionId });
        }
      }
    });

  await Promise.all(sendPromises);
}

async function handleSubscribe(userId: string, connectionId: string, channel: string) {
  // Store subscription in DynamoDB
  await dynamoClient.send(new PutCommand({
    TableName: METADATA_TABLE_NAME,
    Item: {
      pk: `CHANNEL#${channel}`,
      sk: `SUBSCRIBER#${connectionId}`,
      userId,
      connectionId,
      subscribedAt: Date.now(),
      ttl: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
    },
  }));
  
  logger.info('Subscribed to channel', { userId, connectionId, channel });
}

async function handleUnsubscribe(userId: string, connectionId: string, channel: string) {
  // Remove subscription from DynamoDB
  await dynamoClient.send(new DeleteCommand({
    TableName: METADATA_TABLE_NAME,
    Key: {
      pk: `CHANNEL#${channel}`,
      sk: `SUBSCRIBER#${connectionId}`,
    },
  }));
  
  logger.info('Unsubscribed from channel', { userId, connectionId, channel });
}