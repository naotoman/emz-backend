import { getEbayCondition, makeDbInput } from "../src";

describe("makeDbInput", () => {
  const mockEvent = {
    username: "testUser",
    itemId: "testItem",
    shippingYen: 1000,
    distImageUrls: ["https://example.com/image1.jpg"],
    stock: {
      url: "https://example.com/stock",
      imageUrls: ["https://example.com/stock1.jpg?foobar"],
      price: 2000,
      jsonParams: '{"stockParam1": "1", "stockParam2": 1}',
    },
    ebay: {
      title: "Test Item",
      category: [
        "Toys & Hobbies",
        "Action Figures & Accessories",
        "Action Figures",
      ],
      storeCategory: ["storeCat1", "storeCat2"],
      condition: "Used",
      jsonParams: '{"ebayParam1": true}',
    },
  };

  const mockEnv = {
    TABLE_NAME: "testTable",
  };

  beforeAll(() => {
    process.env.TABLE_NAME = mockEnv.TABLE_NAME;
  });

  it("should generate correct DynamoDB input", () => {
    const ebayCategory = "99999";
    const ebayCondition = "NEW";
    const createdAt = "2023-01-01T00:00:00Z";

    const result = makeDbInput(
      mockEvent,
      ebayCategory,
      ebayCondition,
      createdAt
    );

    expect(result).toEqual({
      TableName: mockEnv.TABLE_NAME,
      Key: {
        id: { S: "ITEM#testUser#testItem" },
      },
      ExpressionAttributeNames: {
        "#n0": "createdAt",
        "#n1": "isImageChanged",
        "#n2": "username",
        "#n3": "shippingYen",
        "#n4": "ebaySku",
        "#n5": "ebayImageUrls",
        "#n6": "ebayTitle",
        "#n7": "ebayCategory",
        "#n8": "ebayStoreCategory",
        "#n9": "ebayCondition",
        "#n10": "orgUrl",
        "#n11": "orgImageUrls",
        "#n12": "orgPrice",
        "#n13": "ebayParam1",
        "#n14": "stockParam1",
        "#n15": "stockParam2",
        "#n16": "isListed",
        "#n17": "isInStock",
      },
      ExpressionAttributeValues: {
        "#v0": { S: createdAt },
        "#v1": { BOOL: false },
        "#v2": { S: mockEvent.username },
        "#v3": { N: mockEvent.shippingYen.toString() },
        "#v4": { S: mockEvent.itemId },
        "#v5": { L: [{ S: mockEvent.distImageUrls[0] }] },
        "#v6": { S: mockEvent.ebay.title },
        "#v7": { S: ebayCategory },
        "#v8": { S: "storeCat1 > storeCat2" },
        "#v9": { S: ebayCondition },
        "#v10": { S: mockEvent.stock.url },
        "#v11": { L: [{ S: mockEvent.stock.imageUrls[0] }] },
        "#v12": { N: mockEvent.stock.price.toString() },
        "#v13": { BOOL: true },
        "#v14": { S: "1" },
        "#v15": { N: "1" },
        "#v16": { BOOL: false },
        "#v17": { BOOL: true },
      },
      UpdateExpression:
        "SET #n0 = #v0, #n1 = #v1, #n2 = #v2, #n3 = #v3, #n4 = #v4, #n5 = #v5, #n6 = #v6, #n7 = #v7, #n8 = #v8, #n9 = #v9, #n10 = #v10, #n11 = #v11, #n12 = #v12, #n13 = #v13, #n14 = #v14, #n15 = #v15, #n16 = if_not_exists(#n16, #v16), #n17 = if_not_exists(#n17, #v17)",
    });
  });

  it("should generate correct DynamoDB input with Optional values", () => {
    const ebayCategory = "99999";
    const ebayCondition = "NEW";
    const createdAt = "2023-01-01T00:00:00Z";

    const event = {
      ...mockEvent,
      ebay: { ...mockEvent.ebay, conditionDescription: "Test Description" },
    };

    const result = makeDbInput(event, ebayCategory, ebayCondition, createdAt);

    expect(result).toEqual({
      TableName: mockEnv.TABLE_NAME,
      Key: {
        id: { S: "ITEM#testUser#testItem" },
      },
      ExpressionAttributeNames: {
        "#n0": "createdAt",
        "#n1": "isImageChanged",
        "#n2": "username",
        "#n3": "shippingYen",
        "#n4": "ebaySku",
        "#n5": "ebayImageUrls",
        "#n6": "ebayTitle",
        "#n7": "ebayCategory",
        "#n8": "ebayStoreCategory",
        "#n9": "ebayCondition",
        "#n10": "orgUrl",
        "#n11": "orgImageUrls",
        "#n12": "orgPrice",
        "#n13": "ebayParam1",
        "#n14": "stockParam1",
        "#n15": "stockParam2",
        "#n16": "ebayConditionDescription",
        "#n17": "isListed",
        "#n18": "isInStock",
      },
      ExpressionAttributeValues: {
        "#v0": { S: createdAt },
        "#v1": { BOOL: false },
        "#v2": { S: mockEvent.username },
        "#v3": { N: mockEvent.shippingYen.toString() },
        "#v4": { S: mockEvent.itemId },
        "#v5": { L: [{ S: mockEvent.distImageUrls[0] }] },
        "#v6": { S: mockEvent.ebay.title },
        "#v7": { S: ebayCategory },
        "#v8": { S: "storeCat1 > storeCat2" },
        "#v9": { S: ebayCondition },
        "#v10": { S: mockEvent.stock.url },
        "#v11": { L: [{ S: mockEvent.stock.imageUrls[0] }] },
        "#v12": { N: mockEvent.stock.price.toString() },
        "#v13": { BOOL: true },
        "#v14": { S: "1" },
        "#v15": { N: "1" },
        "#v16": { S: "Test Description" },
        "#v17": { BOOL: false },
        "#v18": { BOOL: true },
      },
      UpdateExpression:
        "SET #n0 = #v0, #n1 = #v1, #n2 = #v2, #n3 = #v3, #n4 = #v4, #n5 = #v5, #n6 = #v6, #n7 = #v7, #n8 = #v8, #n9 = #v9, #n10 = #v10, #n11 = #v11, #n12 = #v12, #n13 = #v13, #n14 = #v14, #n15 = #v15, #n16 = #v16, #n17 = if_not_exists(#n17, #v17), #n18 = if_not_exists(#n18, #v18)",
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
