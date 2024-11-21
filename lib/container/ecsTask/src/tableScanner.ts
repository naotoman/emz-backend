import {
  DynamoDBClient,
  ScanCommand,
  ScanCommandInput,
} from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

// Use this class to scan a DynamoDB table.
export default class TableScanner {
  private client: DynamoDBClient;
  private tableName: string;
  private exclusiveStartKey: { [key: string]: any };
  private _hasNext: boolean;

  constructor(tableName: string) {
    this.client = new DynamoDBClient({});
    this.tableName = tableName;
    this.exclusiveStartKey = {};
    this._hasNext = true;
  }

  hasNext = (): boolean => {
    return this._hasNext;
  };

  /**
   * Return the next pagination of the result of scanning the DynamoDB table.
   * @param limit The maximum number of items returned.
   * @returns The next pagination
   */
  async next(limit?: number): Promise<any[]> {
    if (!this.hasNext()) return [];

    const input: ScanCommandInput = {
      TableName: this.tableName,
    };
    if (
      this.exclusiveStartKey &&
      Object.keys(this.exclusiveStartKey).length > 0
    ) {
      input.ExclusiveStartKey = this.exclusiveStartKey;
    }
    if (limit) {
      input.Limit = limit;
    }

    const command = new ScanCommand(input);
    const response = await this.client.send(command);
    if (response.LastEvaluatedKey) {
      this.exclusiveStartKey = response.LastEvaluatedKey;
    } else {
      this._hasNext = false;
    }
    return response.Items?.map((val) => unmarshall(val)) || [];
  }
}
