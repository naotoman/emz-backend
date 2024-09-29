import { aws_stepfunctions as sfn } from "aws-cdk-lib";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

export interface AppSyncProps {
  table: dynamodb.ITableV2;
  userPool: cognito.IUserPool;
  stateMachine: sfn.IStateMachine;
  apiName: string;
}

export class AppSync extends Construct {
  constructor(scope: Construct, id: string, props: AppSyncProps) {
    super(scope, id);

    const api = new appsync.GraphqlApi(this, "api", {
      name: props.apiName,
      definition: appsync.Definition.fromFile("lib/graphql/schema.graphql"),
      environmentVariables: {
        TABLE_NAME: props.table.tableName,
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

    const sfnSource = api.addHttpDataSource(
      "sfn",
      "https://states.ap-northeast-1.amazonaws.com",
      {
        authorizationConfig: {
          signingRegion: "ap-northeast-1",
          signingServiceName: "states",
        },
      }
    );
    props.stateMachine.grantStartExecution(sfnSource);

    const ddbSource = api.addDynamoDbDataSource("dynamodbSource", props.table);

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

    new appsync.Resolver(this, "RegisterItemResolver", {
      api,
      typeName: "Mutation",
      fieldName: "registerItem",
      code: appsync.Code.fromAsset("lib/graphql/registerItem.resolver.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      dataSource: sfnSource,
    });
  }
}
