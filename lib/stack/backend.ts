import { Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ConfigParameters } from "../../parameters.type";
import { AppSync } from "../construct/appsync";
import { Cognito } from "../construct/cognito";
import { Database } from "../construct/database";
import { Ecs } from "../construct/ecs";
import { SqsR2 } from "../construct/sqsR2";
import { SqsScraper } from "../construct/sqsScraper";
import { Sfn } from "../construct/stepfunction";

export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props: ConfigParameters) {
    super(scope, id, { env: props.awsEnv });

    const storage = new Database(this, "Db", { appParams: props.appParams });

    const cognito = new Cognito(this, "Cognito", {
      userPoolName: props.stackId,
    });

    const stateMachine = new Sfn(this, "Sfn", {
      table: storage.table,
    });

    const sqsR2 = new SqsR2(this, "SqsR2");

    const sqsScraper = new SqsScraper(this, "SqsScraper", {
      chromiumLayerArn: props.chromiumLayerArn,
      stateMachine: stateMachine.stateMachine,
      r2Queue: sqsR2.queue,
    });

    new AppSync(this, "AppSync", {
      apiName: props.stackId,
      table: storage.table,
      userPool: cognito.userPool,
      sqsQueue1: sqsScraper.queue1,
      sqsQueue2: sqsScraper.queue2,
      accountId: props.awsEnv.account,
    });

    new Ecs(this, "Ecs", {
      chromiumLayerArn: props.chromiumLayerArn,
      ecsVpcId: props.ecsVpcId,
      ecsSubnetIds: props.ecsSubnetIds,
      table: storage.table,
      isPrdEnv: props.isPrdEnv,
    });
  }
}
