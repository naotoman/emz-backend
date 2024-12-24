export interface StockCore {
  url: string;
  imageUrls: string[];
  price: number;
  title: string;
  description: string;
}

export interface Merc {
  isPayOnDelivery: boolean;
  rateScore: number;
  rateCount: number;
  shippedFrom: string;
  shippingMethod: string;
  shippedWithin: string;
  sellerId: string;
  lastUpdated: string;
}

export interface Mshop {
  isPayOnDelivery: boolean;
  rateScore: number;
  rateCount: number;
  shippedFrom: string;
  shippingMethod: string;
  shippedWithin: string;
  sellerId: string;
  lastUpdated: string;
}

export interface ScrapeResult<T> {
  stockStatus: "instock" | "outofstock";
  stockData?: { core: StockCore; extra: T };
}

type Scraper<T> = () => ScrapeResult<T>;

export const scrapeMerc: Scraper<Merc> = () => {
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

  const url = location.href;
  console.log({ url });

  const imageUrls = Array.from(
    document.querySelectorAll<HTMLImageElement>(
      'article div[data-testid^="image-"] img'
    )
  ).map((img) => img.src);
  console.log({ imageUrls: imageUrls.join(",") });

  const description = document.querySelector<HTMLPreElement>(
    '#item-info pre[data-testid="description"]'
  )?.textContent;
  console.log({ description });

  const title =
    document.querySelector<HTMLHeadingElement>("#item-info h1")?.textContent;
  console.log({ title });

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
    !url ||
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
    imageUrls.length === 0 ||
    !title ||
    !description
  ) {
    throw new Error(
      "Scraping failed.\n" +
        JSON.stringify(
          {
            url,
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
            title,
            description,
          },
          (_, v) => (v === undefined ? "UNDEFINED!" : v)
        )
    );
  }

  return {
    stockStatus: "instock",
    stockData: {
      core: {
        url: url,
        imageUrls: imageUrls,
        title: title,
        price: price,
        description: description,
      },
      extra: {
        lastUpdated: lastUpdated,
        isPayOnDelivery: isPayOnDelivery,
        shippingMethod: shippingMethod,
        shippedFrom: shippedFrom,
        shippedWithin: shippedWithin,
        sellerId: sellerId,
        rateScore: rateScore,
        rateCount: rateCount,
      },
    },
  };
};

export const scrapeMshop: Scraper<Mshop> = () => {
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

  const url = location.href;
  console.log({ url });

  const imageUrls = Array.from(
    document.querySelectorAll<HTMLImageElement>(
      'article div[data-testid^="image-"] img'
    )
  ).map((img) => img.src);
  console.log({ imageUrls: imageUrls.join(",") });

  const title =
    document.querySelector<HTMLHeadingElement>("#product-info h1")?.textContent;
  console.log({ title });

  const description = document.querySelector<HTMLPreElement>(
    '#product-info pre[data-testid="description"]'
  )?.textContent;
  console.log({ description });

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
    !url ||
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
    imageUrls.length === 0 ||
    !title ||
    !description
  ) {
    throw new Error(
      "Scraping failed.\n" +
        JSON.stringify(
          {
            url,
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
            title,
            description,
          },
          (_, v) => (v === undefined ? "UNDEFINED!" : v)
        )
    );
  }

  return {
    stockStatus: "instock",
    stockData: {
      core: {
        url: url,
        imageUrls: imageUrls,
        price: price,
        title: title,
        description: description,
      },
      extra: {
        lastUpdated: lastUpdated,
        isPayOnDelivery: isPayOnDelivery,
        shippingMethod: shippingMethod,
        shippedFrom: shippedFrom,
        shippedWithin: shippedWithin,
        sellerId: sellerId,
        rateScore: rateScore,
        rateCount: rateCount,
      },
    },
  };
};
