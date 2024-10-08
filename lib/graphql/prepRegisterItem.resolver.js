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
    operation: "GetItem",
    key: { id: { S: `USER#${ctx.identity.username}` } },
  };
}

export function response(ctx) {
  if (ctx.result.listedCount >= ctx.result.maxListedCount) {
    util.error(
      "The maximum number of items that can be listed has been reached.",
      "MAX_LISTED_COUNT_REACHED",
      "example1",
      "example2"
    );
  }
  const { ebaySku, orgPlatform } = getItemInfo(ctx.arguments.input.orgUrl);
  return { user: ctx.result, ebaySku, orgPlatform };
}
