import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { marshall } from "@aws-sdk/util-dynamodb";
import { getFormattedDate, jsonStringify } from "common/utils";
import path from "path";
import { getCategoryId } from "./leafCategory";

interface Event {
  username: string;
  itemId: string;
  platform: string;
  shippingYen: number;
  distImageUrls: string[];
  stock: {
    url: string;
    imageUrls: string[];
    price: number;
    jsonParams?: string;
  };
  ebay: {
    title: string;
    category: string[];
    storeCategory: string[];
    condition: string;
    conditionDescription?: string;
    jsonParams?: string;
  };
}

interface ConditionMap {
  itemConditions: [
    {
      conditionId: string;
      conditionDescription: string;
    }
  ];
}

const fetchConditionMap = async (ebayCategory: string) => {
  const client = new S3Client();
  const input = {
    Bucket: process.env.S3_BUCKET!,
    Key: path.join(
      process.env.S3_PREFIX!,
      "conditions",
      `${ebayCategory}.json`
    ),
  };
  const command = new GetObjectCommand(input);
  const response = await client.send(command);
  const jsonStr = await response.Body?.transformToString();
  console.log({ jsonStr });
  if (!jsonStr) {
    throw new Error("Failed to get condition map");
  }
  const data: ConditionMap = JSON.parse(jsonStr);
  return data;
};

const translateToConditionId = (
  conditionMap: ConditionMap,
  conditionExpr: string
) => {
  const matched = conditionMap.itemConditions.find(
    (c) => c.conditionDescription === conditionExpr
  );
  if (!matched) {
    throw new Error(`Condition not found: ${conditionExpr}`);
  }
  return matched.conditionId;
};

const translateToEbayCondition = (conditionId: string) => {
  if (conditionId === "1000") {
    return "NEW";
  } else if (conditionId === "1500") {
    return "NEW_OTHER";
  } else if (conditionId === "1750") {
    return "NEW_WITH_DEFECTS";
  } else if (conditionId === "2500") {
    return "SELLER_REFURBISHED";
  } else if (conditionId === "2750") {
    return "LIKE_NEW";
  } else if (["3000", "3010", "3020"].includes(conditionId)) {
    return "USED_EXCELLENT";
  } else if (conditionId === "4000") {
    return "USED_VERY_GOOD";
  } else if (conditionId === "5000") {
    return "USED_GOOD";
  } else if (conditionId === "6000") {
    return "USED_ACCEPTABLE";
  } else if (conditionId === "7000") {
    return "FOR_PARTS_OR_NOT_WORKING";
  } else {
    throw new Error(`Condition Id is not valid. (${conditionId})`);
  }
};

export const getEbayCondition = async (
  ebayCategory: string,
  conditionExpr: string
) => {
  const conditionMap = await fetchConditionMap(ebayCategory);
  console.log({ conditionMap });
  const conditionId = translateToConditionId(conditionMap, conditionExpr);
  console.log({ conditionId });
  const ebayCondition = translateToEbayCondition(conditionId);
  return ebayCondition;
};

const makeDbArg = (
  toUpdate: Record<string, unknown>,
  noUpdate: Record<string, unknown>
) => {
  const res = Object.entries({ ...toUpdate, ...noUpdate }).reduce(
    (acc, [key, val], i) => {
      return {
        ExpressionAttributeNames: {
          ...acc.ExpressionAttributeNames,
          [`#n${i}`]: key,
        },
        ExpressionAttributeValues: {
          ...acc.ExpressionAttributeValues,
          [`:v${i}`]: val,
        },
        UpdateExpression:
          acc.UpdateExpression +
          (key in noUpdate
            ? `#n${i} = if_not_exists(#n${i}, :v${i}), `
            : `#n${i} = :v${i}, `),
      };
    },
    {
      ExpressionAttributeNames: {} as Record<string, string>,
      ExpressionAttributeValues: {} as Record<string, any>,
      UpdateExpression: "SET ",
    }
  );
  res.ExpressionAttributeValues = marshall(res.ExpressionAttributeValues);
  res.UpdateExpression = res.UpdateExpression.slice(0, -2);
  return res;
};

export const makeDbInput = (
  event: Event,
  ebayCategory: string,
  ebayCondition: string,
  createdAt: string
) => {
  const keyVal = `ITEM#${event.username}#${event.itemId}`;
  const toUpdate = {
    createdAt: createdAt,
    isImageChanged: false,
    username: event.username,
    platform: event.platform,
    shippingYen: event.shippingYen,
    ebaySku: event.itemId,
    ebayImageUrls: event.distImageUrls,
    ebayTitle: event.ebay.title,
    ebayCategory: ebayCategory,
    ebayStoreCategory: event.ebay.storeCategory.join(" > "),
    ebayCondition: ebayCondition,
    orgUrl: event.stock.url,
    orgImageUrls: event.stock.imageUrls,
    orgPrice: event.stock.price,
    ...JSON.parse(event.ebay.jsonParams || "{}"),
    ...JSON.parse(event.stock.jsonParams || "{}"),
  };

  if (event.ebay.conditionDescription) {
    toUpdate.ebayConditionDescription = event.ebay.conditionDescription;
  }

  const noUpdate = {
    isListed: false,
    isInStock: true,
  };

  return {
    TableName: process.env.TABLE_NAME!,
    Key: {
      id: { S: keyVal },
    },
    ...makeDbArg(toUpdate, noUpdate),
  };
};

export const handler = async (event: Event) => {
  console.log(jsonStringify(event));

  const ebayCategory = getCategoryId(event.ebay.category);
  console.log({ ebayCategory });
  const ebayCondition = await getEbayCondition(
    ebayCategory,
    event.ebay.condition
  );
  console.log({ ebayCondition });
  const createdAt = getFormattedDate(new Date());

  const input = makeDbInput(event, ebayCategory, ebayCondition, createdAt);
  console.log(input);

  const ddbClient = new DynamoDBClient({});
  const command = new UpdateItemCommand(input);
  await ddbClient.send(command);
};
