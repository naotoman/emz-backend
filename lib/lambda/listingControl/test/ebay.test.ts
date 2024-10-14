import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import {
  createOffer,
  createOrReplaceInventoryItem,
  deleteInventoryItem,
  getInventoryItem,
  getOffers,
  mintAccessToken,
  publishOffer,
  updateOffer,
} from "../src/ebay";

const getAccessToken = async () => {
  if (process.env.EBAY_ACCESS_TOKEN) {
    return process.env.EBAY_ACCESS_TOKEN;
  }
  const ssmClient = new SSMClient({});
  const resToken = await ssmClient.send(
    new GetParameterCommand({
      Name: "/emz/test/getEbayClient/token/testuser2",
      WithDecryption: true,
    })
  );
  const tokens = JSON.parse(resToken.Parameter!.Value!);
  const resKeys = await ssmClient.send(
    new GetParameterCommand({
      Name: "/emz/ebay-api-keys/sandbox",
      WithDecryption: true,
    })
  );
  const keys = JSON.parse(resKeys.Parameter!.Value!);
  const result = await mintAccessToken(
    keys["Client ID"],
    keys["Client Secret"],
    tokens.refreshToken,
    true
  );
  const accessToken = result.access_token;
  console.log({ accessToken });
  return accessToken;
};

