import * as appsync from "aws-cdk-lib/aws-appsync";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

export interface AppSyncProps {
  table: dynamodb.ITableV2;
  userPool: cognito.IUserPool;
  sqsQueue1: sqs.IQueue;
  sqsQueue2: sqs.IQueue;
  apiName: string;
  accountId: string;
}

export class AppSync extends Construct {
  constructor(scope: Construct, id: string, props: AppSyncProps) {
    super(scope, id);

    const api = new appsync.GraphqlApi(this, "Api", {
      name: props.apiName,
      definition: appsync.Definition.fromFile("lib/graphql/schema.graphql"),
      environmentVariables: {
        TABLE_NAME: props.table.tableName,
        SQS_URL_1: props.sqsQueue1.queueUrl,
        SQS_URL_2: props.sqsQueue2.queueUrl,
        SQS_NAME_1: props.sqsQueue1.queueName,
        SQS_NAME_2: props.sqsQueue2.queueName,
        ACCOUNT_ID: props.accountId,
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
    props.sqsQueue1.grantSendMessages(sqsSource);
    props.sqsQueue2.grantSendMessages(sqsSource);

    new appsync.Resolver(this, "BatchGetItemResolver", {
      api,
      typeName: "Query",
      fieldName: "batchGetItem",
      code: appsync.Code.fromAsset("lib/graphql/batchGetItem.resolver.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      dataSource: ddbSource,
    });

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
    const pushItemToSqs1 = new appsync.AppsyncFunction(this, "PushItemToSqs1", {
      name: "push_item_to_sqs1",
      api,
      dataSource: sqsSource,
      code: appsync.Code.fromAsset("lib/graphql/pushItemToSqs1.resolver.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    const pushItemToSqs2 = new appsync.AppsyncFunction(this, "PushItemToSqs2", {
      name: "push_item_to_sqs2",
      api,
      dataSource: sqsSource,
      code: appsync.Code.fromAsset("lib/graphql/pushItemToSqs2.resolver.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    new appsync.Resolver(this, "PushItemToSqs1Resolver", {
      api,
      typeName: "Mutation",
      fieldName: "pushItemToSqs1",
      pipelineConfig: [prepRegisterItem, pushItemToSqs1],
      code: appsync.Code.fromAsset("lib/graphql/registerItem.resolver.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    new appsync.Resolver(this, "PushItemToSqs2Resolver", {
      api,
      typeName: "Mutation",
      fieldName: "pushItemToSqs2",
      pipelineConfig: [prepRegisterItem, pushItemToSqs2],
      code: appsync.Code.fromAsset("lib/graphql/registerItem.resolver.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });
  }
}
