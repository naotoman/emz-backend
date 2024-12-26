import {
  Duration,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_sqs as sqs,
} from "aws-cdk-lib";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Construct } from "constructs";

export interface SqsProps {
  chromiumLayerArn: string;
}

export class SqsQueue extends Construct {
  public readonly queue: sqs.Queue;

  constructor(scope: Construct, id: string, props: SqsProps) {
    super(scope, id);

    // Create Dead Letter Queue first
    const deadLetterQueue = new sqs.Queue(this, "ScraperDlq", {
      retentionPeriod: Duration.days(14),
      fifo: true,
    });

    // Create main queue with DLQ configuration
    this.queue = new sqs.Queue(this, "ScraperQueue", {
      fifo: true,
      visibilityTimeout: Duration.seconds(35),
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 1,
      },
    });

    const sqsScraper = new lambda.Function(this, `SqsScraper`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromDockerBuild("lib/lambda", {
        buildArgs: { lambda: "sqsScraper" },
      }),
      memorySize: 2048,
      timeout: Duration.seconds(30),
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(
          this,
          "Chromium",
          props.chromiumLayerArn
        ),
      ],
      logGroup: new logs.LogGroup(this, `SqsScraperLog`, {
        retention: logs.RetentionDays.THREE_MONTHS,
      }),
    });
    sqsScraper.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSStepFunctionsFullAccess")
    );

    sqsScraper.addEventSource(
      new SqsEventSource(this.queue, {
        batchSize: 1,
        maxConcurrency: 2,
      })
    );
  }
}
