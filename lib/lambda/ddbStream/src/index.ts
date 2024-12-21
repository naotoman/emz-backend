import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { log } from "common/utils";

interface Event {
  Records: {
    dynamodb: {
      NewImage: {
        username: { S: string };
        isListed: { BOOL: boolean };
      };
      OldImage: {
        isListed: { BOOL: boolean };
      };
    };
  }[];
}

const updateListedCount = async (username: string, diff: number) => {
  const ddbClient = new DynamoDBClient();
  const input = {
    TableName: process.env.TABLE_NAME!,
    Key: {
      id: { S: `USER#${username}` },
    },
    ExpressionAttributeValues: { ":x": { N: `${diff}` } },
    UpdateExpression: `ADD listedCount :x`,
  };
  log(input);
  await ddbClient.send(new UpdateItemCommand(input));
};

export const _handler = async (event: Event) => {
  for (const record of event.Records) {
    const username = record.dynamodb.NewImage.username.S;
    if (
      record.dynamodb.OldImage.isListed.BOOL === false &&
      record.dynamodb.NewImage.isListed.BOOL === true
    ) {
      await updateListedCount(username, 1);
    } else if (
      record.dynamodb.OldImage.isListed.BOOL === true &&
      record.dynamodb.NewImage.isListed.BOOL === false
    ) {
      await updateListedCount(username, -1);
    }
  }
};

// Global lambda handler - catches all exceptions to avoid dead letter in the DynamoDB Stream
export const handler = async (event: Event) => {
  try {
    log(event);
    await _handler(event);
  } catch (error) {
    console.error(error);
  }
};
