// import { util } from "@aws-appsync/utils";

export function request(ctx) {
  return {
    version: "2018-05-29",
    method: "POST",
    resourcePath: `/${ctx.identity.accountId}/${ctx.env.SQS_NAME}`,
    params: {
      headers: {
        "Content-Type": "application/x-amz-json-1.0",
        "X-Amz-Target": "AmazonSQS.SendMessage",
      },
      body: JSON.stringify({
        QueueUrl: ctx.env.SQS_URL,
        MessageGroupId: ctx.identity.username,
        MessageBody: JSON.stringify({
          stateMachineArn: ctx.env.SFN_ARN,
          user: ctx.prev.result.user,
          appParams: ctx.prev.result.appParams,
          item: {
            orgUrl: ctx.arguments.input.orgUrl,
            ebaySku: ctx.prev.result.item.ebaySku,
            orgPlatform: ctx.prev.result.item.orgPlatform,
          },
        }),
      }),
    },
  };
}

export function response(ctx) {
  return ctx.result;
}
