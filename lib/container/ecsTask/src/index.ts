import * as ddb from "./dynamodbUtils";
import { retryRunLambda } from "./lambdaUtils";
import TableScanner from "./tableScanner";
import { dateGap, getFormattedDate } from "./utils";

export interface Item {
  id: string;
  username: string;
  orgPlatform: string;
  shippingYen: number;
  isListed: boolean;
  createdAt: string;
  isOrgLive: boolean;
  isImageChanged: boolean;
  // ebayTitle: string;
  // ebayDescription: String!
  // ebayCategorySrc: [String!]!
  // ebayStoreCategorySrc: [String!]!
  // ebayCondition: String
  // ebayConditionSrc: String
  // ebayConditionDescription: String
  // ebayAspectParam: AWSJSON
  orgUrl: string;
  orgImageUrls: string[];
  orgPrice: number;
  orgExtraParam: {
    isPayOnDelivery?: boolean;
    rateScore?: number;
    rateCount?: number;
    shippedFrom?: string;
    shippedWithin?: string;
    shippingMethod?: string;
    sellerId?: string;
  };
}

export interface User {
  id: string;
  sellerBlacklist: string[];
}

export interface AppParams {
  id: string;
}

export interface ScrapeResult {
  stockStatus: "instock" | "outofstock";
  stockData?: {
    core: { url: string; imageUrls: string[]; price: number };
    extra: unknown;
  };
}

export const shouldDelete = (item: Item): boolean =>
  !item.isListed && dateGap(getFormattedDate(new Date()), item.createdAt) > 180;

export const shouldScrape = (item: Item): boolean =>
  item.isOrgLive && !item.isImageChanged && item.isListed;

// TODO ブラックリストセラーIDの実装
export const shouldList = (item: Item, user: User): boolean => {
  return (
    item.isOrgLive &&
    !item.isImageChanged &&
    item.orgPrice < 100000 &&
    !item.orgExtraParam.isPayOnDelivery &&
    (item.orgExtraParam.rateScore == null ||
      item.orgExtraParam.rateScore > 4.8) &&
    (item.orgExtraParam.rateCount == null ||
      item.orgExtraParam.rateCount > 10) &&
    item.orgExtraParam.shippedFrom !== "沖縄県" &&
    item.orgExtraParam.shippedFrom !== "海外" &&
    !(
      item.orgExtraParam.shippedWithin === "4~7日で発送" &&
      item.orgExtraParam.shippingMethod?.includes("普通郵便")
    ) &&
    !(
      item.orgExtraParam.shippedWithin === "4~7日で発送" &&
      item.orgExtraParam.shippingMethod === "未定"
    ) &&
    !user.sellerBlacklist.includes(item.orgExtraParam.sellerId || "tmp")
    // item.lastUpdated !== "半年以上前" &&
    // 該当商品が売れた場合、売れてから仕入れるまでのラグを考慮して48時間経過するまでは再出品しない。
    // 売れた後、より安い商品が見つかった場合など必ずしも同一商品を仕入れない可能性があるので、再出品できる余地を残す。
    // (!item.soldTimeStamp || currentTime - item.soldTimeStamp > 172800)
  );
};

export const runScrapeLambda = async (item: Item): Promise<ScrapeResult> => {
  const scrapeInfo = await retryRunLambda(
    process.env["SCRAPE_LAMBDA_NAME"] as string,
    { url: item.orgUrl, platform: item.orgPlatform },
    2
  );
  return scrapeInfo;
};

export const runListLambda = async (
  item: Item,
  user: User,
  appParams: AppParams
) => {
  await retryRunLambda(
    process.env["LISTING_LAMBDA_NAME"] as string,
    { command: "list", item: item, user: user, appParams: appParams },
    1
  );
};

export const runUnlistLambda = async (
  item: Item,
  user: User,
  appParams: AppParams
) => {
  await retryRunLambda(
    process.env["LISTING_LAMBDA_NAME"] as string,
    { command: "unlist", item: item, user: user, appParams: appParams },
    1
  );
};

export const processItem = async (
  item: Item,
  user: User,
  appParams: AppParams
) => {
  console.log(`scanInventory processItem ${item.id}`);
  // 引数を変更しないように新しいitemを作成。
  item = structuredClone(item);

  // 1 itemをinventory dbから削除するか
  if (shouldDelete(item)) {
    console.log(`delete item: ${item.id}`);
    await ddb.deleteItem(process.env.TABLE_NAME as string, "id", item.id);
    return;
  }

  // 2 scrapingして在庫情報を更新するか
  if (shouldScrape(item)) {
    console.log(`scrape item: ${item.id}`);
    const stockInfo: ScrapeResult = await runScrapeLambda(item);
    // jestのMockテストでtoHaveBeenCalledWithを使うため、関数実行後に元のitemの中身を変更しないように新しいitemを作成。
    // https://github.com/jestjs/jest/issues/7950
    // https://github.com/jestjs/jest/issues/8779
    item = structuredClone(item);
    item.isOrgLive = stockInfo.stockStatus === "instock";
    if (item.isOrgLive) {
      const stock = stockInfo.stockData;
      item = {
        ...item,
        orgImageUrls: stock!.core.imageUrls,
        orgPrice: stock!.core.price,
        orgExtraParam: stock!.extra,
        isImageChanged:
          item.isImageChanged ||
          item.orgImageUrls.toString() !== stock!.core.imageUrls.toString(),
      };
    }
  }

  //   実際にebayに出品するか
  if (shouldList(item, user)) {
    console.log(`list item: ${item.id}`);
    await runListLambda(item, user, appParams);
    // jest Mockテスト用
    item = { ...structuredClone(item), isListed: true };
  } else if (item.isListed || Math.random() < 0.1) {
    // jest Mockテスト用
    console.log(`unlist item: ${item.id}`);
    await runUnlistLambda(item, user, appParams);
    item = { ...structuredClone(item), isListed: false };
  }

  // 4 db更新
  const { id, ...updateInput } = item;
  console.log(
    JSON.stringify(
      {
        type: "info",
        title: "updateItem",
        message: updateInput,
      },
      (k, v) => (v == null ? "!!! WARNING UNDEFINED" : v)
    )
  );
  await ddb.updateItem(process.env.TABLE_NAME as string, "id", id, updateInput);
};

const scanInventory = async (): Promise<void> => {
  const appParams = await ddb.getItem(
    process.env.TABLE_NAME as string,
    "id",
    "PARAMS"
  );
  const users = new Map<string, User>();
  const scanner = new TableScanner(process.env.TABLE_NAME as string);
  while (scanner.hasNext()) {
    const items: Item[] = await scanner.next();
    for (const item of items) {
      if (!item.id.startsWith("ITEM#")) {
        continue;
      }
      try {
        if (!users.has(item.username)) {
          const user = await ddb.getItem(
            process.env.TABLE_NAME as string,
            "id",
            `USER#${item.username}`
          );
          users.set(item.username, user as User);
        }
        await processItem(item, users.get(item.username) as User, appParams);
      } catch (err) {
        console.error(err);
      }
    }
  }
};

if (require.main === module) {
  scanInventory()
    .then(() =>
      console.log(
        JSON.stringify({
          type: "info",
          title: "scanInventory successfully ended.",
        })
      )
    )
    .catch((err) =>
      console.error(
        JSON.stringify({
          type: "error",
          title: "scanInventory ended with error.",
          message: err.stack,
        })
      )
    );
}
