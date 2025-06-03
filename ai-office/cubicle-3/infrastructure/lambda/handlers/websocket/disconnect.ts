import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { MetricUnits } from '@aws-lambda-powertools/metrics';

const logger = new Logger({ serviceName: 'websocket-disconnect' });
const tracer = new Tracer({ serviceName: 'websocket-disconnect' });
const metrics = new Metrics({ namespace: 'AIOffice/WebSocket', serviceName: 'websocket-disconnect' });

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const METADATA_TABLE_NAME = process.env.METADATA_TABLE_NAME!;

export const handler: APIGatewayProxyHandler = tracer.captureLambdaHandler(async (event) => {
  logger.info('WebSocket disconnection', { 
    connectionId: event.requestContext.connectionId,
    routeKey: event.requestContext.routeKey,
  });

  const connectionId = event.requestContext.connectionId!;

  try {
    // Get connection metadata
    const connectionResult = await dynamoClient.send(new GetCommand({
      TableName: METADATA_TABLE_NAME,
      Key: {
        pk: `CONNECTION#${connectionId}`,
        sk: 'METADATA',
      },
    }));

    if (connectionResult.Item) {
      const userId = connectionResult.Item.userId;
      
      // Delete connection by connectionId
      await dynamoClient.send(new DeleteCommand({
        TableName: METADATA_TABLE_NAME,
        Key: {
          pk: `CONNECTION#${connectionId}`,
          sk: 'METADATA',
        },
      }));

      // Delete connection by userId
      await dynamoClient.send(new DeleteCommand({
        TableName: METADATA_TABLE_NAME,
        Key: {
          pk: `USER#${userId}`,
          sk: `CONNECTION#${connectionId}`,
        },
      }));

      // Update connection duration metrics
      const duration = Date.now() - connectionResult.Item.connectedAt;
      metrics.addMetric('ConnectionDuration', MetricUnits.Milliseconds, duration);
      metrics.addMetadata('userId', userId);
      
      logger.info('WebSocket disconnected successfully', { connectionId, userId, duration });
    } else {
      logger.warn('Connection not found', { connectionId });
    }

    metrics.addMetric('DisconnectionsProcessed', MetricUnits.Count, 1);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Disconnected' }),
    };
  } catch (error) {
    logger.error('Failed to process disconnection', { error, connectionId });
    metrics.addMetric('DisconnectionsFailed', MetricUnits.Count, 1);

    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  } finally {
    metrics.publishStoredMetrics();
  }
});