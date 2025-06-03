import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { Config } from '../config';
import * as path from 'path';

interface BillingStackProps extends cdk.StackProps {
  config: Config;
  metadataTable: dynamodb.Table;
  usageTable: dynamodb.Table;
  restApi: apigateway.RestApi;
  notificationTopic: sns.Topic;
  logGroup: logs.LogGroup;
  encryptionKey: kms.Key;
}

export class BillingStack extends cdk.Stack {
  public readonly stripeWebhookLambda: lambda.Function;
  public readonly usageAggregatorLambda: lambda.Function;
  public readonly billingTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: BillingStackProps) {
    super(scope, id, props);

    const { config, metadataTable, usageTable, restApi, notificationTopic, logGroup, encryptionKey } = props;

    // Billing table for subscriptions and invoices
    this.billingTable = new dynamodb.Table(this, 'BillingTable', {
      tableName: `${config.prefix}-billing`,
      partitionKey: { name: 'customerId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey,
      pointInTimeRecovery: true,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Always retain billing data
    });

    // GSI for querying by subscription status
    this.billingTable.addGlobalSecondaryIndex({
      indexName: 'subscription-status-index',
      partitionKey: { name: 'subscriptionStatus', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'updatedAt', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Stripe secrets
    const stripeSecrets = new secretsmanager.Secret(this, 'StripeSecrets', {
      secretName: `${config.prefix}-stripe-secrets`,
      description: 'Stripe API keys and webhook secret',
      encryptionKey,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          publishableKey: '',
          secretKey: '',
          webhookSecret: '',
        }),
        generateStringKey: 'placeholder',
      },
    });

    // Lambda Layer for Stripe SDK
    const stripeLayer = new lambda.LayerVersion(this, 'StripeLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda/layers/stripe')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Stripe SDK dependencies',
    });

    // Stripe Webhook Handler
    this.stripeWebhookLambda = new lambdaNodejs.NodejsFunction(this, 'StripeWebhookLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../../lambda/handlers/billing/stripe-webhook.ts'),
      environment: {
        STRIPE_SECRETS_ARN: stripeSecrets.secretArn,
        BILLING_TABLE_NAME: this.billingTable.tableName,
        METADATA_TABLE_NAME: metadataTable.tableName,
        NOTIFICATION_TOPIC_ARN: notificationTopic.topicArn,
      },
      timeout: cdk.Duration.minutes(2),
      memorySize: 512,
      layers: [stripeLayer],
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
    });

    // Grant permissions
    stripeSecrets.grantRead(this.stripeWebhookLambda);
    this.billingTable.grantReadWriteData(this.stripeWebhookLambda);
    metadataTable.grantReadWriteData(this.stripeWebhookLambda);
    notificationTopic.grantPublish(this.stripeWebhookLambda);

    // Subscription Management Lambda
    const subscriptionLambda = new lambdaNodejs.NodejsFunction(this, 'SubscriptionLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../../lambda/handlers/billing/subscription-management.ts'),
      environment: {
        STRIPE_SECRETS_ARN: stripeSecrets.secretArn,
        BILLING_TABLE_NAME: this.billingTable.tableName,
        METADATA_TABLE_NAME: metadataTable.tableName,
        STRIPE_PRICE_ID: config.billing.stripePriceId,
        FREE_TIER_REQUESTS: config.billing.freeTierRequests.toString(),
      },
      timeout: cdk.Duration.minutes(1),
      memorySize: 512,
      layers: [stripeLayer],
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
    });

    // Grant permissions
    stripeSecrets.grantRead(subscriptionLambda);
    this.billingTable.grantReadWriteData(subscriptionLambda);
    metadataTable.grantReadWriteData(subscriptionLambda);

    // Usage Aggregator Lambda
    this.usageAggregatorLambda = new lambdaNodejs.NodejsFunction(this, 'UsageAggregatorLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../../lambda/handlers/billing/usage-aggregator.ts'),
      environment: {
        USAGE_TABLE_NAME: usageTable.tableName,
        BILLING_TABLE_NAME: this.billingTable.tableName,
        METADATA_TABLE_NAME: metadataTable.tableName,
        STRIPE_SECRETS_ARN: stripeSecrets.secretArn,
        COST_PER_THOUSAND_REQUESTS: config.billing.costPerThousandRequests.toString(),
        FREE_TIER_REQUESTS: config.billing.freeTierRequests.toString(),
      },
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      layers: [stripeLayer],
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
    });

    // Grant permissions
    usageTable.grantReadData(this.usageAggregatorLambda);
    this.billingTable.grantReadWriteData(this.usageAggregatorLambda);
    metadataTable.grantReadData(this.usageAggregatorLambda);
    stripeSecrets.grantRead(this.usageAggregatorLambda);

    // EventBridge rule for daily usage aggregation
    new events.Rule(this, 'DailyUsageAggregation', {
      ruleName: `${config.prefix}-daily-usage-aggregation`,
      description: 'Trigger daily usage aggregation',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '2', // 2 AM UTC
      }),
      targets: [new eventsTargets.LambdaFunction(this.usageAggregatorLambda)],
    });

    // EventBridge rule for monthly billing
    new events.Rule(this, 'MonthlyBilling', {
      ruleName: `${config.prefix}-monthly-billing`,
      description: 'Trigger monthly billing cycle',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '4', // 4 AM UTC
        day: '1', // First day of month
      }),
      targets: [new eventsTargets.LambdaFunction(this.usageAggregatorLambda, {
        event: events.RuleTargetInput.fromObject({
          action: 'monthly-billing',
        }),
      })],
    });

    // Payment Method Lambda
    const paymentMethodLambda = new lambdaNodejs.NodejsFunction(this, 'PaymentMethodLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../../lambda/handlers/billing/payment-method.ts'),
      environment: {
        STRIPE_SECRETS_ARN: stripeSecrets.secretArn,
        BILLING_TABLE_NAME: this.billingTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      layers: [stripeLayer],
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
    });

    // Grant permissions
    stripeSecrets.grantRead(paymentMethodLambda);
    this.billingTable.grantReadWriteData(paymentMethodLambda);

    // Billing Analytics Lambda
    const billingAnalyticsLambda = new lambdaNodejs.NodejsFunction(this, 'BillingAnalyticsLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../../lambda/handlers/billing/analytics.ts'),
      environment: {
        BILLING_TABLE_NAME: this.billingTable.tableName,
        USAGE_TABLE_NAME: usageTable.tableName,
      },
      timeout: cdk.Duration.minutes(2),
      memorySize: 512,
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
    });

    // Grant permissions
    this.billingTable.grantReadData(billingAnalyticsLambda);
    usageTable.grantReadData(billingAnalyticsLambda);

    // API Gateway integration
    const billingResource = restApi.root.getResource('v1')?.addResource('billing') || restApi.root.addResource('billing');
    
    // Webhook endpoint (no auth required)
    const webhookResource = billingResource.addResource('webhook');
    webhookResource.addMethod('POST', new apigateway.LambdaIntegration(this.stripeWebhookLambda), {
      authorizationType: apigateway.AuthorizationType.NONE,
    });

    // Subscription endpoints (auth required)
    const subscriptionResource = billingResource.addResource('subscription');
    subscriptionResource.addMethod('GET', new apigateway.LambdaIntegration(subscriptionLambda), {
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    subscriptionResource.addMethod('POST', new apigateway.LambdaIntegration(subscriptionLambda), {
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    subscriptionResource.addMethod('DELETE', new apigateway.LambdaIntegration(subscriptionLambda), {
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Payment method endpoints
    const paymentResource = billingResource.addResource('payment-method');
    paymentResource.addMethod('GET', new apigateway.LambdaIntegration(paymentMethodLambda), {
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    paymentResource.addMethod('POST', new apigateway.LambdaIntegration(paymentMethodLambda), {
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    paymentResource.addMethod('DELETE', new apigateway.LambdaIntegration(paymentMethodLambda), {
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Analytics endpoints
    const analyticsResource = billingResource.addResource('analytics');
    analyticsResource.addMethod('GET', new apigateway.LambdaIntegration(billingAnalyticsLambda), {
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // CloudWatch Metrics and Alarms
    const failedPaymentMetric = new cloudwatch.Metric({
      namespace: 'AIOffice/Billing',
      metricName: 'FailedPayments',
      dimensionsMap: {
        Environment: config.environment,
      },
    });

    new cloudwatch.Alarm(this, 'FailedPaymentAlarm', {
      metric: failedPaymentMetric,
      threshold: 5,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'High rate of failed payments',
    }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(notificationTopic));

    const revenueMetric = new cloudwatch.Metric({
      namespace: 'AIOffice/Billing',
      metricName: 'MonthlyRevenue',
      dimensionsMap: {
        Environment: config.environment,
      },
      statistic: 'Sum',
      period: cdk.Duration.days(30),
    });

    // Custom CloudWatch Dashboard for billing
    if (config.isProd) {
      new cloudwatch.Dashboard(this, 'BillingDashboard', {
        dashboardName: `${config.prefix}-billing`,
        widgets: [
          [
            new cloudwatch.GraphWidget({
              title: 'Monthly Revenue',
              left: [revenueMetric],
            }),
            new cloudwatch.GraphWidget({
              title: 'Failed Payments',
              left: [failedPaymentMetric],
            }),
          ],
          [
            new cloudwatch.SingleValueWidget({
              title: 'Active Subscriptions',
              metrics: [new cloudwatch.Metric({
                namespace: 'AIOffice/Billing',
                metricName: 'ActiveSubscriptions',
                dimensionsMap: {
                  Environment: config.environment,
                },
              })],
            }),
            new cloudwatch.SingleValueWidget({
              title: 'Free Tier Users',
              metrics: [new cloudwatch.Metric({
                namespace: 'AIOffice/Billing',
                metricName: 'FreeTierUsers',
                dimensionsMap: {
                  Environment: config.environment,
                },
              })],
            }),
          ],
        ],
      });
    }

    // Outputs
    new cdk.CfnOutput(this, 'BillingTableName', {
      value: this.billingTable.tableName,
      exportName: `${config.prefix}-billing-table`,
    });

    new cdk.CfnOutput(this, 'StripeWebhookUrl', {
      value: `${restApi.url}v1/billing/webhook`,
      exportName: `${config.prefix}-stripe-webhook-url`,
    });
  }
}