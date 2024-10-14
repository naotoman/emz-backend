import {
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import { getSecureSsmParam } from "common/ssmParamExtension";
import { log } from "common/utils";
import { mintAccessToken } from "./ebay";

interface User {
  username: string;
  fulfillmentPolicy: string;
  returnPolicy: string;
  shippingPolicy: string;
  paymentPolicy: string;
  profitRatio: number;
  merchantLocationKey: string;
}

interface Item {
  shippingYen: number;
  orgPrice: number;
  ebaySku: string;
  ebayTitle: string;
  ebayDescription: string;
  ebayCategory: string;
  ebayStoreCategory: string;
  ebayCondition: string;
  ebayConditionDescription?: string;
  ebayImageUrls: string[];
  ebayAspectParam: Record<string, unknown>;
  ebayProductParam: Record<string, unknown>;
}

interface Event {
  user: User;
  item: Item;
  appParams: {
    ebayIsSandbox: boolean;
    ebayAppKeySsmParamName: string;
    ebayUserTokenSsmParamPrefix: string;
    usdJpy: number;
  };
}

type JudgeListing = "LIST" | "WITHDRAW" | "NOTHING";

const calcFreeshipPrice = (
  stockPrice: number,
  usdJpy: number, //(USD/JPY)
  profitRatio: number,
  shipping: number,
  salesFeeRatio = 0.17
) => {
  return (stockPrice + shipping) / (usdJpy * (1 - profitRatio - salesFeeRatio));
};

export const cacheGetAccessToken = async (
  ebayAppKeySsmParamName: string,
  ebayUserTokenSsmParamName: string,
  ebayIsSandbox: boolean
) => {
  const keysStr = await getSecureSsmParam(ebayAppKeySsmParamName);
  const keys = JSON.parse(keysStr);

  const ssmClient = new SSMClient({});
  const resToken = await ssmClient.send(
    new GetParameterCommand({
      Name: ebayUserTokenSsmParamName,
      WithDecryption: true,
    })
  );
  const tokens = JSON.parse(resToken.Parameter!.Value!);
  const currentTimestamp = new Date().getTime();
  if (tokens.accessToken.expiresAt - 600000 > currentTimestamp) {
    return tokens.accessToken.value;
  }
  console.log("Token expired. Refreshing...");
  const mintedToken = await mintAccessToken(
    keys["Client ID"],
    keys["Client Secret"],
    tokens.refreshToken,
    ebayIsSandbox
  );
  const newTokens = {
    refreshToken: tokens.refreshToken,
    accessToken: {
      value: mintedToken.access_token,
      expiresAt: (mintedToken.expires_in || 7200) * 1000 + currentTimestamp,
    },
  };
  ssmClient
    .send(
      new PutParameterCommand({
        Name: ebayUserTokenSsmParamName,
        Value: JSON.stringify(newTokens),
        Overwrite: true,
      })
    )
    .then((res) => res)
    .catch((err) => {
      console.log(err);
    });
  return mintedToken.access_token;
};

export const judgeListing = (event: Event): JudgeListing => {
  return "LIST";
};

export const listItem = async (event: Event) => {
  const item = event.item;
  const user = event.user;

  const inventoryPayload = {
    availability: {
      shipToLocationAvailability: {
        quantity: 1,
      },
    },
    condition: item.ebayCondition,
    // conditionDescription: "This is a test listing.",
    product: {
      title: item.ebayTitle,
      description: item.ebayDescription,
      imageUrls: item.ebayImageUrls,
      aspects: item.ebayAspectParam,
    },
  };
  log({ inventoryPayload });

  const price =
    (item.orgPrice + item.shippingYen) /
    (event.appParams.usdJpy * (1 - user.profitRatio - 0.17)); // 17% is approximate eBay sales fee + payoneer fee

  const offerPayload = {
    sku: item.ebaySku,
    marketplaceId: "EBAY_US",
    format: "FIXED_PRICE",
    availableQuantity: 1,
    categoryId: item.ebayCategory,
    listingPolicies: {
      fulfillmentPolicyId: user.fulfillmentPolicy,
      paymentPolicyId: user.paymentPolicy,
      returnPolicyId: user.returnPolicy,
    },
    pricingSummary: { price: { currency: "USD", value: price.toFixed(2) } },
    merchantLocationKey: user.merchantLocationKey,
    storeCategoryNames: [item.ebayStoreCategory],
  };
  log({ offerPayload });

  const accessToken = await cacheGetAccessToken(
    event.appParams.ebayAppKeySsmParamName,
    event.appParams.ebayUserTokenSsmParamPrefix + user.username,
    event.appParams.ebayIsSandbox
  );
};

export const withdrawItem = async (item: Item) => {};

export const handler = async (event: Event) => {
  const judge = judgeListing(event);

  if (judge === "LIST") {
    await listItem(event);
  } else if (judge === "WITHDRAW") {
    await withdrawItem(event.item);
  }
  return judge;
};
