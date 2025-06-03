import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as stepfunctionsTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as autoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import { Config } from '../config';
import * as path from 'path';

interface ComputeStackProps extends cdk.StackProps {
  config: Config;
  vpc: ec2.Vpc;
  ecsCluster: ecs.Cluster;
  taskExecutionRole: iam.Role;
  taskRole: iam.Role;
  metadataTable: dynamodb.Table;
  projectBucket: s3.Bucket;
  logGroup: logs.LogGroup;
}

export class ComputeStack extends cdk.Stack {
  public readonly terminalTaskDefinition: ecs.FargateTaskDefinition;
  public readonly executionQueue: sqs.Queue;
  public readonly notificationTopic: sns.Topic;
  public readonly orchestratorStateMachine: stepfunctions.StateMachine;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const { config, vpc, ecsCluster, taskExecutionRole, taskRole, metadataTable, projectBucket, logGroup } = props;

    // ECR Repository for terminal container
    const terminalRepository = new ecr.Repository(this, 'TerminalRepository', {
      repositoryName: `${config.prefix}-terminal`,
      imageScanOnPush: true,
      lifecycleRules: [{
        description: 'Keep only last 10 images',
        maxImageCount: 10,
      }],
      removalPolicy: config.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Dead Letter Queue for failed executions
    const dlq = new sqs.Queue(this, 'ExecutionDLQ', {
      queueName: `${config.prefix}-execution-dlq`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    // Main execution queue
    this.executionQueue = new sqs.Queue(this, 'ExecutionQueue', {
      queueName: `${config.prefix}-execution-queue`,
      visibilityTimeout: cdk.Duration.seconds(config.compute.defaultTimeout + 60),
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: 3,
      },
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    // SNS Topic for notifications
    this.notificationTopic = new sns.Topic(this, 'NotificationTopic', {
      topicName: `${config.prefix}-notifications`,
      displayName: 'AI Office Notifications',
    });

    // Fargate Task Definition for terminal execution
    this.terminalTaskDefinition = new ecs.FargateTaskDefinition(this, 'TerminalTaskDefinition', {
      family: `${config.prefix}-terminal`,
      cpu: 2048,
      memoryLimitMiB: 4096,
      taskRole,
      executionRole: taskExecutionRole,
    });

    // Add container to task definition
    const terminalContainer = this.terminalTaskDefinition.addContainer('terminal', {
      image: ecs.ContainerImage.fromEcrRepository(terminalRepository, 'latest'),
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'terminal',
        logGroup,
      }),
      environment: {
        NODE_ENV: config.environment,
        METADATA_TABLE_NAME: metadataTable.tableName,
        PROJECT_BUCKET_NAME: projectBucket.bucketName,
        NOTIFICATION_TOPIC_ARN: this.notificationTopic.topicArn,
      },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:3000/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // Grant permissions to container
    this.notificationTopic.grantPublish(taskRole);

    // Lambda function for task orchestration
    const taskOrchestratorLambda = new lambdaNodejs.NodejsFunction(this, 'TaskOrchestratorLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../../lambda/handlers/compute/task-orchestrator.ts'),
      environment: {
        ECS_CLUSTER_NAME: ecsCluster.clusterName,
        TASK_DEFINITION_ARN: this.terminalTaskDefinition.taskDefinitionArn,
        SUBNET_IDS: vpc.privateSubnets.map(subnet => subnet.subnetId).join(','),
        SECURITY_GROUP_ID: new ec2.SecurityGroup(this, 'TaskSecurityGroup', {
          vpc,
          description: 'Security group for Fargate tasks',
          allowAllOutbound: true,
        }).securityGroupId,
        METADATA_TABLE_NAME: metadataTable.tableName,
        NOTIFICATION_TOPIC_ARN: this.notificationTopic.topicArn,
      },
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
    });

    // Grant permissions
    taskOrchestratorLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ecs:RunTask', 'ecs:DescribeTasks', 'ecs:StopTask'],
      resources: [
        this.terminalTaskDefinition.taskDefinitionArn,
        `arn:aws:ecs:${this.region}:${this.account}:task/${ecsCluster.clusterName}/*`,
      ],
    }));

    taskOrchestratorLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [taskExecutionRole.roleArn, taskRole.roleArn],
    }));

    metadataTable.grantReadWriteData(taskOrchestratorLambda);
    this.notificationTopic.grantPublish(taskOrchestratorLambda);

    // Step Functions State Machine for complex workflows
    const startTaskState = new stepfunctionsTasks.LambdaInvoke(this, 'StartTask', {
      lambdaFunction: taskOrchestratorLambda,
      outputPath: '$.Payload',
    });

    const waitState = new stepfunctions.Wait(this, 'WaitForTask', {
      time: stepfunctions.WaitTime.duration(cdk.Duration.seconds(30)),
    });

    const checkTaskState = new stepfunctionsTasks.LambdaInvoke(this, 'CheckTask', {
      lambdaFunction: taskOrchestratorLambda,
      outputPath: '$.Payload',
    });

    const taskSucceeded = new stepfunctions.Succeed(this, 'TaskSucceeded');
    const taskFailed = new stepfunctions.Fail(this, 'TaskFailed');

    const definition = startTaskState
      .next(waitState)
      .next(checkTaskState)
      .next(new stepfunctions.Choice(this, 'TaskComplete?')
        .when(stepfunctions.Condition.stringEquals('$.status', 'COMPLETED'), taskSucceeded)
        .when(stepfunctions.Condition.stringEquals('$.status', 'FAILED'), taskFailed)
        .otherwise(waitState));

    this.orchestratorStateMachine = new stepfunctions.StateMachine(this, 'OrchestratorStateMachine', {
      stateMachineName: `${config.prefix}-orchestrator`,
      definition,
      timeout: cdk.Duration.hours(2),
      tracingEnabled: true,
      logs: {
        destination: logGroup,
        level: stepfunctions.LogLevel.ALL,
      },
    });

    // Lambda function for queue processing
    const queueProcessorLambda = new lambdaNodejs.NodejsFunction(this, 'QueueProcessorLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../../lambda/handlers/compute/queue-processor.ts'),
      environment: {
        STATE_MACHINE_ARN: this.orchestratorStateMachine.stateMachineArn,
        METADATA_TABLE_NAME: metadataTable.tableName,
      },
      timeout: cdk.Duration.minutes(1),
      memorySize: 256,
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
      reservedConcurrentExecutions: config.compute.maxConcurrentExecutions,
    });

    // Grant permissions
    this.orchestratorStateMachine.grantStartExecution(queueProcessorLambda);
    metadataTable.grantReadWriteData(queueProcessorLambda);

    // SQS event source
    queueProcessorLambda.addEventSource(new lambda.EventSourceMapping(this, 'QueueEventSource', {
      eventSourceArn: this.executionQueue.queueArn,
      batchSize: 10,
      maxBatchingWindow: cdk.Duration.seconds(5),
    }));

    // Auto-scaling for Fargate Service (for long-running tasks)
    const fargateService = new ecs.FargateService(this, 'TerminalService', {
      cluster: ecsCluster,
      taskDefinition: this.terminalTaskDefinition,
      desiredCount: 0, // Start with 0, scale based on demand
      assignPublicIp: false,
      vpcSubnets: {
        subnets: vpc.privateSubnets,
      },
      capacityProviderStrategies: config.compute.fargateSpotEnabled ? [
        {
          capacityProvider: 'FARGATE_SPOT',
          weight: 80,
          base: 0,
        },
        {
          capacityProvider: 'FARGATE',
          weight: 20,
          base: 1,
        },
      ] : undefined,
    });

    // Auto-scaling configuration
    const scalingTarget = fargateService.autoScaleTaskCount({
      minCapacity: 0,
      maxCapacity: config.compute.maxConcurrentExecutions,
    });

    // Scale based on queue depth
    scalingTarget.scaleOnMetric('QueueDepthScaling', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/SQS',
        metricName: 'ApproximateNumberOfMessagesVisible',
        dimensionsMap: {
          QueueName: this.executionQueue.queueName,
        },
        statistic: 'Average',
      }),
      scalingSteps: [
        { upper: 0, change: -1 },
        { lower: 1, change: 1 },
        { lower: 10, change: 5 },
        { lower: 50, change: 10 },
      ],
      adjustmentType: autoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
      cooldown: cdk.Duration.seconds(60),
    });

    // CloudWatch Alarms
    new cloudwatch.Alarm(this, 'QueueDepthAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/SQS',
        metricName: 'ApproximateNumberOfMessagesVisible',
        dimensionsMap: {
          QueueName: this.executionQueue.queueName,
        },
      }),
      threshold: 100,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Queue depth is too high',
    }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.notificationTopic));

    new cloudwatch.Alarm(this, 'DLQMessagesAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/SQS',
        metricName: 'ApproximateNumberOfMessagesVisible',
        dimensionsMap: {
          QueueName: dlq.queueName,
        },
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Messages in dead letter queue',
    }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.notificationTopic));

    // Outputs
    new cdk.CfnOutput(this, 'ExecutionQueueUrl', {
      value: this.executionQueue.queueUrl,
      exportName: `${config.prefix}-execution-queue-url`,
    });

    new cdk.CfnOutput(this, 'NotificationTopicArn', {
      value: this.notificationTopic.topicArn,
      exportName: `${config.prefix}-notification-topic-arn`,
    });

    new cdk.CfnOutput(this, 'TerminalRepositoryUri', {
      value: terminalRepository.repositoryUri,
      exportName: `${config.prefix}-terminal-repository-uri`,
    });
  }
}