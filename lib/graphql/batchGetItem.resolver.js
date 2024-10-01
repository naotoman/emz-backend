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
  return {
    operation: "BatchGetItem",
    tables: {
      [ctx.env.TABLE_NAME]: {
        keys: ctx.args.input.urls.map((url) => {
          return { id: { S: `ITEM#${ctx.identity.username}#${urlToId(url)}` } };
        }),
      },
    },
  };
}

export function response(ctx) {
  return ctx.result.data[ctx.env.TABLE_NAME];
}
