import { getSecureSsmParam } from "common/ssmParamExtension";
import { log } from "common/utils";
import OpenAI from "openai";

interface Item {
  orgImageUrls: string[];
  orgTitle: string;
  orgDescription: string;
  orgPrice: number;
}

interface AppParams {
  chatGptKeySsmParamName: string;
}

interface User {
  fulfillmentPolicy: string;
}

interface Event {
  item: Item;
  user: User;
  appParams: AppParams;
}

interface ChatGptResponse {
  violates_ebay_policy: boolean;
  violation_reason: string | null;
  listing_title: string;
  item_condition: string;
  item_specifics: {
    franchises: string | null;
    characters: string[] | null;
    brands: string | null;
  };
  promotional_text: string;
  weight: number;
  box_size: {
    width: number;
    height: number;
    depth: number;
  };
}

const chatgpt = async (event: Event) => {
  const response_format = {
    type: "json_schema",
    json_schema: {
      name: "information_for_ebay_listing",
      schema: {
        type: "object",
        properties: {
          violates_ebay_policy: {
            type: "boolean",
            description:
              "Whether the item violates eBay's policies on prohibited or restricted items.",
          },
          violation_reason: {
            type: ["string", "null"],
            description:
              "If the item violates eBay's policies on prohibited or restricted items, explain the reason why the item cannot be listed.",
          },
          listing_title: {
            type: "string",
            description:
              "eBay listing title (within 80 characters, including spaces).",
          },
          item_condition: {
            type: "string",
            description: "Brief explatation of the item's current condition.",
          },
          item_specifics: {
            type: "object",
            description: "Item specifics.",
            properties: {
              franchises: {
                type: ["array", "null"],
                description:
                  "Franchises of the item (ex. title of anime, game, etc).",
                items: {
                  type: "string",
                },
              },
              characters: {
                type: ["array", "null"],
                description: "Names of the characters related to the item.",
                items: {
                  type: "string",
                },
              },
              brands: {
                type: ["array", "null"],
                description: "Brands of the item.",
                items: {
                  type: "string",
                },
              },
            },
            required: ["franchises", "characters", "brands"],
            additionalProperties: false,
          },
          promotional_text: {
            type: "string",
            description: "Promotional text for the listing.",
          },
          weight: {
            type: "number",
            description: "An estimated weight (in grams) for shipping.",
          },
          box_size: {
            type: "object",
            description:
              "An estimated box size (in centimeters) for packaging.",
            properties: {
              width: {
                type: "number",
                description: "width",
              },
              height: {
                type: "number",
                description: "height",
              },
              depth: {
                type: "number",
                description: "depth",
              },
            },
            required: ["width", "height", "depth"],
            additionalProperties: false,
          },
        },
        required: [
          "violates_ebay_policy",
          "violation_reason",
          "listing_title",
          "item_condition",
          "item_specifics",
          "promotional_text",
          "weight",
          "box_size",
        ],
        additionalProperties: false,
      },
      strict: true,
    },
  };

  const apiKey = await getSecureSsmParam(
    event.appParams.chatGptKeySsmParamName
  );

  const client = new OpenAI({ apiKey: apiKey });

  const completion = await client.beta.chat.completions.parse({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "You assist users in reselling Japanese Mercari items on eBay. Unless otherwise stated, assume all items are pre-owned. Based on the provided item's image, title, and description, generate the information for an eBay listing. Ensure the responses are suitable for eBay's platform requirements. Additionally, assess whether the item violates eBay's policies on prohibited or restricted items, and if so, explain the reason why the item cannot be listed.",
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: event.item.orgImageUrls[0] as string,
            },
          },
          {
            type: "text",
            text: `[title]
${event.item.orgTitle}
[description]
${event.item.orgDescription}`,
          },
        ],
      },
    ],
    // @ts-ignore
    response_format: response_format,
  });

  const message = completion.choices[0]?.message;
  log(message);
  if (message?.parsed) {
    return message?.parsed as ChatGptResponse;
  } else {
    log(message?.refusal);
    throw new Error("Failed to get response from chatgpt");
  }
};