describe("apis that do not update the states", () => {
  let accessToken = "";

  beforeAll(async () => {
    accessToken = await getAccessToken();
  }, 10000);

  it("should create or replace and get inventory item", async () => {
    const desc = new Date().toISOString();
    const sku = "emz-test-createOrReplaceInventoryItem";
    const payload = {
      availability: {
        shipToLocationAvailability: {
          quantity: 1,
        },
      },
      condition: "NEW",
      product: {
        title: "Test item",
        description: desc,
        imageUrls: ["https://picsum.photos/200/300.jpg"],
        aspects: { Type: ["Action Figure"] },
      },
    };
    await createOrReplaceInventoryItem(accessToken, sku, payload, true);
    const inventory = await getInventoryItem(accessToken, sku, true);
    expect(inventory).toStrictEqual({
      exist: true,
      data: {
        ...payload,
        sku: sku,
        locale: "en_US",
        availability: {
          shipToLocationAvailability: {
            quantity: 1,
            allocationByFormat: { auction: 0, fixedPrice: 1 },
          },
        },
      },
    });
  }, 10000);

  it("should throw error when create or replace inventory item", async () => {
    const sku = "emz-test-createOrReplaceInventoryItem-toolongsoitwillfail";
    const payload = {
      availability: {
        shipToLocationAvailability: {
          quantity: 1,
        },
      },
      condition: "NEW",
      product: {
        title: "Test item",
        description: "Test item description",
        imageUrls: ["https://picsum.photos/200/300.jpg"],
        aspects: { Type: ["Action Figure"] },
      },
    };
    try {
      await createOrReplaceInventoryItem(accessToken, sku, payload, true);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  it("not exist inventory item", async () => {
    const sku = "noexist-z0ekx8d";
    const inventory = await getInventoryItem(accessToken, sku, true);
    expect(inventory).toStrictEqual({ exist: false });
  });

  it("throw error when create invalid offer", async () => {
    const payload = {
      sku: "emz-test-createOrReplaceInventoryItem",
      marketplaceId: "EBAY_US",
      format: "FIXED_PRICE",
      availableQuantity: 1,
      categoryId: "261068",
      listingPolicies: {
        fulfillmentPolicyId: "6198752000",
        paymentPolicyId: "6206589000",
        returnPolicyId: "6198754000",
      },
      pricingSummary: { price: { currency: "USD", value: "36.00" } },
      merchantLocationKey: "main-warehouse",
      storeCategoryNames: ["/Others"],
    };
    try {
      await createOffer(accessToken, payload, true);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
    try {
      payload.sku = "notexist-z0ekx8d";
      await createOffer(accessToken, payload, true);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  it("delete not exist inventory", async () => {
    const sku = "noexist-jo320kdn2oka";
    const res = await deleteInventoryItem(accessToken, sku, true);
    expect(res).toBe(false);
  });

  it("get offers", async () => {
    const sku = "emz-test-createOrReplaceInventoryItem";
    const offers = await getOffers(accessToken, sku, true);
    expect(offers.exist).toBe(true);
    expect(offers.data.sku).toBe(sku);
  });

  it("get offers from not exist sku", async () => {
    const sku = "notexist-jo320kdn2oka";
    const offers = await getOffers(accessToken, sku, true);
    expect(offers.exist).toBe(false);
  });

  it("get offers from sku that has no offer", async () => {
    const sku = "emz-test-gerOffersNoOffer";
    const offers = await getOffers(accessToken, sku, true);
    expect(offers.exist).toBe(false);
  });

  it("throw error when puplish invalid offer", async () => {
    const offerId = "9999999999";
    try {
      await publishOffer(accessToken, offerId, true);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  it("should update noexist offer", async () => {
    const offerId = "9999999999";
    const payload = {
      marketplaceId: "EBAY_US",
      format: "FIXED_PRICE",
      availableQuantity: 1,
      categoryId: "261068",
      listingPolicies: {
        fulfillmentPolicyId: "6198752000",
        paymentPolicyId: "6206589000",
        returnPolicyId: "6198754000",
      },
      pricingSummary: { price: { currency: "USD", value: "99.00" } },
      merchantLocationKey: "main-warehouse",
      storeCategoryNames: ["/Others"],
    };
    try {
      await updateOffer(accessToken, offerId, payload, true);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });
});

describe("apis that update the states", () => {
  let accessToken = "";

  // beforeAll(async () => {
  //   accessToken = await getAccessToken();
  // }, 10000);

  // it("should delete inventory item", async () => {
  //   const sku = "emz-test-deleveinventory";
  //   let inventory = await getInventoryItem(accessToken, sku, true);
  //   expect(inventory.exist).toBe(true);
  //   const res = await deleteInventoryItem(accessToken, sku, true);
  //   expect(res).toBe(true);
  //   inventory = await getInventoryItem(accessToken, sku, true);
  //   expect(inventory.exist).toBe(false);
  // });

  // it("should create offer", async () => {
  //   const payload = {
  //     sku: "emz-test-createOffer",
  //     marketplaceId: "EBAY_US",
  //     format: "FIXED_PRICE",
  //     availableQuantity: 1,
  //     categoryId: "261068",
  //     listingPolicies: {
  //       fulfillmentPolicyId: "6198752000",
  //       paymentPolicyId: "6206589000",
  //       returnPolicyId: "6198754000",
  //     },
  //     pricingSummary: { price: { currency: "USD", value: "36.00" } },
  //     merchantLocationKey: "main-warehouse",
  //     storeCategoryNames: ["/Others"],
  //   };
  //   const offer = await createOffer(accessToken, payload, true);
  //   console.log({ offer });
  //   expect(offer.offerId).toBeDefined();
  // });

  // it("should puplish offer", async () => {
  //   const offerId = "9208369010";
  //   // const offerId = "9208815010";
  //   const res = await publishOffer(accessToken, offerId, true);
  //   console.log({ res });
  //   expect(res.listingId).toBeDefined();
  //   const offer = await getOffers(
  //     accessToken,
  //     "emz-test-createOrReplaceInventoryItem",
  //     true
  //   );
  //   expect(offer.data.status).toBe("PUBLISHED");
  // }, 10000);

  // it("should update offer", async () => {
  //   const offerId = "9208813010";
  //   const payload = {
  //     marketplaceId: "EBAY_US",
  //     format: "FIXED_PRICE",
  //     availableQuantity: 1,
  //     categoryId: "261068",
  //     listingPolicies: {
  //       fulfillmentPolicyId: "6198752000",
  //       paymentPolicyId: "6206589000",
  //       returnPolicyId: "6198754000",
  //     },
  //     pricingSummary: { price: { currency: "USD", value: "99.00" } },
  //     merchantLocationKey: "main-warehouse",
  //     storeCategoryNames: ["/Others"],
  //   };
  //   await updateOffer(accessToken, offerId, payload, true);
  //   const resOffer = await getOffers(accessToken, "emz-test-updateOffer", true);
  //   expect(resOffer.data.pricingSummary.price.value).toBe("99.0");
  // });

  // it("should withdraw offer", async () => {
  //   const offerId = "9208815010";
  //   let offer = await getOffers(accessToken, "emz-test-withdrawOffer", true);
  //   console.log(util.inspect(offer, { depth: null }));
  //   expect(offer.data.status).toBe("PUBLISHED");
  //   const res = await withdrawOffer(accessToken, offerId, true);
  //   console.log({ res });
  //   expect(res.listingId).toBeDefined();
  //   offer = await getOffers(accessToken, "emz-test-withdrawOffer", true);
  //   console.log(util.inspect(offer, { depth: null }));
  //   expect(offer.data.status).toBe("UNPUBLISHED");
  // }, 10000);

  // it("should withdraw already ended offer", async () => {
  //   const offerId = "9208815010";
  //   const res = await withdrawOffer(accessToken, offerId, true);
  //   console.log({ res });
  //   expect(res.listingId).toBeDefined();
  // }, 10000);
});
