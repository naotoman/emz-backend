import { aws_dynamodb } from "aws-cdk-lib";
import { Construct } from "constructs";

export class Storage extends Construct {
  public readonly table: aws_dynamodb.ITableV2;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.table = new aws_dynamodb.TableV2(this, "Table", {
      partitionKey: { name: "id", type: aws_dynamodb.AttributeType.STRING },
      deletionProtection: true,
    });
  }
}
