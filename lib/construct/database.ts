import { marshall } from "@aws-sdk/util-dynamodb";
import {
  custom_resources as cr,
  Duration,
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
} from "aws-cdk-lib";
import { DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Construct } from "constructs";

export interface DatabaseProps {
  appParams: {
    [key: string]: unknown;
  };
}

type DynamoDBExpressions = {
  ExpressionAttributeNames: { [key: string]: string };
  ExpressionAttributeValues: { [key: string]: unknown };
  UpdateExpression: string;
};

const createDynamoDBExpressions = (obj: {
  [key: string]: unknown;
}): DynamoDBExpressions => {
  const expressionAttributeNames: { [key: string]: string } = {};
  const expressionAttributeValues: { [key: string]: unknown } = {};
  const updateExpressions: string[] = [];

  Object.keys(obj).forEach((key) => {
    const namePlaceholder = `#${key}`;
    const valuePlaceholder = `:${key}`;

    expressionAttributeNames[namePlaceholder] = key;
    expressionAttributeValues[valuePlaceholder] = marshall(obj[key]);

    updateExpressions.push(`${namePlaceholder} = ${valuePlaceholder}`);
  });

  const updateExpression = `SET ${updateExpressions.join(", ")}`;

  return {
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    UpdateExpression: updateExpression,
  };
};

export class Database extends Construct {
  public readonly table: dynamodb.ITableV2;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    this.table = new dynamodb.TableV2(this, "Table", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      deletionProtection: true,
      dynamoStream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    new cr.AwsCustomResource(this, "ddbInitData", {
      onCreate: {
        service: "DynamoDB",
        action: "UpdateItem",
        parameters: {
          TableName: this.table.tableName,
          Key: {
            id: { S: "PARAMS" },
          },
          ...createDynamoDBExpressions(props.appParams),
        },
        physicalResourceId: cr.PhysicalResourceId.of(Date.now().toString()),
      },
      onUpdate: {
        service: "DynamoDB",
        action: "UpdateItem",
        parameters: {
          TableName: this.table.tableName,
          Key: {
            id: { S: "PARAMS" },
          },
          ...createDynamoDBExpressions(props.appParams),
        },
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
      logGroup: new logs.LogGroup(this, `ddbInitDataLog`, {
        retention: logs.RetentionDays.THREE_MONTHS,
      }),
    });

    const ddbStreamFunc = new lambda.Function(this, `DdbStreamFunc`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromDockerBuild("lib/lambda", {
        buildArgs: { lambda: "ddbStream" },
      }),
      memorySize: 128,
      timeout: Duration.seconds(10),
      environment: {
        TABLE_NAME: this.table.tableName,
      },
      logGroup: new logs.LogGroup(this, `DdbStreamLog`, {
        retention: logs.RetentionDays.THREE_MONTHS,
      }),
    });
    ddbStreamFunc.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonDynamoDBFullAccess")
    );

    ddbStreamFunc.addEventSource(
      new DynamoEventSource(this.table, {
        enabled: false,
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        filters: [
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual("MODIFY"),
            dynamodb: {
              Keys: {
                id: { S: lambda.FilterRule.beginsWith("ITEM#") },
              },
              OldImage: {
                isListed: { BOOL: lambda.FilterRule.isEqual(false) },
              },
              NewImage: {
                isListed: { BOOL: lambda.FilterRule.isEqual(true) },
              },
            },
          }),
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual("MODIFY"),
            dynamodb: {
              Keys: {
                id: { S: lambda.FilterRule.beginsWith("ITEM#") },
              },
              OldImage: {
                isListed: { BOOL: lambda.FilterRule.isEqual(true) },
              },
              NewImage: {
                isListed: { BOOL: lambda.FilterRule.isEqual(false) },
              },
            },
          }),
        ],
      })
    );
  }
}
