// import { util } from "@aws-appsync/utils";

export function request(ctx) {
  return {
    version: "2018-05-29",
    method: "POST",
    resourcePath: "/",
    params: {
      headers: {
        "Content-Type": "application/x-amz-json-1.0",
        "X-Amz-Target": "AWSStepFunctions.StartExecution",
      },
      body: JSON.stringify({
        name: `${ctx.identity.username}-${
          ctx.prev.result.ebaySku
        }-${util.time.nowFormatted("yyyyMMddHHmm", "+09:00")}`,
        input: JSON.stringify({
          user: ctx.prev.result.user,
          item: {
            ebaySku: ctx.prev.result.ebaySku,
            orgPlatform: ctx.prev.result.orgPlatform,
            ...ctx.arguments.input,
          },
        }),
        stateMachineArn: ctx.env.SFN_ARN,
      }),
    },
  };
}

export function response(ctx) {
  return ctx.result;
}
