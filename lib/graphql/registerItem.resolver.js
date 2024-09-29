// import { util } from "@aws-appsync/utils";

const urlToId = (url) => {
  if (url.indexOf("jp.mercari.com/item/") >= 0) {
    return `merc-${url.split("/").pop()}`;
  } else if (url.indexOf("jp.mercari.com/shops/product/") >= 0) {
    return `mshop-${url.split("/").pop()}`;
  } else {
    util.error("url is not supported", url);
  }
};

export function request(ctx) {
  const itemId = urlToId(ctx.arguments.input.stock.url);
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
        name: `${ctx.identity.username}-${itemId}-${util.time.nowFormatted(
          "yyyyMMddHHmm",
          "+09:00"
        )}`,
        input: JSON.stringify({
          username: ctx.identity.username,
          itemId: itemId,
          ...ctx.arguments.input,
        }),
        stateMachineArn: ctx.env.SFN_ARN,
      }),
    },
  };
}

export function response(ctx) {
  return ctx.result;
}
