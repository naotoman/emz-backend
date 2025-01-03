// import { util } from "@aws-appsync/utils";

export function request(ctx) {
  return {
    version: "2018-05-29",
    method: "POST",
    resourcePath: `/${ctx.env.ACCOUNT_ID}/${ctx.env.SQS_NAME_2}`,
    params: {
      headers: {
        "Content-Type": "application/x-amz-json-1.0",
        "X-Amz-Target": "AmazonSQS.SendMessage",
      },
      body: JSON.stringify({
        QueueUrl: ctx.env.SQS_URL_2,
        MessageGroupId: ctx.identity.username,
        MessageDeduplicationId: `${ctx.identity.username}#${ctx.prev.result.item.ebaySku}`,
        MessageBody: JSON.stringify({
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
