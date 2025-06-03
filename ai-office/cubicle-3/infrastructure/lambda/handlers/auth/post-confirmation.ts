import { PostConfirmationTriggerHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const METADATA_TABLE_NAME = process.env.METADATA_TABLE_NAME!;

export const handler: PostConfirmationTriggerHandler = async (event) => {
  console.log('Post-confirmation trigger', event);

  const { userAttributes } = event.request;
  const userId = event.request.userAttributes.sub;
  const timestamp = Date.now();

  // Create user profile
  await dynamoClient.send(new PutCommand({
    TableName: METADATA_TABLE_NAME,
    Item: {
      pk: `USER#${userId}`,
      sk: 'PROFILE',
      userId,
      email: userAttributes.email,
      name: userAttributes.name || userAttributes.email.split('@')[0],
      createdAt: timestamp,
      updatedAt: timestamp,
      tier: 'free',
      settings: {
        theme: 'light',
        notifications: true,
        defaultModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
      },
    },
  }));

  // Initialize usage tracking
  await dynamoClient.send(new PutCommand({
    TableName: METADATA_TABLE_NAME,
    Item: {
      pk: `USER#${userId}`,
      sk: 'USAGE#CURRENT',
      userId,
      period: new Date().toISOString().slice(0, 7), // YYYY-MM
      requests: 0,
      tokens: 0,
      storage: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  }));

  return event;
};