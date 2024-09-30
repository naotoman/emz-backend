import chromium from "@sparticuz/chromium";
import { BrowserContext, Page, chromium as playwright } from "playwright-core";
import { Merc, Mshop, scrapeMerc, scrapeMshop, ScrapeResult } from "./scraper";
import { randomUserAgent } from "./useragent";

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
  await failureLocator.or(priceLocator).waitFor({ timeout: 16000 });
  await failureLocator.or(imageLocator).waitFor({ timeout: 8000 });

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
  await failureLocator.or(priceLocator).waitFor({ timeout: 16000 });
  await failureLocator.or(imageLocator).waitFor({ timeout: 8000 });

  page.on("console", (msg) => console.log(msg.text()));
  const scrapeResult = await page.evaluate(scrapeMshop);
  return scrapeResult;
};

export const handler = async (event: { platform: string; url: string }) => {
  const context = await getContext();
  const page = await context.newPage();
  try {
    await page.goto(event.url);
    const scraper = (() => {
      if (event.platform === "merc") {
        return playMerc;
      } else if (event.platform === "mshop") {
        return playMshop;
      } else {
        throw new Error(`invalid platform: ${event.platform}`);
      }
    })();
    const result = await scraper(page);
    console.log({ result });
    return result;
  } finally {
    await page.close();
  }
};
