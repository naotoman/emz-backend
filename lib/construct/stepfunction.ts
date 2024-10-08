import {
  Duration,
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as sfnTasks,
} from "aws-cdk-lib";
import { Construct } from "constructs";

export interface SfnProps {
  table: dynamodb.ITableV2;
  r2: {
    ssmParamToken: string;
    bucket: string;
    prefix: string;
    domain: string;
    endpoint: string;
  };
  s3: {
    bucket: string;
    prefix: string;
  };
}

export class Sfn extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: SfnProps) {
    super(scope, id);

    const uploadImagesFn = new lambda.Function(this, `UploadImages`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromDockerBuild("lib/lambda", {
        buildArgs: { lambda: "uploadImages" },
      }),
      memorySize: 256,
      environment: {
        R2_BUCKET: props.r2.bucket,
        R2_PREFIX: props.r2.prefix,
        R2_DOMAIN: props.r2.domain,
        R2_ENDPOINT: props.r2.endpoint,
        SSM_PARAM_R2_TOKENS: props.r2.ssmParamToken,
      },
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(
          this,
          "ssmExtension",
          `arn:aws:lambda:ap-northeast-1:133490724326:layer:AWS-Parameters-and-Secrets-Lambda-Extension:12`
        ),
      ],
      timeout: Duration.seconds(20),
      logGroup: new logs.LogGroup(this, `UploadImagesLog`, {
        retention: logs.RetentionDays.THREE_MONTHS,
      }),
    });
    uploadImagesFn.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMReadOnlyAccess")
    );

    const registerStockFn = new lambda.Function(this, `RegisterStock`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromDockerBuild("lib/lambda", {
        buildArgs: { lambda: "registerStock" },
      }),
      memorySize: 256,
      environment: {
        S3_BUCKET: props.s3.bucket,
        S3_PREFIX: props.s3.prefix,
        TABLE_NAME: props.table.tableName,
      },
      timeout: Duration.seconds(20),
      logGroup: new logs.LogGroup(this, `RegisterStockLog`, {
        retention: logs.RetentionDays.THREE_MONTHS,
      }),
    });
    registerStockFn.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonDynamoDBFullAccess")
    );
    registerStockFn.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3ReadOnlyAccess")
    );

    this.stateMachine = new sfn.StateMachine(this, "RegisterItem", {
      definitionBody: sfn.DefinitionBody.fromChainable(
        sfn.Chain.start(
          new sfnTasks.LambdaInvoke(this, "UploadImagesTask", {
            lambdaFunction: uploadImagesFn,
            payload: sfn.TaskInput.fromObject({
              ebaySku: sfn.JsonPath.stringAt("$.item.ebaySku"),
              orgImageUrls: sfn.JsonPath.objectAt("$.item.orgImageUrls"),
            }),
            resultSelector: {
              ebayImageUrls: sfn.JsonPath.objectAt("$.Payload.distImageUrls"),
            },
          })
        )
          .next(
            new sfnTasks.LambdaInvoke(this, "RegisterStockTask", {
              lambdaFunction: registerStockFn,
              payload: sfn.TaskInput.fromObject({
                user: sfn.JsonPath.objectAt("$$.Execution.Input.user"),
                item: sfn.JsonPath.objectAt("$$.Execution.Input.item"),
                ebayImageUrls: sfn.JsonPath.objectAt("$.ebayImageUrls"),
              }),
            })
          )
          .next(new sfn.Succeed(this, "Success"))
      ),
    });
  }
}
