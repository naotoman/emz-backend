import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import chromium from "@sparticuz/chromium";
import { getFormattedDate, log } from "common/utils";
import { BrowserContext, Page, chromium as playwright } from "playwright-core";
import { Merc, Mshop, scrapeMerc, scrapeMshop, ScrapeResult } from "./scraper";
import { randomUserAgent } from "./useragent";

interface User {
  username: string;
  sellerBlacklist: string[];
}

interface Item {
  orgPlatform: string;
  orgUrl: string;
  ebaySku: string;
}

interface AppParams {
  r2Domain: string;
  r2Endpoint: string;
  r2Bucket: string;
  r2Prefix: string;
  r2KeySsmParamName: string;
}

interface Event {
  Records: {
    body: string;
  }[];
}

interface Body {
  stateMachineArn: string;
  item: Item;
  user: User;
  appParams: AppParams;
}

// Reuse the browser context during warm starts
let __context: BrowserContext | null = null;

const getContext = async (): Promise<BrowserContext> => {
  if (__context == null) {
    const browser = await playwright.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
    });
    __context = await browser.newContext({ userAgent: randomUserAgent() });
  }
  return __context;
};

const playMerc = async (page: Page): Promise<ScrapeResult<Merc>> => {
  const failureLocator = page.locator("div.merEmptyState");
  const priceLocator = page.locator('#item-info div[data-testid="price"]');
  const imageLocator = page.locator('article div[data-testid="image-0"] img');
  const userLocator = page.locator("div.merUserObject");
  await failureLocator.or(priceLocator).waitFor({ timeout: 16000 });
  await failureLocator.or(imageLocator).waitFor({ timeout: 16000 });
  await failureLocator.or(userLocator).waitFor({ timeout: 16000 });

  page.on("console", (msg) => console.log(msg.text()));
  const scrapeResult = await page.evaluate(scrapeMerc);
  return scrapeResult;
};

const playMshop = async (page: Page): Promise<ScrapeResult<Mshop>> => {
  const failureLocator = page.locator("div.merEmptyState");
  const priceLocator = page.locator(
    '#product-info div[data-testid="product-price"]'
  );
  const imageLocator = page.locator('article div[data-testid="image-0"] img');
  const userLocator = page.locator("div.merUserObject");
  await failureLocator.or(priceLocator).waitFor({ timeout: 16000 });
  await failureLocator.or(imageLocator).waitFor({ timeout: 16000 });
  await failureLocator.or(userLocator).waitFor({ timeout: 16000 });

  page.on("console", (msg) => console.log(msg.text()));
  const scrapeResult = await page.evaluate(scrapeMshop);
  return scrapeResult;
};

const sendToSqs = async (
  body: Body,
  scrapeResult: ScrapeResult<Merc | Mshop>,
  r2ImagePaths: string[]
) => {
  const sqsClient = new SQSClient();
  const sqsCommand = new SendMessageCommand({
    QueueUrl: process.env.R2_QUEUE_URL,
    MessageGroupId: process.env.QUEUE_ID,
    MessageBody: JSON.stringify({
      orgImageUrls: scrapeResult.stockData?.core.imageUrls,
      r2Bucket: body.appParams.r2Bucket,
      r2ImagePaths,
      r2KeySsmParamName: body.appParams.r2KeySsmParamName,
      r2Endpoint: body.appParams.r2Endpoint,
    }),
  });
  await sqsClient.send(sqsCommand);
};

const startStepFunction = async (
  body: Body,
  scrapeResult: ScrapeResult<Merc | Mshop>,
  timestamp: string,
  r2ImagePaths: string[]
) => {
  const sfnClient = new SFNClient();
  const sfnCommand = new StartExecutionCommand({
    name: `${body.user.username}-${body.item.ebaySku}-${timestamp}`,
    input: JSON.stringify({
      user: body.user,
      appParams: body.appParams,
      item: {
        ...body.item,
        orgImageUrls: scrapeResult.stockData?.core.imageUrls,
        orgPrice: scrapeResult.stockData?.core.price,
        orgTitle: scrapeResult.stockData?.core.title,
        orgDescription: scrapeResult.stockData?.core.description,
        orgExtraParam: scrapeResult.stockData?.extra,
        ebayImageUrls: r2ImagePaths.map(
          (path) => new URL(path, body.appParams.r2Domain).href
        ),
      },
    }),
    stateMachineArn: process.env.SFN_ARN,
  });
  await sfnClient.send(sfnCommand);
};

