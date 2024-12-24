import { aws_stepfunctions as sfn } from "aws-cdk-lib";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

export interface AppSyncProps {
  table: dynamodb.ITableV2;
  userPool: cognito.IUserPool;
  stateMachine: sfn.IStateMachine;
  sqsQueue: sqs.IQueue;
  apiName: string;
}

export class AppSync extends Construct {
  constructor(scope: Construct, id: string, props: AppSyncProps) {
    super(scope, id);

    const api = new appsync.GraphqlApi(this, "Api", {
      name: props.apiName,
      definition: appsync.Definition.fromFile("lib/graphql/schema.graphql"),
      environmentVariables: {
        TABLE_NAME: props.table.tableName,
        SFN_ARN: props.stateMachine.stateMachineArn,
        SQS_URL: props.sqsQueue.queueUrl,
        SQS_NAME: props.sqsQueue.queueName,
      },
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool: props.userPool,
          },
        },
      },
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.INFO,
        retention: logs.RetentionDays.ONE_WEEK,
      },
    });
    const ddbSource = api.addDynamoDbDataSource("dynamodbSource", props.table);

    const sfnSource = api.addHttpDataSource(
      "Sfn",
      "https://states.ap-northeast-1.amazonaws.com",
      {
        authorizationConfig: {
          signingRegion: "ap-northeast-1",
          signingServiceName: "states",
        },
      }
    );
    props.stateMachine.grantStartExecution(sfnSource);

    const sqsSource = api.addHttpDataSource(
      "SqsSource",
      "https://sqs.ap-northeast-1.amazonaws.com",
      {
        authorizationConfig: {
          signingRegion: "ap-northeast-1",
          signingServiceName: "sqs",
        },
      }
    );
    props.sqsQueue.grantSendMessages(sqsSource);

    const prepRegisterItem = new appsync.AppsyncFunction(
      this,
      "PrepRegisterItem",
      {
        name: "prep_register_item",
        api,
        dataSource: ddbSource,
        code: appsync.Code.fromAsset(
          "lib/graphql/prepRegisterItem.resolver.js"
        ),
        runtime: appsync.FunctionRuntime.JS_1_0_0,
      }
    );

    const startStepFunctionChatGpt = new appsync.AppsyncFunction(
      this,
      "StartStepFunctionChatGpt",
      {
        name: "start_step_function_chatgpt",
        api,
        dataSource: sfnSource,
        code: appsync.Code.fromAsset(
          "lib/graphql/startStepFunctionChatGpt.resolver.js"
        ),
        runtime: appsync.FunctionRuntime.JS_1_0_0,
      }
    );

    new appsync.Resolver(this, "BatchGetItemResolver", {
      api,
      typeName: "Query",
      fieldName: "batchGetItem",
      code: appsync.Code.fromAsset("lib/graphql/batchGetItem.resolver.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      dataSource: ddbSource,
    });

    new appsync.Resolver(this, "GetUserInfoResolver", {
      api,
      typeName: "Query",
      fieldName: "getUserInfo",
      code: appsync.Code.fromAsset("lib/graphql/getUserInfo.resolver.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      dataSource: ddbSource,
    });

    new appsync.Resolver(this, "RegisterItemChatGptResolver", {
      api,
      typeName: "Mutation",
      fieldName: "registerItemChatGpt",
      pipelineConfig: [prepRegisterItem, startStepFunctionChatGpt],
      code: appsync.Code.fromAsset("lib/graphql/registerItem.resolver.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    const pushItemToSqs = new appsync.AppsyncFunction(this, "PushItemToSqs", {
      name: "push_item_to_sqs",
      api,
      dataSource: sfnSource,
      code: appsync.Code.fromAsset("lib/graphql/pushItemToSqs.resolver.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    new appsync.Resolver(this, "PushItemToSqsResolver", {
      api,
      typeName: "Mutation",
      fieldName: "pushItemToSqs",
      pipelineConfig: [prepRegisterItem, pushItemToSqs],
      code: appsync.Code.fromAsset("lib/graphql/registerItem.resolver.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });
  }
}
