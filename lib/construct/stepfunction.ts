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
}

export class Sfn extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: SfnProps) {
    super(scope, id);

    const registerItemFn = new lambda.Function(this, `UploadImages`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromDockerBuild("lib/lambda", {
        buildArgs: { lambda: "uploadImages" },
      }),
      memorySize: 1024,
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
      timeout: Duration.seconds(30),
      logGroup: new logs.LogGroup(this, `UploadImagesLog`, {
        retention: logs.RetentionDays.THREE_MONTHS,
      }),
    });
    registerItemFn.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMReadOnlyAccess")
    );

    this.stateMachine = new sfn.StateMachine(this, "RegisterItem", {
      definitionBody: sfn.DefinitionBody.fromChainable(
        sfn.Chain.start(
          new sfnTasks.LambdaInvoke(this, "UploadImagesTask", {
            lambdaFunction: registerItemFn,
            payload: sfn.TaskInput.fromObject({
              itemId: sfn.JsonPath.stringAt("$.itemId"),
              imageUrls: sfn.JsonPath.stringAt("$.stock.imageUrls"),
            }),
            resultSelector: {
              distImageUrls: sfn.JsonPath.stringAt("$.Payload.distImageUrls"),
            },
          })
        ).next(new sfn.Succeed(this, "Success"))
      ),
    });
  }
}
