import { ConfigParameters, getConfigType } from "./parameters.type";

const devConfig: ConfigParameters = {
  stackId: "XXX-dev", // Used for Stack ID. Don't change this after deployment.
  isPrdEnv: false,
  awsEnv: {
    account: "999999999999",
    region: "region",
  },
  ecsVpcId: "vpc-xxx",
  ecsSubnetIds: ["subnet-xxx", "subnet-yyy"],
  // https://github.com/shelfio/chrome-aws-lambda-layer
  chromiumLayerArn:
    "arn:aws:lambda:region:764866452798:layer:chrome-aws-lambda:99",
  // Data that are used inside Lambda functions.
  appParams: {
    ebayIsSandbox: true,
    ebayAppKeySsmParamName: "/xxx/yyy/sandbox",
    ebayUserTokenSsmParamPrefix: "/xxx/ebay-usertoken/",
    r2KeySsmParamName: "paramName",
    r2Bucket: "bucketName",
    r2Prefix: "prefix",
    r2Endpoint: "https://your-endpoint.com",
    r2Domain: "https://your-domain.com",
    s3Bucket: "bucketName",
    s3PathForEbayConditions: "path",
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
