import { getFormattedDate } from "common/utils";
import { getEbayCondition, makeDbInput } from "../src";

describe("makeDbInput", () => {
  const mockEnv = {
    TABLE_NAME: "testTable",
  };

  beforeAll(() => {
    process.env.TABLE_NAME = mockEnv.TABLE_NAME;
  });

  it("should generate correct DynamoDB input", () => {
    (getFormattedDate as jest.Mock) = jest
      .fn()
      .mockReturnValue("2023-01-01T00:00:00Z");
    const result = makeDbInput("testUser", "testSku", { k1: "v1", k2: ["v2"] });

    expect(result).toEqual({
      TableName: mockEnv.TABLE_NAME,
      Key: {
        id: { S: "ITEM#testUser#testSku" },
      },
      ExpressionAttributeNames: {
        "#n0": "createdAt",
        "#n1": "isImageChanged",
        "#n2": "k1",
        "#n3": "k2",
        "#n4": "isListed",
        "#n5": "isOrgLive",
      },
      ExpressionAttributeValues: {
        ":v0": { S: "2023-01-01T00:00:00Z" },
        ":v1": { BOOL: false },
        ":v2": { S: "v1" },
        ":v3": { L: [{ S: "v2" }] },
        ":v4": { BOOL: false },
        ":v5": { BOOL: true },
      },
      UpdateExpression:
        "SET #n0 = :v0, #n1 = :v1, #n2 = :v2, #n3 = :v3, #n4 = if_not_exists(#n4, :v4), #n5 = if_not_exists(#n5, :v5)",
    });
  });
});

describe("getEbayCondition", () => {
  const mockEnv = {
    S3_BUCKET: "test-bucket-48309",
    S3_PREFIX: "emz/test-getEbayCondition",
  };

  beforeAll(() => {
    process.env.S3_BUCKET = mockEnv.S3_BUCKET;
    process.env.S3_PREFIX = mockEnv.S3_PREFIX;
  });
  it("should return the correct condition for a given input", async () => {
    const result = await getEbayCondition("261068", "Used");
    expect(result).toBe("USED_EXCELLENT");

    const result2 = await getEbayCondition("261581", "New other (see details)");
    expect(result2).toBe("NEW_OTHER");
  });

  it("should return undefined for an unknown condition", async () => {
    await expect(getEbayCondition("261068", "nonexistent")).rejects.toThrow(
      Error
    );
  });
});
