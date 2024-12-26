import { marshall } from "@aws-sdk/util-dynamodb";
import {
  custom_resources as cr,
  aws_dynamodb as dynamodb,
  aws_logs as logs,
} from "aws-cdk-lib";
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
  }
}
