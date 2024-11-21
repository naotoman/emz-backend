import {
  GetFunctionConfigurationCommand,
  GetFunctionConfigurationCommandOutput,
  InvokeCommand,
  LambdaClient,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import { randomUUID } from "crypto";

export const waitAndUpdateLambda = async (
  functionName: string
): Promise<void> => {
  const lambda_client = new LambdaClient({});

  const getLambdaConfig =
    async (): Promise<GetFunctionConfigurationCommandOutput> => {
      const command = new GetFunctionConfigurationCommand({
        FunctionName: functionName,
      });
      const res = await lambda_client.send(command);
      return res;
    };

  const updateLambdaDesc = async (): Promise<void> => {
    const command = new UpdateFunctionConfigurationCommand({
      FunctionName: functionName,
      Description: randomUUID(),
    });
    await lambda_client.send(command);
  };
  let lambdaStatus = "InProgress";
  let maxRetry = 10;
  while (lambdaStatus === "InProgress" && maxRetry > 0) {
    maxRetry--;
    const lambdaConf = await getLambdaConfig();
    lambdaStatus = lambdaConf.LastUpdateStatus || "InProgress";
    await new Promise((s) => setTimeout(s, 3000));
  }
  await updateLambdaDesc();
};

interface RunLambdaResult {
  result: boolean;
  data: any;
}

export const runLambda = async (
  functionName: string,
  args: any
): Promise<RunLambdaResult> => {
  const lambda_client = new LambdaClient({});
  const command = new InvokeCommand({
    FunctionName: functionName,
    Payload: Buffer.from(JSON.stringify(args)),
  });
  const res = await lambda_client.send(command);
  const dataStr = Buffer.from(res.Payload as Uint8Array).toString();
  const data = JSON.parse(dataStr);
  // ↓parse後にキーの存在確認ですると、dataがプリミティブ型となる場合にエラーになるので、文字列のまま判定した。
  if (dataStr.includes("errorType") || dataStr.includes("errorMessage")) {
    return { result: false, data: data };
  }
  return { result: true, data: data };
};

/**
 * Run a AWS lambda function with retry.
 * If it fails a certain amount of time, it throws an Error.
 * Each retry is run on different IP addresses.
 * @param functionName lambda function name.
 * @param args JSON object that is passed to the lambda function as payload.
 * @param totalTry The maximum number of tries the lambda run.
 * @returns the return value of the lambda function
 */
export const retryRunLambda = async (
  functionName: string,
  args: any,
  totalTry: number
): Promise<any> => {
  let runResult = await runLambda(functionName, args);
  let tryCount = 1;
  while (!runResult.result && tryCount < totalTry) {
    await waitAndUpdateLambda(functionName);
    runResult = await runLambda(functionName, args);
    tryCount++;
  }
  if (!runResult.result) {
    throw new Error(
      `リトライ数超過。lambda実行に失敗しました。 functionName: ${functionName}, args: ${JSON.stringify(
        args
      )} data: ${JSON.stringify(runResult.data)}`
    );
  }
  return runResult.data;
};
