export interface ConfigParameters {
  stackId: string;
  awsEnv: {
    account: string;
    region: string;
  };
  ecsVpcId: string;
  ecsSubnetIds: string[];
  chromiumLayerArn: string;
  appParams: {
    ebayIsSandbox: boolean;
    ebayAppKeySsmParamName: string;
    ebayUserTokenSsmParamPrefix: string;
    r2KeySsmParamName: string;
    r2Bucket: string;
    r2Prefix: string;
    r2Endpoint: string;
    r2Domain: string;
    s3Bucket: string;
    s3Prefix: string;
  };
}

export type getConfigType = (env: unknown) => ConfigParameters;
