import {
  Duration,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_sqs as sqs,
} from "aws-cdk-lib";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Construct } from "constructs";

export class SqsR2 extends Construct {
  public readonly queue: sqs.Queue;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const awsSsmExtensionLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "ssmExtension",
      `arn:aws:lambda:ap-northeast-1:133490724326:layer:AWS-Parameters-and-Secrets-Lambda-Extension:12`
    );

    // Create Dead Letter Queue
    const deadLetterQueue = new sqs.Queue(this, "R2Dlq", {
      retentionPeriod: Duration.days(14),
      fifo: true,
    });

    // Create main queue with DLQ configuration
    this.queue = new sqs.Queue(this, "R2Queue", {
      fifo: true,
      contentBasedDeduplication: true,
      visibilityTimeout: Duration.seconds(55),
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 1,
      },
    });

    // Lambda function and queue configuration
    const sqsUploadImages = new lambda.Function(this, `SqsUploadImages`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromDockerBuild("lib/lambda", {
        buildArgs: { lambda: "sqsUploadImages" },
      }),
      memorySize: 512,
      timeout: Duration.seconds(50),
      layers: [awsSsmExtensionLayer],
      logGroup: new logs.LogGroup(this, `SqsUploadImagesLog`, {
        retention: logs.RetentionDays.THREE_MONTHS,
      }),
    });
    sqsUploadImages.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMReadOnlyAccess")
    );

    sqsUploadImages.addEventSource(
      new SqsEventSource(this.queue, {
        batchSize: 1,
        maxConcurrency: 2,
      })
    );
  }
}
