import { Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ConfigParameters } from "../../parameters.type";
import { AppSync } from "../construct/appsync";
import { Cognito } from "../construct/cognito";
import { Database } from "../construct/database";
import { Ecs } from "../construct/ecs";
import { Sfn } from "../construct/stepfunction";

export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props: ConfigParameters) {
    super(scope, id, { env: props.awsEnv });

    const storage = new Database(this, `Db`);

    const cognito = new Cognito(this, "Cognito", {
      userPoolName: props.stackId,
    });

    const stateMachine = new Sfn(this, "Sfn", {
      table: storage.table,
      r2: props.r2,
      s3: {
        bucket: props.s3.bucket,
        prefix: props.s3.prefix,
      },
    });

    const appsync = new AppSync(this, "AppSync", {
      apiName: props.stackId,
      table: storage.table,
      userPool: cognito.userPool,
      stateMachine: stateMachine.stateMachine,
    });

    const ecs = new Ecs(this, "Ecs", {
      chromiumLayerArn: props.chromiumLayerArn,
    });
  }
}
