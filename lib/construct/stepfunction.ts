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
}

export class Sfn extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: SfnProps) {
    super(scope, id);

    const awsSsmExtensionLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "ssmExtension",
      `arn:aws:lambda:ap-northeast-1:133490724326:layer:AWS-Parameters-and-Secrets-Lambda-Extension:12`
    );

    const uploadImagesFn = new lambda.Function(this, `UploadImages`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromDockerBuild("lib/lambda", {
        buildArgs: { lambda: "uploadImages" },
      }),
      memorySize: 256,
      timeout: Duration.seconds(20),
      layers: [awsSsmExtensionLayer],
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
      timeout: Duration.seconds(20),
      environment: {
        TABLE_NAME: props.table.tableName,
      },
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

    const listingControlFn = new lambda.Function(this, `ListingControl`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromDockerBuild("lib/lambda", {
        buildArgs: { lambda: "listingControl" },
      }),
      memorySize: 256,
      timeout: Duration.seconds(20),
      layers: [awsSsmExtensionLayer],
      logGroup: new logs.LogGroup(this, `ListingControlLog`, {
        retention: logs.RetentionDays.THREE_MONTHS,
      }),
    });
    listingControlFn.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMReadOnlyAccess")
    );

    this.stateMachine = new sfn.StateMachine(this, "RegisterItem", {
      definitionBody: sfn.DefinitionBody.fromChainable(
        sfn.Chain.start(
          new sfnTasks.LambdaInvoke(this, "UploadImagesTask", {
            lambdaFunction: uploadImagesFn,
            payload: sfn.TaskInput.fromObject({
              item: sfn.JsonPath.objectAt("$$.Execution.Input.item"),
              appParams: sfn.JsonPath.objectAt("$$.Execution.Input.appParams"),
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
                appParams: sfn.JsonPath.objectAt(
                  "$$.Execution.Input.appParams"
                ),
                item: sfn.JsonPath.objectAt("$$.Execution.Input.item"),
                ebayImageUrls: sfn.JsonPath.objectAt("$.ebayImageUrls"),
              }),
              resultSelector: {
                item: sfn.JsonPath.objectAt("$.Payload"),
              },
            })
          )
          // .next(
          //   new sfnTasks.LambdaInvoke(this, "ListingControlTask", {
          //     lambdaFunction: listingControlFn,
          //     payload: sfn.TaskInput.fromObject({
          //       user: sfn.JsonPath.objectAt("$$.Execution.Input.user"),
          //       appParams: sfn.JsonPath.objectAt(
          //         "$$.Execution.Input.appParams"
          //       ),
          //       item: sfn.JsonPath.objectAt("$.item"),
          //     }),
          //   })
          // )
          .next(new sfn.Succeed(this, "Success"))
      ),
    });
  }
}
