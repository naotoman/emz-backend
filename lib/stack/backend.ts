import { Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ConfigParameters } from "../../parameters.type";
import { AppSync } from "../construct/appsync";
import { Cognito } from "../construct/cognito";
import { Database } from "../construct/database";
import { Ecs } from "../construct/ecs";
import { SfnGpt } from "../construct/gptStepfunction";
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

    const stateMachineGpt = new SfnGpt(this, "SfnGpt", {
      table: storage.table,
    });

    new AppSync(this, "AppSync", {
      apiName: props.stackId,
      table: storage.table,
      userPool: cognito.userPool,
      stateMachine: stateMachine.stateMachine,
      stateMachineGpt: stateMachineGpt.stateMachine,
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
