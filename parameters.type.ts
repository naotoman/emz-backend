export interface ConfigParameters {
  stackId: string;
  awsEnv: {
    account: string;
    region: string;
  };
  vpcId: string;
  subnetIds: string[];
  chromiumLayerArn: string;
  r2: {
    ssmParamToken: string;
    bucket: string;
    prefix: string;
    domain: string;
    endpoint: string;
  };
  s3: {
    bucket: string;
    prefix: string;
  };
}

export type getConfigType = (env: unknown) => ConfigParameters;
