import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

interface DeleteItemInput {
  TableName: string;
  Key: { [key: string]: any };
}

interface UpdateItemInput {
  TableName: string;
  Key: { [key: string]: any };
  UpdateExpression: string;
  ExpressionAttributeNames: { [key: string]: string };
  ExpressionAttributeValues: { [key: string]: any };
}

export const getItem = async (
  tableName: string,
  key: string,
  val: any
): Promise<{ [key: string]: any }> => {
  const input = {
    TableName: tableName,
    Key: marshall({ [key]: val }),
  };
  const ddbClient = new DynamoDBClient({ region: "ap-northeast-1" });
  const command = new GetItemCommand(input);
  const result = await ddbClient.send(command);
  if (!result.Item) {
    throw new Error(`Item not found for ${val}`);
  }
  return unmarshall(result.Item);
};

export const makeInputForDeleteItem = (
  tableName: string,
  key: string,
  val: any
): DeleteItemInput => {
  return {
    TableName: tableName,
    Key: marshall({ [key]: val }),
  };
};

export const deleteItem = async (
  tableName: string,
  key: string,
  val: any
): Promise<void> => {
  const input = makeInputForDeleteItem(tableName, key, val);
  const ddbClient = new DynamoDBClient({ region: "ap-northeast-1" });
  const command = new DeleteItemCommand(input);
  await ddbClient.send(command);
};

export const makeInputForUpdateItem = (
  tableName: string,
  key: string,
  keyVal: any,
  params: { [key: string]: any }
): UpdateItemInput => {
  return {
    TableName: tableName,
    Key: marshall({ [key]: keyVal }),
    UpdateExpression:
      "SET " +
      Array.from(
        { length: Object.keys(params).length },
        (_, i) => `#n${i} = :v${i}`
      ).join(", "),
    ExpressionAttributeNames: Object.keys(params).reduce((acc, curr, i) => {
      acc[`#n${i}`] = curr;
      return acc;
    }, {} as { [key: string]: string }),
    ExpressionAttributeValues: marshall(
      Object.values(params).reduce((acc, curr, i) => {
        acc[`:v${i}`] = curr;
        return acc;
      }, {} as { [key: string]: any })
    ),
  };
};

export const updateItem = async (
  tableName: string,
  key: string,
  keyVal: any,
  params: { [key: string]: any }
): Promise<void> => {
  const input = makeInputForUpdateItem(tableName, key, keyVal, params);
  const ddbClient = new DynamoDBClient({ region: "ap-northeast-1" });
  const command = new UpdateItemCommand(input);
  await ddbClient.send(command);
};
