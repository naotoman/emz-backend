import { Environment } from "aws-cdk-lib";

export interface ConfigParameters {
  cdkStackId: string;
  env: Environment;
  vpcId: string;
  subnetIds: string[];
  chromiumLayerVersion: string;
  r2: {
    ssmParamToken: string;
    bucket: string;
    prefix: string;
    domain: string;
    endpoint: string;
  };
}

export type getConfigType = (env: string) => ConfigParameters;
