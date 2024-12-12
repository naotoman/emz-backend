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
          ctx.prev.result.item.ebaySku
        }-${util.time.nowFormatted("yyyyMMddHHmm", "+09:00")}`,
        input: JSON.stringify({
          user: ctx.prev.result.user,
          appParams: ctx.prev.result.appParams,
          item: {
            ...ctx.arguments.input,
            ebaySku: ctx.prev.result.item.ebaySku,
            orgPlatform: ctx.prev.result.item.orgPlatform,
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
