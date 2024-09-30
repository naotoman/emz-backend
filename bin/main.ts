import { App } from "aws-cdk-lib";
import { BackendStack } from "../lib/stack/backend";
import { getConfig } from "../parameters";

const app = new App();

const env = app.node.tryGetContext("env");
const config = getConfig(env);

new BackendStack(app, config.stackId, config);
