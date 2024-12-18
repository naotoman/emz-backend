import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export interface CognitoProps {
  userPoolName: string;
}

export class Cognito extends Construct {
  public readonly userPool: cognito.UserPool;

  constructor(scope: Construct, id: string, props: CognitoProps) {
    super(scope, id);

    this.userPool = new cognito.UserPool(this, "Accounts", {
      userPoolName: props.userPoolName,
      accountRecovery: cognito.AccountRecovery.NONE,
      deletionProtection: true,
      selfSignUpEnabled: false,
    });

    this.userPool.addClient("AppClient", {
      authFlows: {
        custom: true,
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
    });

    new cognito.CfnUserPoolGroup(this, "UserPoolGroup", {
      userPoolId: this.userPool.userPoolId,
      description: "user",
      groupName: "USER",
    });

    new cognito.CfnUserPoolGroup(this, "GptUserPoolGroup", {
      userPoolId: this.userPool.userPoolId,
      description: "users who can use chatGPT",
      groupName: "GPT_USER",
    });
  }
}
