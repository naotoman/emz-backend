export interface StockCore {
  imageUrls: string[];
  price: number;
}

export interface Merc extends StockCore {
  isPayOnDelivery: boolean;
  rateScore: number;
  rateCount: number;
  shippedFrom: string;
  shippingMethod: string;
  shippedWithin: string;
  sellerId: string;
  lastUpdated: string;
}

export interface Mshop extends StockCore {
  isPayOnDelivery: boolean;
  rateScore: number;
  rateCount: number;
  shippedFrom: string;
  shippingMethod: string;
  shippedWithin: string;
  sellerId: string;
  lastUpdated: string;
}

export interface ScrapeResult<T extends StockCore> {
  stockStatus: "instock" | "outofstock";
  stockData?: T;
}

type Scraper<T extends StockCore> = () => Promise<ScrapeResult<T>>;

export const scrapeMerc: Scraper<Merc> = async () => {
  if (document.querySelector("#main div.merEmptyState")) {
    console.log("page is empty");
    return { stockStatus: "outofstock" };
  }
  if (
    document.querySelector(
      'article div[data-testid="image-0"][aria-label="売り切れ"]'
    )
  ) {
    console.log("sold out");
    return { stockStatus: "outofstock" };
  }

  const imageUrls = Array.from(
    document.querySelectorAll<HTMLImageElement>(
      'article div[data-testid^="image-"] img'
    )
  ).map((img) => img.src);
  console.log({ imageUrls: imageUrls.join(",") });

  const priceSpans = document.querySelectorAll<HTMLSpanElement>(
    '#item-info div[data-testid="price"] span'
  );
  const priceStr = priceSpans[1]?.textContent?.replace(/,/g, "");
  console.log({ priceStr });
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
  console.log({ rateScoreStr });
  const rateScore = Number(rateScoreStr);
  console.log({ rateScore });

  const rateCountStr = document.querySelector(
    'div.merUserObject div.merRating span[class^="count__"]'
  )?.textContent;
  console.log({ rateCountStr });
  const rateCount = Number(rateCountStr);
  console.log({ rateCount });

  if (
    !lastUpdated ||
    !shippingMethod ||
    !shippedFrom ||
    !shippedWithin ||
    !sellerId ||
    isPayOnDelivery == null ||
    Number.isNaN(price) ||
    price < 300 ||
    Number.isNaN(rateScore) ||
    Number.isNaN(rateCount) ||
    imageUrls.length === 0
  ) {
    throw new Error(
      "Scraping failed.\n" +
        JSON.stringify(
          {
            lastUpdated,
            shippingMethod,
            shippedFrom,
            shippedWithin,
            sellerId,
            isPayOnDelivery,
            price,
            rateScore,
            rateCount,
            imageUrls,
          },
          (_, v) => (v === undefined ? "UNDEFINED!" : v)
        )
    );
  }

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
};

export const scrapeMshop: Scraper<Mshop> = async () => {
  if (document.querySelector("#main div.merEmptyState")) {
    console.log("page is empty");
    return { stockStatus: "outofstock" };
  }
  if (
    document.querySelector(
      'article div[data-testid="image-0"][aria-label="売り切れ"]'
    )
  ) {
    console.log("sold out");
    return { stockStatus: "outofstock" };
  }

  const imageUrls = Array.from(
    document.querySelectorAll<HTMLImageElement>(
      'article div[data-testid^="image-"] img'
    )
  ).map((img) => img.src);
  console.log({ imageUrls: imageUrls.join(",") });

  const priceSpans = document.querySelectorAll<HTMLSpanElement>(
    '#product-info div[data-testid="product-price"] span'
  );
  const priceStr = priceSpans[1]?.textContent?.replace(/,/g, "");
  console.log({ priceStr });
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
  console.log({ rateScoreStr });
  const rateScore = Number(rateScoreStr);
  console.log({ rateScore });

  const rateCountStr = document.querySelector(
    'div.merUserObject div.merRating span[class^="count__"]'
  )?.textContent;
  console.log({ rateCountStr });
  const rateCount = Number(rateCountStr);
  console.log({ rateCount });

  if (
    !lastUpdated ||
    !shippingMethod ||
    !shippedFrom ||
    !shippedWithin ||
    !sellerId ||
    isPayOnDelivery == null ||
    Number.isNaN(price) ||
    price < 300 ||
    Number.isNaN(rateScore) ||
    Number.isNaN(rateCount) ||
    imageUrls.length === 0
  ) {
    throw new Error(
      "Scraping failed.\n" +
        JSON.stringify(
          {
            lastUpdated,
            shippingMethod,
            shippedFrom,
            shippedWithin,
            sellerId,
            isPayOnDelivery,
            price,
            rateScore,
            rateCount,
            imageUrls,
          },
          (_, v) => (v === undefined ? "UNDEFINED!" : v)
        )
    );
  }

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
};
