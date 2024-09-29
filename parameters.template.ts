import { ConfigParameters, getConfigType } from "./parameters.type";

const devConfig: ConfigParameters = {
  cdkStackId: "XXX-dev", // Used for Stack ID. Don't change this after deployment.
  env: {
    account: "999999999999",
    region: "region",
  },
  vpcId: "vpc-xxx",
  subnetIds: ["subnet-xxx", "subnet-yyy"],
  chromiumLayerVersion: "99",
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
  if (env === "dev") return devConfig;
  // else if (env === "prd") return prdConfig;
  throw new Error(`${env} is not a proper environment name.`);
};
