import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigatewayv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as path from 'path';
import { AuthConstruct } from './auth-constructs';

export class BedrockServerlessStackV2 extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const environment = this.node.tryGetContext('environment') || 'dev';

    // Auth construct
    const auth = new AuthConstruct(this, 'Auth', { environment });

    // Usage tracking table
    const usageTable = new dynamodb.Table(this, 'UsageTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Add GSI for rate limiting checks
    usageTable.addGlobalSecondaryIndex({
      indexName: 'userIdHourlyIndex',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'hourlyBucket', type: dynamodb.AttributeType.STRING },
    });

    // Sessions table with encryption
    const sessionsTable = new dynamodb.Table(this, 'SessionsTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // S3 buckets with encryption
    const contextBucket = new s3.Bucket(this, 'ContextBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{
        id: 'delete-old-contexts',
        expiration: cdk.Duration.days(1),
      }],
      cors: [{
        allowedOrigins: [`https://${cdk.Aws.ACCOUNT_ID}.cloudfront.net`],
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
        allowedHeaders: ['Authorization', 'Content-Type'],
      }],
    });

    // UI hosting bucket
    const uiBucket = new s3.Bucket(this, 'UIBucket', {
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      publicReadAccess: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // GitHub secrets
    const githubSecret = new secretsmanager.Secret(this, 'GitHubSecret', {
      description: 'GitHub App credentials',
      secretObjectValue: {
        appId: cdk.SecretValue.unsafePlainText('REPLACE_WITH_APP_ID'),
        privateKey: cdk.SecretValue.unsafePlainText('REPLACE_WITH_PRIVATE_KEY'),
      },
    });

    // Lambda execution role with restricted permissions
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess'),
      ],
    });

    // Bedrock permissions - restricted to specific models
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0`,
        `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
        `arn:aws:bedrock:${this.region}::foundation-model/meta.llama3-2-11b-instruct-v1:0`,
        `arn:aws:bedrock:${this.region}::foundation-model/meta.llama3-2-90b-instruct-v1:0`,
      ],
    }));

    // Lambda layer for shared dependencies
    const sharedLayer = new lambda.LayerVersion(this, 'SharedLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../layers/shared')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Shared utilities and AWS SDK',
    });

    // WebSocket API with authorizer
    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      connectRouteOptions: {
        authorizer: new apigatewayv2Authorizers.WebSocketLambdaAuthorizer(
          'WebSocketAuthorizer',
          auth.authorizer,
          {
            identitySource: ['route.request.header.Authorization'],
          }
        ),
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'ConnectIntegration',
          new lambdaNodejs.NodejsFunction(this, 'ConnectHandler', {
            entry: path.join(__dirname, '../lambda/websocket/connect-v2.ts'),
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_20_X,
            role: lambdaRole,
            layers: [sharedLayer],
            tracing: lambda.Tracing.ACTIVE,
            environment: {
              SESSIONS_TABLE: sessionsTable.tableName,
              USAGE_TABLE: usageTable.tableName,
            },
          })
        ),
      },
      disconnectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'DisconnectIntegration',
          new lambdaNodejs.NodejsFunction(this, 'DisconnectHandler', {
            entry: path.join(__dirname, '../lambda/websocket/disconnect-v2.ts'),
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_20_X,
            role: lambdaRole,
            layers: [sharedLayer],
            tracing: lambda.Tracing.ACTIVE,
            environment: {
              SESSIONS_TABLE: sessionsTable.tableName,
            },
          })
        ),
      },
    });

    // WebSocket Stage
    const webSocketStage = new apigatewayv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi,
      stageName: environment,
      autoDeploy: true,
      throttle: {
        rateLimit: 100,
        burstLimit: 200,
      },
    });

    // Message handler with rate limiting
    const messageHandler = new lambdaNodejs.NodejsFunction(this, 'MessageHandler', {
      entry: path.join(__dirname, '../lambda/websocket/message-v2.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      role: lambdaRole,
      layers: [sharedLayer],
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        SESSIONS_TABLE: sessionsTable.tableName,
        USAGE_TABLE: usageTable.tableName,
        CONTEXT_BUCKET: contextBucket.bucketName,
        WEBSOCKET_ENDPOINT: `${webSocketApi.apiEndpoint}/${webSocketStage.stageName}`,
        BEDROCK_HANDLER_NAME: '',
        GITHUB_HANDLER_NAME: '',
        RATE_LIMIT_PER_MINUTE: '100',
        TOKEN_LIMIT_PER_HOUR: '10000',
      },
    });

    // Add default route
    webSocketApi.addRoute('$default', {
      integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
        'DefaultIntegration',
        messageHandler
      ),
      authorizer: new apigatewayv2Authorizers.WebSocketLambdaAuthorizer(
        'MessageAuthorizer',
        auth.authorizer,
        {
          identitySource: ['route.request.header.Authorization'],
        }
      ),
    });

    // Bedrock handler
    const bedrockHandler = new lambdaNodejs.NodejsFunction(this, 'BedrockHandler', {
      entry: path.join(__dirname, '../lambda/bedrock/invoke-v2.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      role: lambdaRole,
      layers: [sharedLayer],
      timeout: cdk.Duration.minutes(5),
      memorySize: 3008,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        CONTEXT_BUCKET: contextBucket.bucketName,
        USAGE_TABLE: usageTable.tableName,
      },
    });

    // GitHub handler
    const githubHandler = new lambdaNodejs.NodejsFunction(this, 'GitHubHandler', {
      entry: path.join(__dirname, '../lambda/github/handler-v2.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      role: lambdaRole,
      layers: [sharedLayer],
      timeout: cdk.Duration.minutes(2),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        GITHUB_SECRET_ARN: githubSecret.secretArn,
      },
    });

    // Update message handler with function names
    messageHandler.addEnvironment('BEDROCK_HANDLER_NAME', bedrockHandler.functionName);
    messageHandler.addEnvironment('GITHUB_HANDLER_NAME', githubHandler.functionName);

    // HTTP API for auth and GitHub operations
    const httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: [`https://${cdk.Aws.ACCOUNT_ID}.cloudfront.net`],
        allowMethods: [apigatewayv2.CorsHttpMethod.ANY],
        allowHeaders: ['Authorization', 'Content-Type'],
        allowCredentials: true,
      },
    });

    // Add auth routes
    httpApi.addRoutes({
      path: '/auth/{proxy+}',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        'AuthIntegration',
        new lambdaNodejs.NodejsFunction(this, 'AuthHandler', {
          entry: path.join(__dirname, '../lambda/auth/handler.ts'),
          handler: 'handler',
          runtime: lambda.Runtime.NODEJS_20_X,
          environment: {
            USER_POOL_ID: auth.userPool.userPoolId,
            CLIENT_ID: auth.userPoolClient.userPoolClientId,
          },
        })
      ),
    });

    // GitHub routes with JWT authorizer
    const jwtAuthorizer = new apigatewayv2Authorizers.HttpJwtAuthorizer('JwtAuthorizer', {
      jwtIssuer: `https://cognito-idp.${this.region}.amazonaws.com/${auth.userPool.userPoolId}`,
      jwtAudience: [auth.userPoolClient.userPoolClientId],
    });

    httpApi.addRoutes({
      path: '/github/{proxy+}',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        'GitHubIntegration',
        githubHandler
      ),
      authorizer: jwtAuthorizer,
    });

    // Grant permissions
    sessionsTable.grantReadWriteData(lambdaRole);
    usageTable.grantReadWriteData(lambdaRole);
    contextBucket.grantReadWrite(lambdaRole);
    githubSecret.grantRead(lambdaRole);
    bedrockHandler.grantInvoke(lambdaRole);
    githubHandler.grantInvoke(lambdaRole);

    // CloudFront distribution with WAF
    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      rules: [
        {
          name: 'RateLimitRule',
          priority: 1,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 2000,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRule',
          },
        },
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'WebAcl',
      },
    });

    const oai = new cloudfront.OriginAccessIdentity(this, 'OAI');
    uiBucket.grantRead(oai);

    const distribution = new cloudfront.Distribution(this, 'UIDistribution', {
      defaultBehavior: {
        origin: new cloudfrontOrigins.S3Origin(uiBucket, { originAccessIdentity: oai }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [{
        httpStatus: 404,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
      }],
      webAclId: webAcl.attrArn,
    });

    // Deploy client files
    new s3deploy.BucketDeployment(this, 'UIDeployment', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../../client'))],
      destinationBucket: uiBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // CloudWatch Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `bedrock-ide-${environment}`,
    });

    // Add widgets
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Invocations',
        left: [messageHandler.metricInvocations()],
        right: [messageHandler.metricErrors()],
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway Requests',
        left: [webSocketApi.metric('Count')],
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Consumed Capacity',
        left: [sessionsTable.metricConsumedReadCapacityUnits()],
        right: [sessionsTable.metricConsumedWriteCapacityUnits()],
      }),
    );

    // Cost alarm
    new cloudwatch.Alarm(this, 'CostAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Billing',
        metricName: 'EstimatedCharges',
        dimensionsMap: {
          Currency: 'USD',
        },
        statistic: 'Maximum',
        period: cdk.Duration.hours(6),
      }),
      threshold: 100,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: auth.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: auth.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'WebSocketUrl', {
      value: `${webSocketApi.apiEndpoint}/${environment}`,
      description: 'WebSocket API endpoint',
    });

    new cdk.CfnOutput(this, 'HttpApiUrl', {
      value: httpApi.apiEndpoint || '',
      description: 'HTTP API endpoint',
    });

    new cdk.CfnOutput(this, 'DistributionUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL',
    });

    new cdk.CfnOutput(this, 'GitHubSecretArn', {
      value: githubSecret.secretArn,
      description: 'ARN of GitHub credentials secret (update with actual values)',
    });
  }
}