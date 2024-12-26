import {
  Duration,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_stepfunctions as sfn,
  aws_sqs as sqs,
} from "aws-cdk-lib";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Construct } from "constructs";

export interface Props {
  stateMachine: sfn.IStateMachine;
  chromiumLayerArn: string;
  r2Queue: sqs.Queue;
}

export class SqsScraper extends Construct {
  public readonly queue1: sqs.Queue;
  public readonly queue2: sqs.Queue;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const chromiumLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "Chromium",
      props.chromiumLayerArn
    );

    // Create Dead Letter Queue for first set
    const deadLetterQueue1 = new sqs.Queue(this, "ScraperDlq1", {
      retentionPeriod: Duration.days(14),
      fifo: true,
    });

    // Create main queue with DLQ configuration for first set
    this.queue1 = new sqs.Queue(this, "ScraperQueue1", {
      fifo: true,
      visibilityTimeout: Duration.seconds(35),
      deadLetterQueue: {
        queue: deadLetterQueue1,
        maxReceiveCount: 1,
      },
    });

    // Create Dead Letter Queue for second set
    const deadLetterQueue2 = new sqs.Queue(this, "ScraperDlq2", {
      retentionPeriod: Duration.days(14),
      fifo: true,
    });

    // Create main queue with DLQ configuration for second set
    this.queue2 = new sqs.Queue(this, "ScraperQueue2", {
      fifo: true,
      visibilityTimeout: Duration.seconds(35),
      deadLetterQueue: {
        queue: deadLetterQueue2,
        maxReceiveCount: 1,
      },
    });

    // First Lambda function and queue configuration
    const sqsScraper1 = new lambda.Function(this, `SqsScraper1`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromDockerBuild("lib/lambda", {
        buildArgs: { lambda: "sqsScraper" },
      }),
      memorySize: 2048,
      timeout: Duration.seconds(30),
      environment: {
        SFN_ARN: props.stateMachine.stateMachineArn,
        R2_QUEUE_URL: props.r2Queue.queueUrl,
        QUEUE_ID: "1",
      },
      layers: [chromiumLayer],
      logGroup: new logs.LogGroup(this, `SqsScraperLog1`, {
        retention: logs.RetentionDays.THREE_MONTHS,
      }),
    });
    sqsScraper1.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSStepFunctionsFullAccess")
    );
    sqsScraper1.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSQSFullAccess")
    );

    sqsScraper1.addEventSource(
      new SqsEventSource(this.queue1, {
        batchSize: 1,
        maxConcurrency: 2,
      })
    );

    // Second Lambda function and queue configuration
    const sqsScraper2 = new lambda.Function(this, `SqsScraper2`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromDockerBuild("lib/lambda", {
        buildArgs: { lambda: "sqsScraper" },
      }),
      memorySize: 2048,
      timeout: Duration.seconds(30),
      environment: {
        SFN_ARN: props.stateMachine.stateMachineArn,
        R2_QUEUE_URL: props.r2Queue.queueUrl,
        QUEUE_ID: "2",
      },
      layers: [chromiumLayer],
      logGroup: new logs.LogGroup(this, `SqsScraperLog2`, {
        retention: logs.RetentionDays.THREE_MONTHS,
      }),
    });
    sqsScraper2.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSStepFunctionsFullAccess")
    );
    sqsScraper2.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSQSFullAccess")
    );

    sqsScraper2.addEventSource(
      new SqsEventSource(this.queue2, {
        batchSize: 1,
        maxConcurrency: 2,
      })
    );
  }
}
