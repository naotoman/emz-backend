import chromium from "@sparticuz/chromium";
import { BrowserContext, Page, chromium as playwright } from "playwright-core";
import { randomUserAgent } from "./useragent";

let context: BrowserContext | null = null;

interface Stock {
  imageUrls: string[];
  price: number;
  isPayOnDelivery: boolean;
  rateScore: number;
  rateCount: number;
  shippedFrom: string;
  shippingMethod: string;
  shippedWithin: string;
  sellerId: string;
  lastUpdated: string;
}

interface StockInfo {
  stockStatus: "instock" | "outofstock";
  stockData: Stock | {};
}
interface ScrapeResult {
  stockStatus: string;
  stockData: Partial<Stock> | {};
}

const renewGlobalContext = async (): Promise<void> => {
  if (context == null) {
    const browser = await playwright.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
    });
    context = await browser.newContext({ userAgent: randomUserAgent() });
  }
};

const validatedStockData = (stock: Partial<Stock>): Stock => {
  const errorMessages = [];
  if (!stock.imageUrls) {
    errorMessages.push(`imageUrls is missing: ${stock.imageUrls}`);
  }
  if (stock.imageUrls?.length === 0) {
    errorMessages.push("imageUrls is empty");
  }
  if (!stock.price) {
    errorMessages.push(`price is missing: ${stock.price}`);
  }
  if (stock.isPayOnDelivery == null) {
    errorMessages.push(`isPayOnDelivery is missing: ${stock.isPayOnDelivery}`);
  }
  if (stock.rateScore == null) {
    errorMessages.push(`rateScore is missing: ${stock.rateScore}`);
  }
  if (stock.rateCount == null) {
    errorMessages.push(`rateCount is missing: ${stock.rateCount}`);
  }
  if (!stock.shippedFrom) {
    errorMessages.push(`shippedFrom is missing: ${stock.shippedFrom}`);
  }
  if (!stock.shippingMethod) {
    errorMessages.push(`shippingMethod is missing: ${stock.shippingMethod}`);
  }
  if (!stock.shippedWithin) {
    errorMessages.push(`shippedWithin is missing: ${stock.shippedWithin}`);
  }
  if (!stock.sellerId) {
    errorMessages.push(`sellerId is missing: ${stock.sellerId}`);
  }
  if (!stock.lastUpdated) {
    errorMessages.push(`lastUpdated is missing: ${stock.lastUpdated}`);
  }
  if (errorMessages.length > 0) {
    throw new Error(errorMessages.join("\n"));
  }
  return stock as Stock;
};

const scrapeMercari = async (page: Page): Promise<StockInfo> => {
  const failureLocator = page.locator("div.merEmptyState");
  const priceLocator = page.locator('#item-info div[data-testid="price"]');
  const imageLocator = page.locator('article div[data-testid="image-0"] img');
  await failureLocator.or(priceLocator).waitFor({ timeout: 16000 });
  await failureLocator.or(imageLocator).waitFor({ timeout: 8000 });

  page.on("console", (msg) => console.log(msg.text()));
  const scrapeResult = await page.evaluate(async (): Promise<ScrapeResult> => {
    if (document.querySelector("#main div.merEmptyState")) {
      console.log("page is empty");
      return { stockStatus: "outofstock", stockData: {} };
    }
    if (
      document.querySelector(
        'article div[data-testid="image-0"][aria-label="売り切れ"]'
      )
    ) {
      console.log("sold out");
      return { stockStatus: "outofstock", stockData: {} };
    }
    const imageUrls = Array.from(
      document.querySelectorAll<HTMLImageElement>(
        'article div[data-testid^="image-"] img'
      )
    ).map((img) => img.src);
    console.log(JSON.stringify({ imageUrls }));

    const priceSpans = document.querySelectorAll<HTMLSpanElement>(
      '#item-info div[data-testid="price"] span'
    );
    const priceStr = priceSpans[1]?.textContent?.replace(/,/g, "");
    const price = Number(priceStr);
    console.log({ price });

    const lastUpdated = document
      .querySelectorAll("#item-info > section")[1]
      ?.querySelector("p.merText")?.textContent;
    console.log({ lastUpdated });

    const isPayOnDelivery = document
      .querySelector('#item-info span[data-testid="配送料の負担"]')
      ?.textContent?.includes("着払い");
    console.log({ isPayOnDelivery });

    const shippingMethod = document.querySelector(
      '#item-info span[data-testid="配送の方法"]'
    )?.textContent;
    console.log({ shippingMethod });

    const shippedFrom = document.querySelector(
      '#item-info span[data-testid="発送元の地域"]'
    )?.textContent;
    console.log({ shippedFrom });

    const shippedWithin = document.querySelector(
      '#item-info span[data-testid="発送までの日数"]'
    )?.textContent;
    console.log({ shippedWithin });

    const sellerId = document.querySelector<HTMLAnchorElement>(
      'a[data-location="item_details:seller_info"]'
    )?.pathname;
    console.log({ sellerId });

    const rateScoreStr = document
      .querySelector("div.merUserObject div.merRating")
      ?.getAttribute("aria-label");
    const rateScore = Number(rateScoreStr);
    console.log({ rateScore });

    const rateCountStr = document.querySelector(
      'div.merUserObject div.merRating span[class^="count__"]'
    )?.textContent;
    const rateCount = Number(rateCountStr);
    console.log({ rateCount });

    return {
      stockStatus: "instock",
      stockData: {
        imageUrls: imageUrls,
        price: price,
        lastUpdated: lastUpdated,
        isPayOnDelivery: isPayOnDelivery,
        shippingMethod: shippingMethod,
        shippedFrom: shippedFrom,
        shippedWithin: shippedWithin,
        sellerId: sellerId,
        rateScore: rateScore,
        rateCount: rateCount,
      },
    };
  });
  console.log({ scrapeResult });
  if (scrapeResult.stockStatus === "outofstock") {
    return { stockStatus: "outofstock", stockData: {} };
  } else if (scrapeResult.stockStatus === "instock") {
    return {
      stockStatus: "instock",
      stockData: validatedStockData(scrapeResult.stockData),
    };
  } else {
    throw new Error("stockStatus is invalid");
  }
};

