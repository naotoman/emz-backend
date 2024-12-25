import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import chromium from "@sparticuz/chromium";
import { BrowserContext, Page, chromium as playwright } from "playwright-core";
import { Merc, Mshop, scrapeMerc, scrapeMshop, ScrapeResult } from "./scraper";
import { randomUserAgent } from "./useragent";

interface User {
  username: string;
}

interface Item {
  orgPlatform: string;
  orgUrl: string;
  ebaySku: string;
}

interface AppParams {
  [key: string]: unknown;
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

function getFormattedDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");

  return `${year}${month}${day}${hour}${minute}`;
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
    console.log({ scrapeResult });
  } finally {
    await page.close();
  }
  if (
    scrapeResult.stockStatus === "outofstock" ||
    scrapeResult.stockData?.extra.itemCondition === "新品、未使用"
  ) {
    return;
  } else if (scrapeResult.stockStatus === "instock") {
    const sfnClient = new SFNClient();
    const command = new StartExecutionCommand({
      name: `${body.user.username}-${
        body.item.ebaySku
      }-${getFormattedDateTime()}`,
      input: JSON.stringify({
        isChatgptEnabled: true,
        enhanceImages: true,
        user: body.user,
        appParams: body.appParams,
        item: {
          ...body.item,
          orgImageUrls: scrapeResult.stockData?.core.imageUrls,
          orgPrice: scrapeResult.stockData?.core.price,
          orgTitle: scrapeResult.stockData?.core.title,
          orgDescription: scrapeResult.stockData?.core.description,
          orgExtraParam: JSON.stringify(scrapeResult.stockData?.extra),
        },
      }),
      stateMachineArn: body.stateMachineArn,
    });
    await sfnClient.send(command);
  } else {
    throw new Error(`invalid stock status: ${scrapeResult}`);
  }
};
