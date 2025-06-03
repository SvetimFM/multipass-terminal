import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as synthetics from 'aws-cdk-lib/aws-synthetics';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as xray from 'aws-cdk-lib/aws-xray';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';
import { Config } from '../config';
import * as path from 'path';

interface MonitoringStackProps extends cdk.StackProps {
  config: Config;
  logGroup: logs.LogGroup;
  notificationTopic: sns.Topic;
  restApiName: string;
  distributionId: string;
  userPoolId: string;
}

export class MonitoringStack extends cdk.Stack {
  public readonly dashboard: cloudwatch.Dashboard;
  public readonly alertTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const { config, logGroup, notificationTopic, restApiName, distributionId, userPoolId } = props;

    // Alert topic for critical issues
    this.alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: `${config.prefix}-critical-alerts`,
      displayName: 'AI Office Critical Alerts',
    });

    // Subscribe email for production alerts
    if (config.monitoring.alarmEmail) {
      this.alertTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(config.monitoring.alarmEmail)
      );
    }

    // Slack integration Lambda
    const slackNotifierLambda = new lambdaNodejs.NodejsFunction(this, 'SlackNotifierLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../../lambda/handlers/monitoring/slack-notifier.ts'),
      environment: {
        SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL || '',
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logGroup,
    });

    // Subscribe Slack notifier to alert topic
    this.alertTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(slackNotifierLambda)
    );

    // Log Insights queries
    const errorLogsInsightQuery = new logs.QueryDefinition(this, 'ErrorLogsQuery', {
      queryDefinitionName: `${config.prefix}-error-logs`,
      queryString: `
        fields @timestamp, @message, @logStream
        | filter @message like /ERROR/
        | sort @timestamp desc
        | limit 100
      `,
      logGroups: [logGroup],
    });

    const performanceLogsInsightQuery = new logs.QueryDefinition(this, 'PerformanceLogsQuery', {
      queryDefinitionName: `${config.prefix}-performance-logs`,
      queryString: `
        fields @timestamp, @duration, @type, @requestId
        | filter @type = "REPORT"
        | stats avg(@duration) as avg_duration, max(@duration) as max_duration by bin(5m)
      `,
      logGroups: [logGroup],
    });

    // Metric filters
    const errorLogMetricFilter = new logs.MetricFilter(this, 'ErrorLogMetricFilter', {
      logGroup,
      metricNamespace: 'AIOffice/Logs',
      metricName: 'Errors',
      filterPattern: logs.FilterPattern.literal('[ERROR]'),
      metricValue: '1',
      defaultValue: 0,
    });

    const authFailureMetricFilter = new logs.MetricFilter(this, 'AuthFailureMetricFilter', {
      logGroup,
      metricNamespace: 'AIOffice/Security',
      metricName: 'AuthFailures',
      filterPattern: logs.FilterPattern.literal('Authentication failed'),
      metricValue: '1',
      defaultValue: 0,
    });

    // Synthetic canary for API health checks
    const canaryBucket = new s3.Bucket(this, 'CanaryBucket', {
      bucketName: `${config.prefix}-canary-artifacts`,
      lifecycleRules: [{
        expiration: cdk.Duration.days(30),
      }],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const canaryRole = new iam.Role(this, 'CanaryRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchSyntheticsFullAccess'),
      ],
    });

    canaryBucket.grantReadWrite(canaryRole);

    const apiCanary = new synthetics.Canary(this, 'ApiCanary', {
      canaryName: `${config.prefix}-api-health`,
      runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_5_1,
      test: synthetics.Test.custom({
        code: synthetics.Code.fromAsset(path.join(__dirname, '../../../lambda/canaries')),
        handler: 'api-health.handler',
      }),
      schedule: synthetics.Schedule.rate(cdk.Duration.minutes(5)),
      environmentVariables: {
        API_ENDPOINT: `https://${restApiName}.execute-api.${this.region}.amazonaws.com/${config.environment}`,
      },
      role: canaryRole,
      artifactsBucketLocation: {
        bucket: canaryBucket,
      },
      successRetentionPeriod: cdk.Duration.days(7),
      failureRetentionPeriod: cdk.Duration.days(30),
    });

    // Custom metrics Lambda
    const metricsCollectorLambda = new lambdaNodejs.NodejsFunction(this, 'MetricsCollectorLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../../lambda/handlers/monitoring/metrics-collector.ts'),
      environment: {
        METRIC_NAMESPACE: 'AIOffice/Custom',
      },
      timeout: cdk.Duration.minutes(2),
      memorySize: 512,
      logGroup,
    });

    // Grant CloudWatch permissions
    metricsCollectorLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
    }));

    // EventBridge rule for periodic metrics collection
    new events.Rule(this, 'MetricsCollectionRule', {
      ruleName: `${config.prefix}-metrics-collection`,
      description: 'Trigger custom metrics collection',
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      targets: [new eventsTargets.LambdaFunction(metricsCollectorLambda)],
    });

    // Core alarms
    const apiErrorRateAlarm = new cloudwatch.Alarm(this, 'ApiErrorRateAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '4XXError',
        dimensionsMap: {
          ApiName: restApiName,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 50,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'High API 4XX error rate',
    });

    const api5xxErrorAlarm = new cloudwatch.Alarm(this, 'Api5xxErrorAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        dimensionsMap: {
          ApiName: restApiName,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'API 5XX errors detected',
    });

    const lambdaThrottleAlarm = new cloudwatch.Alarm(this, 'LambdaThrottleAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Throttles',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Lambda functions being throttled',
    });

    const cognitoSignInFailuresAlarm = new cloudwatch.Alarm(this, 'CognitoSignInFailuresAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Cognito',
        metricName: 'SignInFailures',
        dimensionsMap: {
          UserPool: userPoolId,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(15),
      }),
      threshold: 20,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'High rate of sign-in failures',
    });

    const cloudfrontOriginLatencyAlarm = new cloudwatch.Alarm(this, 'CloudFrontOriginLatencyAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/CloudFront',
        metricName: 'OriginLatency',
        dimensionsMap: {
          DistributionId: distributionId,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1000, // 1 second
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'High CloudFront origin latency',
    });

    // Add alarm actions
    [
      apiErrorRateAlarm,
      api5xxErrorAlarm,
      lambdaThrottleAlarm,
      cognitoSignInFailuresAlarm,
      cloudfrontOriginLatencyAlarm,
    ].forEach(alarm => {
      alarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
    });

    // Composite alarms for critical scenarios
    const criticalSystemFailure = new cloudwatch.CompositeAlarm(this, 'CriticalSystemFailure', {
      compositeAlarmName: `${config.prefix}-critical-system-failure`,
      alarmRule: cloudwatch.AlarmRule.anyOf(
        cloudwatch.AlarmRule.fromAlarm(api5xxErrorAlarm, cloudwatch.AlarmState.ALARM),
        cloudwatch.AlarmRule.allOf(
          cloudwatch.AlarmRule.fromAlarm(apiErrorRateAlarm, cloudwatch.AlarmState.ALARM),
          cloudwatch.AlarmRule.fromAlarm(lambdaThrottleAlarm, cloudwatch.AlarmState.ALARM),
        ),
      ),
      alarmDescription: 'Critical system failure detected',
    });

    criticalSystemFailure.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));

    // Main monitoring dashboard
    this.dashboard = new cloudwatch.Dashboard(this, 'MainDashboard', {
      dashboardName: `${config.prefix}-main`,
      defaultInterval: cdk.Duration.hours(1),
    });

    // API metrics row
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Request Count',
        left: [new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: 'Count',
          dimensionsMap: { ApiName: restApiName },
          statistic: 'Sum',
        })],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Latency',
        left: [new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: 'Latency',
          dimensionsMap: { ApiName: restApiName },
          statistic: 'Average',
        })],
        right: [new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: 'Latency',
          dimensionsMap: { ApiName: restApiName },
          statistic: 'p99',
        })],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Errors',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '4XXError',
            dimensionsMap: { ApiName: restApiName },
            statistic: 'Sum',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '5XXError',
            dimensionsMap: { ApiName: restApiName },
            statistic: 'Sum',
          }),
        ],
        width: 8,
      }),
    );

    // Lambda metrics row
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Invocations',
        left: [new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Invocations',
          statistic: 'Sum',
        })],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration',
        left: [new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          statistic: 'Average',
        })],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors & Throttles',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Errors',
            statistic: 'Sum',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Throttles',
            statistic: 'Sum',
          }),
        ],
        width: 8,
      }),
    );

    // System health row
    this.dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'System Health Score',
        metrics: [new cloudwatch.Metric({
          namespace: 'AIOffice/Custom',
          metricName: 'HealthScore',
          statistic: 'Average',
        })],
        width: 6,
      }),
      new cloudwatch.AlarmStatusWidget({
        title: 'Alarm Status',
        alarms: [
          apiErrorRateAlarm,
          api5xxErrorAlarm,
          lambdaThrottleAlarm,
          criticalSystemFailure,
        ],
        width: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Active Users',
        left: [new cloudwatch.Metric({
          namespace: 'AWS/Cognito',
          metricName: 'SignInSuccesses',
          dimensionsMap: { UserPool: userPoolId },
          statistic: 'Sum',
          period: cdk.Duration.hours(1),
        })],
        width: 6,
      }),
      new cloudwatch.LogQueryWidget({
        title: 'Recent Errors',
        logGroupNames: [logGroup.logGroupName],
        queryLines: [
          'fields @timestamp, @message',
          'filter @message like /ERROR/',
          'sort @timestamp desc',
          'limit 10',
        ],
        width: 6,
      }),
    );

    // X-Ray service map
    if (config.isProd) {
      const xrayServiceMap = new xray.CfnGroup(this, 'XRayServiceMap', {
        groupName: `${config.prefix}-service-map`,
        filterExpression: `service("${config.prefix}")`,
      });
    }

    // Outputs
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.dashboard.dashboardName}`,
      exportName: `${config.prefix}-dashboard-url`,
    });

    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: this.alertTopic.topicArn,
      exportName: `${config.prefix}-alert-topic-arn`,
    });
  }
}