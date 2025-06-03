import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as waf from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import { Config } from '../config';
import * as path from 'path';

interface ApiStackProps extends cdk.StackProps {
  config: Config;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  metadataTable: dynamodb.Table;
  usageTable: dynamodb.Table;
  projectBucket: s3.Bucket;
  staticAssetsBucket: s3.Bucket;
  logGroup: logs.LogGroup;
}

export class ApiStack extends cdk.Stack {
  public readonly restApi: apigateway.RestApi;
  public readonly websocketApi: apigatewayv2.WebSocketApi;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { config, userPool, userPoolClient, metadataTable, usageTable, projectBucket, staticAssetsBucket, logGroup } = props;

    // Lambda Layer for shared dependencies
    const sharedLayer = new lambda.LayerVersion(this, 'SharedLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda/layers/shared')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Shared dependencies for Lambda functions',
    });

    // REST API
    this.restApi = new apigateway.RestApi(this, 'RestApi', {
      restApiName: `${config.prefix}-api`,
      description: 'AI Office REST API',
      defaultCorsPreflightOptions: {
        allowOrigins: config.isProd ? ['https://app.ai-office.dev'] : apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token'],
        allowCredentials: true,
      },
      deployOptions: {
        stageName: config.environment,
        tracingEnabled: true,
        dataTraceEnabled: !config.isProd,
        loggingLevel: config.isProd ? apigateway.MethodLoggingLevel.ERROR : apigateway.MethodLoggingLevel.INFO,
        accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
        throttlingBurstLimit: config.api.burstLimit,
        throttlingRateLimit: config.api.throttleLimit,
      },
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [new iam.AnyPrincipal()],
            actions: ['execute-api:Invoke'],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.DENY,
            principals: [new iam.AnyPrincipal()],
            actions: ['execute-api:Invoke'],
            resources: ['*'],
            conditions: {
              StringNotEquals: {
                'aws:SourceVpce': config.isProd ? 'vpce-prod-id' : undefined,
              },
            },
          }),
        ],
      }),
    });

    // Usage Plan for API rate limiting
    const usagePlan = new apigateway.UsagePlan(this, 'UsagePlan', {
      name: `${config.prefix}-usage-plan`,
      api: this.restApi,
      throttle: {
        burstLimit: config.api.burstLimit,
        rateLimit: config.api.throttleLimit,
      },
      quota: {
        limit: config.api.monthlyRequestQuota,
        period: apigateway.Period.MONTH,
      },
    });

    // Cognito Authorizer
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: `${config.prefix}-authorizer`,
      identitySource: 'method.request.header.Authorization',
    });

    // Lambda functions for API endpoints
    const projectsHandler = new lambdaNodejs.NodejsFunction(this, 'ProjectsHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../../lambda/handlers/projects.ts'),
      environment: {
        METADATA_TABLE_NAME: metadataTable.tableName,
        PROJECT_BUCKET_NAME: projectBucket.bucketName,
        USAGE_TABLE_NAME: usageTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: config.compute.defaultMemorySize,
      layers: [sharedLayer],
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
    });

    // Grant permissions
    metadataTable.grantReadWriteData(projectsHandler);
    projectBucket.grantReadWrite(projectsHandler);
    usageTable.grantWriteData(projectsHandler);

    // API Resources
    const v1 = this.restApi.root.addResource('v1');
    const projects = v1.addResource('projects');
    const projectById = projects.addResource('{projectId}');

    // Projects endpoints
    projects.addMethod('GET', new apigateway.LambdaIntegration(projectsHandler), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    projects.addMethod('POST', new apigateway.LambdaIntegration(projectsHandler), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    projectById.addMethod('GET', new apigateway.LambdaIntegration(projectsHandler), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    projectById.addMethod('PUT', new apigateway.LambdaIntegration(projectsHandler), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    projectById.addMethod('DELETE', new apigateway.LambdaIntegration(projectsHandler), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // WebSocket API for real-time communication
    const connectHandler = new lambdaNodejs.NodejsFunction(this, 'WebSocketConnectHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../../lambda/handlers/websocket/connect.ts'),
      environment: {
        METADATA_TABLE_NAME: metadataTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      layers: [sharedLayer],
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
    });

    const disconnectHandler = new lambdaNodejs.NodejsFunction(this, 'WebSocketDisconnectHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../../lambda/handlers/websocket/disconnect.ts'),
      environment: {
        METADATA_TABLE_NAME: metadataTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      layers: [sharedLayer],
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
    });

    const messageHandler = new lambdaNodejs.NodejsFunction(this, 'WebSocketMessageHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../../lambda/handlers/websocket/message.ts'),
      environment: {
        METADATA_TABLE_NAME: metadataTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      layers: [sharedLayer],
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
    });

    // Grant permissions
    metadataTable.grantReadWriteData(connectHandler);
    metadataTable.grantReadWriteData(disconnectHandler);
    metadataTable.grantReadWriteData(messageHandler);

    this.websocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      apiName: `${config.prefix}-websocket`,
      description: 'AI Office WebSocket API',
      connectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration('ConnectIntegration', connectHandler),
        authorizer: new apigatewayv2.WebSocketLambdaAuthorizer('WebSocketAuthorizer', connectHandler, {
          identitySource: ['route.request.querystring.token'],
        }),
      },
      disconnectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration('DisconnectIntegration', disconnectHandler),
      },
      defaultRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration('DefaultIntegration', messageHandler),
      },
    });

    const webSocketStage = new apigatewayv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi: this.websocketApi,
      stageName: config.environment,
      autoDeploy: true,
    });

    // Grant permission to send messages to WebSocket connections
    messageHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:${this.websocketApi.apiId}/*`],
    }));

    // WAF WebACL for API protection
    if (config.isProd) {
      const webAcl = new waf.CfnWebACL(this, 'WebAcl', {
        scope: 'REGIONAL',
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
          {
            name: 'CommonRuleSet',
            priority: 2,
            overrideAction: { none: {} },
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesCommonRuleSet',
              },
            },
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'CommonRuleSet',
            },
          },
        ],
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: 'WebAcl',
        },
      });

      new waf.CfnWebACLAssociation(this, 'WebAclAssociation', {
        resourceArn: this.restApi.deploymentStage.stageArn,
        webAclArn: webAcl.attrArn,
      });
    }

    // Static website hosting with CloudFront
    const oai = new cloudfront.OriginAccessIdentity(this, 'OAI', {
      comment: `OAI for ${config.prefix}`,
    });

    staticAssetsBucket.grantRead(oai);

    // Certificate for custom domain (if configured)
    let certificate: acm.Certificate | undefined;
    let hostedZone: route53.IHostedZone | undefined;

    if (config.domain && config.isProd) {
      hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
        domainName: config.domain.domainName,
      });

      certificate = new acm.Certificate(this, 'Certificate', {
        domainName: `app.${config.domain.domainName}`,
        subjectAlternativeNames: [`api.${config.domain.domainName}`],
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });
    }

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new cloudfrontOrigins.S3Origin(staticAssetsBucket, {
          originAccessIdentity: oai,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new cloudfrontOrigins.RestApiOrigin(this.restApi),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responsePagePath: '/index.html',
          responseHttpStatus: 200,
          ttl: cdk.Duration.minutes(5),
        },
      ],
      domainNames: config.domain && config.isProd ? [`app.${config.domain.domainName}`] : undefined,
      certificate,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableLogging: config.isProd,
      logBucket: config.isProd ? new s3.Bucket(this, 'LogBucket', {
        bucketName: `${config.prefix}-cloudfront-logs`,
        lifecycleRules: [{
          expiration: cdk.Duration.days(90),
        }],
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      }) : undefined,
    });

    // Route53 records for custom domain
    if (hostedZone && config.domain && config.isProd) {
      new route53.ARecord(this, 'AppRecord', {
        zone: hostedZone,
        recordName: `app.${config.domain.domainName}`,
        target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(this.distribution)),
      });

      new route53.ARecord(this, 'ApiRecord', {
        zone: hostedZone,
        recordName: `api.${config.domain.domainName}`,
        target: route53.RecordTarget.fromAlias(new route53Targets.RestApiDomainTarget(this.restApi)),
      });
    }

    // Outputs
    new cdk.CfnOutput(this, 'RestApiUrl', {
      value: this.restApi.url,
      exportName: `${config.prefix}-rest-api-url`,
    });

    new cdk.CfnOutput(this, 'WebSocketApiUrl', {
      value: webSocketStage.url,
      exportName: `${config.prefix}-websocket-api-url`,
    });

    new cdk.CfnOutput(this, 'DistributionDomain', {
      value: this.distribution.distributionDomainName,
      exportName: `${config.prefix}-distribution-domain`,
    });

    if (config.domain && config.isProd) {
      new cdk.CfnOutput(this, 'AppUrl', {
        value: `https://app.${config.domain.domainName}`,
        exportName: `${config.prefix}-app-url`,
      });
    }
  }
}