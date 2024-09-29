import { Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ConfigParameters } from "../../parameters.type";
import { AppSync } from "../construct/appsync";
import { Cognito } from "../construct/cognito";
import { Sfn } from "../construct/stepfunction";
import { Storage } from "../construct/storage";

export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props: ConfigParameters) {
    super(scope, id, { env: props.env });

    const storage = new Storage(this, `Storage`);

    const cognito = new Cognito(this, "Cognito", {
      userPoolName: props.cdkStackId,
    });

    const stateMachine = new Sfn(this, "Sfn", {
      table: storage.table,
      r2: props.r2,
    });

    const appsync = new AppSync(this, "AppSync", {
      apiName: props.cdkStackId,
      table: storage.table,
      userPool: cognito.userPool,
      stateMachine: stateMachine.stateMachine,
    });
  }
}
