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
        buildArgs: { lambda: "sfnUploadImages" },
      }),
      memorySize: 256,
      timeout: Duration.seconds(40),
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
        buildArgs: { lambda: "sfnRegisterStock" },
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
        buildArgs: { lambda: "sfnListingControl" },
      }),
      memorySize: 256,
      timeout: Duration.seconds(20),
      layers: [awsSsmExtensionLayer],
      logGroup: new logs.LogGroup(this, `ListingControlLog`, {
        retention: logs.RetentionDays.THREE_MONTHS,
      }),
    });
    listingControlFn.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMFullAccess")
    );

    const chatgptFn = new lambda.Function(this, `ChatGptFn`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromDockerBuild("lib/lambda", {
        buildArgs: { lambda: "sfnChatGpt" },
      }),
      memorySize: 256,
      timeout: Duration.seconds(40),
      layers: [awsSsmExtensionLayer],
      logGroup: new logs.LogGroup(this, `ChatgptFnLog`, {
        retention: logs.RetentionDays.THREE_MONTHS,
      }),
    });
    chatgptFn.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMReadOnlyAccess")
    );

    this.stateMachine = new sfn.StateMachine(this, "RegisterItem", {
      definitionBody: sfn.DefinitionBody.fromChainable(
        sfn.Chain.start(
          new sfn.Choice(this, "IsChatgptEnabled")
            .when(
              sfn.Condition.booleanEquals("$.isChatgptEnabled", true),
              new sfnTasks.LambdaInvoke(this, "ChatGptFnTask", {
                lambdaFunction: chatgptFn,
                payload: sfn.TaskInput.fromObject({
                  item: sfn.JsonPath.objectAt("$$.Execution.Input.item"),
                  appParams: sfn.JsonPath.objectAt(
                    "$$.Execution.Input.appParams"
                  ),
                }),
                resultSelector: {
                  item: sfn.JsonPath.objectAt("$.Payload"),
                },
              })
            )
            .otherwise(new sfn.Pass(this, "ChatgptDisabled"))
            .afterwards()
        )
          .next(
            new sfnTasks.LambdaInvoke(this, "UploadImagesTask", {
              lambdaFunction: uploadImagesFn,
              payload: sfn.TaskInput.fromObject({
                item: sfn.JsonPath.objectAt("$.item"),
                appParams: sfn.JsonPath.objectAt(
                  "$$.Execution.Input.appParams"
                ),
              }),
              resultPath: "$.resultPath",
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
                item: sfn.JsonPath.jsonMerge(
                  sfn.JsonPath.objectAt("$.item"),
                  sfn.JsonPath.objectAt("$.resultPath")
                ),
              }),
              resultSelector: {
                item: sfn.JsonPath.objectAt("$.Payload"),
              },
            })
          )
          .next(
            new sfnTasks.LambdaInvoke(this, "ListingControlTask", {
              lambdaFunction: listingControlFn,
              payload: sfn.TaskInput.fromObject({
                user: sfn.JsonPath.objectAt("$$.Execution.Input.user"),
                appParams: sfn.JsonPath.objectAt(
                  "$$.Execution.Input.appParams"
                ),
                item: sfn.JsonPath.objectAt("$.item"),
              }),
              resultSelector: {
                listing: sfn.JsonPath.objectAt("$.Payload"),
              },
            })
          )
          .next(
            new sfnTasks.DynamoUpdateItem(this, "UpdateItem", {
              table: props.table,
              key: {
                id: sfnTasks.DynamoAttributeValue.fromString(
                  sfn.JsonPath.format(
                    "ITEM#{}#{}",
                    sfn.JsonPath.stringAt("$$.Execution.Input.user.username"),
                    sfn.JsonPath.stringAt("$$.Execution.Input.item.ebaySku")
                  )
                ),
              },
              expressionAttributeValues: {
                ":listingId": sfnTasks.DynamoAttributeValue.fromString(
                  sfn.JsonPath.stringAt("$.listing.listingId")
                ),
                ":isListed": sfnTasks.DynamoAttributeValue.booleanFromJsonPath(
                  sfn.JsonPath.stringAt("$.listing.isListed")
                ),
              },
              updateExpression:
                "SET listingId = :listingId, isListed = :isListed",
            })
          )
          .next(new sfn.Succeed(this, "Success"))
      ),
    });
  }
}