const scrapeMercariShops = async (page: Page): Promise<StockInfo> => {
  const failureLocator = page.locator("div.merEmptyState");
  const priceLocator = page.locator(
    '#product-info div[data-testid="product-price"]'
  );
  const imageLocator = page.locator('article div[data-testid="image-0"] img');
  await failureLocator.or(priceLocator).waitFor({ timeout: 10000 });
  await failureLocator.or(imageLocator).waitFor({ timeout: 10000 });

  page.on("console", (msg) => console.log(msg.text()));
  const scrapeResult = await page.evaluate(async (): Promise<ScrapeResult> => {
    // await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    if (document.querySelector("#main div.merEmptyState")) {
      console.log("page is empty");
      return { stockStatus: "outofstock", stockData: {} };
    }
    if (
      document.querySelector(
        'article div[data-testid="image-0"][aria-label="売り切れ"]'
      )
    ) {
      console.log("sold out");
      return { stockStatus: "outofstock", stockData: {} };
    }
    const imageUrls = Array.from(
      document.querySelectorAll<HTMLImageElement>(
        'article div[data-testid^="image-"] img'
      )
    ).map((img) => img.src);
    console.log(JSON.stringify({ imageUrls }));

    const priceSpans = document.querySelectorAll<HTMLSpanElement>(
      '#product-info div[data-testid="product-price"] span'
    );
    const priceStr = priceSpans[1]?.textContent?.replace(/,/g, "");
    const price = Number(priceStr);
    console.log({ price });

    const lastUpdated = document
      .querySelectorAll("#product-info > section")[1]
      ?.querySelector("p.merText")?.textContent;
    console.log({ lastUpdated });

    const isPayOnDelivery = document
      .querySelector('#product-info span[data-testid="配送料の負担"]')
      ?.textContent?.includes("着払い");
    console.log({ isPayOnDelivery });

    const shippingMethod = document.querySelector(
      '#product-info span[data-testid="配送の方法"]'
    )?.textContent;
    console.log({ shippingMethod });

    const shippedFrom = document.querySelector(
      '#product-info span[data-testid="発送元の地域"]'
    )?.textContent;
    console.log({ shippedFrom });

    const shippedWithin = document.querySelector(
      '#product-info span[data-testid="発送までの日数"]'
    )?.textContent;
    console.log({ shippedWithin });

    const sellerId = document.querySelector<HTMLAnchorElement>(
      'a[data-location="item_details:shop_info"]'
    )?.pathname;
    console.log({ sellerId });

    const rateScoreStr = document
      .querySelector("div.merUserObject div.merRating")
      ?.getAttribute("aria-label");
    const rateScore = Number(rateScoreStr);
    console.log({ rateScore });

    const rateCountStr = document.querySelector(
      'div.merUserObject div.merRating span[class^="count__"]'
    )?.textContent;
    const rateCount = Number(rateCountStr);
    console.log({ rateCount });

    return {
      stockStatus: "instock",
      stockData: {
        imageUrls: imageUrls,
        price: price,
        lastUpdated: lastUpdated,
        isPayOnDelivery: isPayOnDelivery,
        shippingMethod: shippingMethod,
        shippedFrom: shippedFrom,
        shippedWithin: shippedWithin,
        sellerId: sellerId,
        rateScore: rateScore,
        rateCount: rateCount,
      },
    };
  });
  console.log({ scrapeResult });
  if (scrapeResult.stockStatus === "outofstock") {
    return { stockStatus: "outofstock", stockData: {} };
  } else if (scrapeResult.stockStatus === "instock") {
    return {
      stockStatus: "instock",
      stockData: validatedStockData(scrapeResult.stockData),
    };
  } else {
    throw new Error("stockStatus is invalid");
  }
};

export const handler = async (event: { platform: string; url: string }) => {
  const scraperMap = new Map<string, (page: Page) => Promise<StockInfo>>([
    ["mercari", scrapeMercari],
    ["mshop", scrapeMercariShops],
  ]);
  await renewGlobalContext();
  const page = await context!.newPage();
  try {
    await page.goto(event.url);
    const scraper = scraperMap.get(event.platform);
    const result = await scraper!(page);
    return result;
  } finally {
    await page.close();
  }
};
