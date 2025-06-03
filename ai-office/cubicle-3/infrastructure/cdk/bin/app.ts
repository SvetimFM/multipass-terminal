#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Config } from '../lib/config';
import { CoreInfrastructureStack } from '../lib/stacks/core-infrastructure-stack';
import { AuthenticationStack } from '../lib/stacks/authentication-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { ComputeStack } from '../lib/stacks/compute-stack';
import { AIIntegrationStack } from '../lib/stacks/ai-integration-stack';
import { BillingStack } from '../lib/stacks/billing-stack';
import { MonitoringStack } from '../lib/stacks/monitoring-stack';

const app = new cdk.App();

// Get environment from context
const environment = app.node.tryGetContext('environment') || 'dev';
const config = new Config(environment);

// Stack dependencies
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// Core Infrastructure Stack (VPC, S3, DynamoDB, etc.)
const coreStack = new CoreInfrastructureStack(app, `ai-office-${environment}-core-infrastructure`, {
  env,
  config,
  description: 'AI Office Core Infrastructure - VPC, Storage, and Database resources',
  tags: {
    Environment: environment,
    Project: 'ai-office',
    Stack: 'core-infrastructure',
  },
});

// Authentication Stack (Cognito)
const authStack = new AuthenticationStack(app, `ai-office-${environment}-authentication`, {
  env,
  config,
  encryptionKey: coreStack.encryptionKey,
  logGroup: coreStack.logGroup,
  description: 'AI Office Authentication - Cognito User Pool and Identity Pool',
  tags: {
    Environment: environment,
    Project: 'ai-office',
    Stack: 'authentication',
  },
});
authStack.addDependency(coreStack);

// API Stack (API Gateway, CloudFront)
const apiStack = new ApiStack(app, `ai-office-${environment}-api`, {
  env,
  config,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
  metadataTable: coreStack.metadataTable,
  usageTable: coreStack.usageTable,
  projectBucket: coreStack.projectBucket,
  staticAssetsBucket: coreStack.staticAssetsBucket,
  logGroup: coreStack.logGroup,
  description: 'AI Office API - REST API, WebSocket API, and CDN',
  tags: {
    Environment: environment,
    Project: 'ai-office',
    Stack: 'api',
  },
});
apiStack.addDependency(authStack);

// Compute Stack (ECS, Lambda, Step Functions)
const computeStack = new ComputeStack(app, `ai-office-${environment}-compute`, {
  env,
  config,
  vpc: coreStack.vpc,
  ecsCluster: coreStack.ecsCluster,
  taskExecutionRole: coreStack.taskExecutionRole,
  taskRole: coreStack.taskRole,
  metadataTable: coreStack.metadataTable,
  projectBucket: coreStack.projectBucket,
  logGroup: coreStack.logGroup,
  description: 'AI Office Compute - ECS Fargate, Lambda, and Step Functions',
  tags: {
    Environment: environment,
    Project: 'ai-office',
    Stack: 'compute',
  },
});
computeStack.addDependency(coreStack);

// AI Integration Stack (Bedrock, AI Orchestration)
const aiStack = new AIIntegrationStack(app, `ai-office-${environment}-ai-integration`, {
  env,
  config,
  metadataTable: coreStack.metadataTable,
  usageTable: coreStack.usageTable,
  projectBucket: coreStack.projectBucket,
  executionQueue: computeStack.executionQueue,
  notificationTopic: computeStack.notificationTopic,
  restApi: apiStack.restApi,
  logGroup: coreStack.logGroup,
  encryptionKey: coreStack.encryptionKey,
  description: 'AI Office AI Integration - Bedrock and AI Provider Integration',
  tags: {
    Environment: environment,
    Project: 'ai-office',
    Stack: 'ai-integration',
  },
});
aiStack.addDependency(computeStack);
aiStack.addDependency(apiStack);

// Billing Stack (Stripe Integration, Usage Tracking)
const billingStack = new BillingStack(app, `ai-office-${environment}-billing`, {
  env,
  config,
  metadataTable: coreStack.metadataTable,
  usageTable: coreStack.usageTable,
  restApi: apiStack.restApi,
  notificationTopic: computeStack.notificationTopic,
  logGroup: coreStack.logGroup,
  encryptionKey: coreStack.encryptionKey,
  description: 'AI Office Billing - Stripe Integration and Usage Tracking',
  tags: {
    Environment: environment,
    Project: 'ai-office',
    Stack: 'billing',
  },
});
billingStack.addDependency(apiStack);
billingStack.addDependency(computeStack);

// Monitoring Stack (CloudWatch, X-Ray, Alarms)
const monitoringStack = new MonitoringStack(app, `ai-office-${environment}-monitoring`, {
  env,
  config,
  logGroup: coreStack.logGroup,
  notificationTopic: computeStack.notificationTopic,
  restApiName: apiStack.restApi.restApiName,
  distributionId: apiStack.distribution.distributionId,
  userPoolId: authStack.userPool.userPoolId,
  description: 'AI Office Monitoring - CloudWatch Dashboards, Alarms, and Synthetics',
  tags: {
    Environment: environment,
    Project: 'ai-office',
    Stack: 'monitoring',
  },
});
monitoringStack.addDependency(apiStack);
monitoringStack.addDependency(authStack);
monitoringStack.addDependency(computeStack);

// Add stack outputs
new cdk.CfnOutput(app, 'EnvironmentOutput', {
  value: environment,
  description: 'Deployment environment',
});

new cdk.CfnOutput(app, 'RegionOutput', {
  value: env.region!,
  description: 'AWS region',
});

app.synth();