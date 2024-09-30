import { ConfigParameters, getConfigType } from "./parameters.type";

const devConfig: ConfigParameters = {
  stackId: "XXX-dev", // Used for Stack ID. Don't change this after deployment.
  awsEnv: {
    account: "999999999999",
    region: "region",
  },
  vpcId: "vpc-xxx",
  subnetIds: ["subnet-xxx", "subnet-yyy"],
  // https://github.com/shelfio/chrome-aws-lambda-layer
  chromiumLayerArn:
    "arn:aws:lambda:region:764866452798:layer:chrome-aws-lambda:99",
  r2: {
    ssmParamToken: "paramName",
    bucket: "bucketName",
    prefix: "prefix",
    domain: "https://your-domain.com",
    endpoint: "https://your-endpoint.com",
  },
};

// const prdConfig: ConfigParameters = {
//   cdkStackId: "XXX-prd",
//   ...
// };

export const getConfig: getConfigType = (env) => {
  if (env === "dev" || env == null) return devConfig;
  // if (env === "prd") return prdConfig;
  throw new Error(`${env} is not a proper environment name.`);
};
