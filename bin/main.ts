import { App } from "aws-cdk-lib";
import { BackendStack } from "../lib/stack/backend";
import { getConfig } from "../parameters";

const app = new App();

const env = app.node.tryGetContext("env");
if (env == null)
  throw new Error(
    `Please specify environment with context option. ex) cdk deploy -c env=dev`
  );
const config = getConfig(env);

new BackendStack(app, config.cdkStackId, config);