const calcShippingFee = (
  width: number,
  height: number,
  depth: number,
  weight: number,
  orgPrice: number
) => {
  const fedexVolumeWeight = Math.max(
    weight / 1000,
    (width * height * depth) / 5000
  );
  if (fedexVolumeWeight > 12 || Math.max(width, height, depth) > 120) {
    throw new Error("too big");
  }
  const fedexFee = Math.max(2700, (11300 * fedexVolumeWeight + 25400) / 11.5);
  const emsFee = Math.max(4000, 2800 + Math.ceil(2.4 * weight));
  if (
    width + height + depth <= 90 &&
    Math.max(width, height, depth) <= 60 &&
    weight <= 2000 &&
    orgPrice <= 20000
  ) {
    const smallPacketFee = Math.max(1290, 1080 + Math.ceil(2.1 * weight));
    return Math.min(fedexFee, emsFee, smallPacketFee);
  }
  return Math.min(fedexFee, emsFee);
};

export const handler = async (event: Event) => {
  log(event);
  //   chatgptで処理
  const gptResult = await chatgpt(event);
  if (gptResult.violates_ebay_policy) {
    throw new Error(gptResult.violation_reason || "unknown");
  }
  // 入力を整形
  const shippingYen = calcShippingFee(
    gptResult.box_size.width,
    gptResult.box_size.height,
    gptResult.box_size.depth,
    gptResult.weight,
    event.item.orgPrice
  );

  const { orgDescription, ...filteredItem } = event.item;
  return {
    ...filteredItem,
    ebayFulfillmentPolicy: event.user.fulfillmentPolicy,
    shippingYen,
    weightGram: gptResult.weight,
    boxSizeCm: [
      gptResult.box_size.width,
      gptResult.box_size.height,
      gptResult.box_size.depth,
    ],
    ebayTitle: gptResult.listing_title,
    ebayDescription: `<div style="color: rgb(51, 51, 51); font-family: Arial;"><p>${gptResult.promotional_text}</p><h3 style="margin-top: 1.6em;">Condition</h3><p>${gptResult.item_condition}</p><h3 style="margin-top: 1.6em;">Shipping</h3><p>Tracking numbers are provided to all orders. The item will be carefully packed to ensure it arrives safely.</p><h3 style="margin-top: 1.6em;">Customs and import charges</h3><p>Import duties, taxes, and charges are not included in the item price or shipping cost. Buyers are responsible for these charges. These charges may be collected by the carrier when you receive the item.</p></div>`,
    ebayCategorySrc: [
      "Collectibles",
      "Animation Art & Merchandise",
      "Animation Merchandise",
      "Other Animation Merchandise",
    ],
    ebayStoreCategorySrc: ["Anime Merchandise"],
    ebayConditionSrc: "Used",
    ebayConditionDescription: gptResult.item_condition,
    ebayAspectParam: {
      ...(gptResult.item_specifics.franchises &&
      gptResult.item_specifics.franchises.length > 0
        ? {
            Franchise: [gptResult.item_specifics.franchises[0]],
            "TV Show": [gptResult.item_specifics.franchises[0]],
          }
        : {}),
      ...(gptResult.item_specifics.brands &&
      gptResult.item_specifics.brands.length > 0
        ? { Brand: [gptResult.item_specifics.brands[0]] }
        : {}),
      ...(gptResult.item_specifics.characters &&
      gptResult.item_specifics.characters.length > 0
        ? { Character: gptResult.item_specifics.characters.slice(0, 30) }
        : {}),
      "Country/Region of Manufacture": ["Japan"],
      Theme: ["Anime & Manga"],
      Signed: ["No"],
    },
  };
};
