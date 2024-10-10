const getItemInfo = (url) => {
  if (url.indexOf("jp.mercari.com/item/") >= 0) {
    return { ebaySku: `merc-${url.split("/").pop()}`, orgPlatform: "merc" };
  } else if (url.indexOf("jp.mercari.com/shops/product/") >= 0) {
    return { ebaySku: `mshop-${url.split("/").pop()}`, orgPlatform: "mshop" };
  } else {
    util.error("The url is not supported.", "URL_NOT_SUPPORTED", url, url);
  }
};

export function request(ctx) {
  return {
    operation: "BatchGetItem",
    tables: {
      [ctx.env.TABLE_NAME]: {
        keys: [
          { id: { S: `USER#${ctx.identity.username}` } },
          { id: { S: "PARAMS" } },
        ],
      },
    },
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  const userData = ctx.result.data[ctx.env.TABLE_NAME][0];
  const appParams = ctx.result.data[ctx.env.TABLE_NAME][1];
  if (userData.listedCount >= userData.maxListedCount) {
    util.error(
      "The maximum number of items that can be listed has been reached.",
      "MAX_LISTED_COUNT_REACHED",
      "example1",
      "example2"
    );
  }
  const { ebaySku, orgPlatform } = getItemInfo(ctx.arguments.input.orgUrl);
  return {
    user: userData,
    appParams: appParams,
    item: { ebaySku, orgPlatform },
  };
}
