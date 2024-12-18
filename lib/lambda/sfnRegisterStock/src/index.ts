import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { marshall } from "@aws-sdk/util-dynamodb";
import { getFormattedDate, log } from "common/utils";
import path from "path";
import { getCategoryId } from "./leafCategory";

interface User {
  username: string;
}

interface Item {
  ebaySku: string;
  ebayCategorySrc: string[];
  ebayStoreCategorySrc: string[];
  ebayCondition?: string;
  ebayConditionSrc?: string;
}

interface AppParams {
  s3Bucket: string;
  s3PathForEbayConditions: string;
}

interface Event {
  item: Item;
  user: User;
  appParams: AppParams;
}

interface ConditionMap {
  itemConditions: [
    {
      conditionId: string;
      conditionDescription: string;
    }
  ];
}

const fetchConditionMap = async (
  ebayCategory: string,
  s3Bucket: string,
  s3Path: string
) => {
  const client = new S3Client();
  const input = {
    Bucket: s3Bucket,
    Key: path.join(s3Path, `${ebayCategory}.json`),
  };
  const command = new GetObjectCommand(input);
  const response = await client.send(command);
  const jsonStr = await response.Body?.transformToString();
  log({ jsonStr });
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
    (c) => c.conditionDescription.toLowerCase() === conditionExpr.toLowerCase()
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
  ebayConditionSrc: string,
  s3Bucket: string,
  s3Path: string
) => {
  const conditionMap = await fetchConditionMap(ebayCategory, s3Bucket, s3Path);
  console.log({ conditionMap });
  const conditionId = translateToConditionId(conditionMap, ebayConditionSrc);
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
  log({ res });
  res.ExpressionAttributeValues = marshall(res.ExpressionAttributeValues);
  res.UpdateExpression = res.UpdateExpression.slice(0, -2);
  return res;
};

export const makeDbInput = (
  username: string,
  ebaySku: string,
  attrs: Record<string, unknown>
) => {
  const toUpdate = {
    createdAt: getFormattedDate(new Date()),
    isImageChanged: false,
    ...attrs,
  };

  const noUpdate = {
    isListed: false,
    isOrgLive: true,
  };

  return {
    TableName: process.env.TABLE_NAME!,
    Key: {
      id: { S: `ITEM#${username}#${ebaySku}` },
    },
    ...makeDbArg(toUpdate, noUpdate),
  };
};

export const handler = async (event: Event) => {
  log(event);

  const ebayCategory = getCategoryId(event.item.ebayCategorySrc);
  log({ ebayCategory });

  const ebayCondition =
    event.item.ebayCondition ||
    (await getEbayCondition(
      ebayCategory,
      event.item.ebayConditionSrc!,
      event.appParams.s3Bucket,
      event.appParams.s3PathForEbayConditions
    ));
  log({ ebayCondition });

  const ebayStoreCategory = "/" + event.item.ebayStoreCategorySrc.join("/");

  const attrs = {
    ...event.item,
    ebayCategory,
    ebayStoreCategory,
    ebayCondition,
    username: event.user.username,
  };
  const input = makeDbInput(event.user.username, event.item.ebaySku, attrs);
  log(input);

  const ddbClient = new DynamoDBClient({});
  const command = new UpdateItemCommand(input);
  await ddbClient.send(command);
  return {
    ...event.item,
    ebayCategory,
    ebayStoreCategory,
    ebayCondition,
  };
};