export const handler = async (event: Event) => {
  console.log(event);
  const bodyStr = event.Records[0]?.body;
  if (bodyStr == null) {
    throw new Error("body is null");
  }
  const body: Body = JSON.parse(bodyStr);

  const context = await getContext();
  const page = await context.newPage();
  let scrapeResult: ScrapeResult<Merc | Mshop>;
  try {
    await page.goto(body.item.orgUrl);
    const scraper = (() => {
      if (body.item.orgPlatform === "merc") {
        return playMerc;
      } else if (body.item.orgPlatform === "mshop") {
        return playMshop;
      } else {
        throw new Error(`invalid platform: ${body.item.orgPlatform}`);
      }
    })();
    scrapeResult = await scraper(page);
    log({ scrapeResult });
  } finally {
    await page.close();
  }
  if (
    scrapeResult.stockStatus === "outofstock" ||
    scrapeResult.stockData == null ||
    scrapeResult.stockData.core.price >= 100000 ||
    scrapeResult.stockData.extra.isPayOnDelivery ||
    scrapeResult.stockData.extra.rateScore < 4.8 ||
    scrapeResult.stockData.extra.rateCount < 10 ||
    scrapeResult.stockData.extra.shippedFrom === "沖縄県" ||
    scrapeResult.stockData.extra.shippedFrom === "海外" ||
    (scrapeResult.stockData.extra.shippedWithin === "4~7日で発送" &&
      scrapeResult.stockData.extra.shippingMethod.includes("普通郵便")) ||
    (scrapeResult.stockData.extra.shippedWithin === "4~7日で発送" &&
      scrapeResult.stockData.extra.shippingMethod === "未定") ||
    scrapeResult.stockData.extra.itemCondition === "新品、未使用" ||
    [
      "即購入禁止",
      "即購入不可",
      "コメント必須",
      "海外製",
      "海外から発送",
      "海外からの発送",
    ].some((keyword) =>
      scrapeResult.stockData?.core.description.includes(keyword)
    ) ||
    body.user.sellerBlacklist.includes(scrapeResult.stockData.extra.sellerId)
  ) {
    const ddbClient = new DynamoDBClient({});
    const command = new UpdateItemCommand({
      TableName: process.env.TABLE_NAME,
      Key: {
        id: { S: `ITEM#${body.user.username}#${body.item.ebaySku}` },
      },
      UpdateExpression:
        "set isDraft = :isDraft, createdAt = :createdAt, username = :username, orgUrl = :orgUrl, orgPlatform = :orgPlatform",
      ExpressionAttributeValues: {
        ":isDraft": { BOOL: true },
        ":createdAt": { S: getFormattedDate(new Date()) },
        ":username": { S: body.user.username },
        ":orgUrl": { S: body.item.orgUrl },
        ":orgPlatform": { S: body.item.orgPlatform },
      },
      ConditionExpression: "attribute_not_exists(id)",
    });
    await ddbClient.send(command);
    return;
  } else if (scrapeResult.stockStatus === "instock") {
    const timestamp = Date.now().toString();
    const r2ImagePaths = scrapeResult.stockData?.core.imageUrls.map(
      (_, i) =>
        `${body.appParams.r2Prefix}/item-images/${body.item.ebaySku}/${timestamp}/image-${i}.jpg`
    );
    log({ r2ImagePaths });
    if (r2ImagePaths == null) {
      throw new Error("r2ImagePaths is null");
    }
    await sendToSqs(body, scrapeResult, r2ImagePaths);
    await startStepFunction(body, scrapeResult, timestamp, r2ImagePaths);
  } else {
    throw new Error(`invalid stock status: ${scrapeResult}`);
  }
};
