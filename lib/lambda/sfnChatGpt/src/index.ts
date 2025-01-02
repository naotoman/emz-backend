import { getSecureSsmParam } from "common/ssmParamExtension";
import { log } from "common/utils";
import fs from "fs";
import OpenAI from "openai";

interface AspectConstraint {
  aspectDataType: "STRING" | "NUMBER" | "DATE";
  itemToAspectCardinality: "SINGLE" | "MULTI";
  aspectMode: "FREE_TEXT" | "SELECTION_ONLY";
  aspectRequired: boolean;
}

interface AspectValue {
  localizedValue: string;
}

interface Aspect {
  localizedAspectName: string;
  aspectConstraint: AspectConstraint;
  aspectValues: AspectValue[];
}

interface FormattedAspect {
  type: string | string[];
  description: string;
  items?: {
    type: "string" | "number";
  };
  enum?: string[];
}

interface FormattedAspects {
  [key: string]: FormattedAspect;
}

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
  risk_checklist: {
    violates_ebay_policies: boolean;
    requires_comment_before_purchase: boolean;
    not_japanese_product: boolean;
    explanation: string;
  };
  shipping_weight_and_box_dimensions: {
    weight: number;
    box_dimensions: {
      length: number;
      width: number;
      height: number;
    };
  };
  reselling_information: {
    listing_title: string;
    item_condition: string;
    item_specifics: {
      [key: string]: string | string[] | number | number[] | null;
    };
    promotional_text: string;
  };
}

const checklistSchema = {
  type: "object",
  properties: {
    violates_ebay_policies: {
      type: "boolean",
      description:
        "Whether the item may violate eBay's policies on prohibited and restricted items.",
    },
    requires_comment_before_purchase: {
      type: "boolean",
      description:
        "Whether the seller explicitly states that a comment is unconditionally required before purchasing.",
    },
    not_japanese_product: {
      type: "boolean",
      description:
        "Whether the seller explicitly states that the item originates from outside Japan.",
    },
    explanation: {
      type: "string",
      description: "Explanation of the checklist items.",
    },
  },
  required: [
    "violates_ebay_policies",
    "requires_comment_before_purchase",
    "not_japanese_product",
    "explanation",
  ],
  additionalProperties: false,
};

const shippingWeightAndBoxDimensionsSchema = {
  type: "object",
  properties: {
    weight: { type: "number" },
    box_dimensions: {
      type: "object",
      properties: {
        length: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
      },
      required: ["length", "width", "height"],
      additionalProperties: false,
    },
  },
  required: ["weight", "box_dimensions"],
  additionalProperties: false,
};

const resellingInformationSchema = (aspectsFormatted: FormattedAspects) => {
  return {
    type: "object",
    properties: {
      listing_title: {
        type: "string",
        description:
          "A concise and descriptive title optimized for eBay's search engine (within 80 characters, including spaces).",
      },
      item_condition: {
        type: "string",
        description: "Brief explatation of the item's current condition.",
      },
      item_specifics: {
        type: "object",
        description: "Item specifics.",
        properties: aspectsFormatted,
        required: Object.keys(aspectsFormatted),
        additionalProperties: false,
      },
      promotional_text: {
        type: "string",
        description:
          "Promotional text for the item. It should be a short and concise description of the item's features and benefits.",
      },
    },
    required: [
      "listing_title",
      "item_condition",
      "item_specifics",
      "promotional_text",
    ],
    additionalProperties: false,
  };
};

const chatgpt = async (event: Event, formattedAspects: FormattedAspects) => {
  const prompt = {
    model: "gpt-4o",
    messages: [
      {
        role: "developer",
        content: `You assist users in reselling items from Mercari Japan to international customers on eBay. Assume all items are pre-owned unless otherwise specified. Based on the provided item information from Mercari, perform the following tasks:
1. Determine if the item is suitable for reselling on eBay using the risk checklist.
2. Estimate the total shipping weight (in grams) and the dimensions of the packaging box (in centimeters). Be cautious and aim slightly higher to avoid underestimation.
3. Generate the information for listing the item on eBay in English. Avoid using phrases like "like new" or similar terms to prevent confusion for buyers.`,
      },
      {
        role: "user",
        content: [
          ...event.item.orgImageUrls.map((url, index) => ({
            type: "image_url" as const,
            image_url: {
              url: url as string,
              ...(index > 0 ? { detail: "low" as const } : {}),
            },
          })),
          {
            type: "text",
            text: `<title>
${event.item.orgTitle}
</title>
<description>
${event.item.orgDescription}
</description>`,
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        strict: true,
        name: "help_me_resell",
        schema: {
          type: "object",
          properties: {
            risk_checklist: checklistSchema,
            shipping_weight_and_box_dimensions:
              shippingWeightAndBoxDimensionsSchema,
            reselling_information: resellingInformationSchema(formattedAspects),
          },
          required: [
            "risk_checklist",
            "shipping_weight_and_box_dimensions",
            "reselling_information",
          ],
          additionalProperties: false,
        },
      },
    },
  };
  log(prompt);

  const apiKey = await getSecureSsmParam(
    event.appParams.chatGptKeySsmParamName
  );

  const client = new OpenAI({ apiKey: apiKey });

  const completion = await client.beta.chat.completions.parse(prompt);

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

export const transformAspects = (aspects: Aspect[]) => {
  const transformType = (data: AspectConstraint) => {
    if (data.itemToAspectCardinality === "MULTI") {
      return "array";
    } else if (data.aspectDataType === "NUMBER") {
      return "number";
    } else {
      return "string";
    }
  };

  const createDescription = (aspect: Aspect) => {
    let desc = "";
    if (aspect.aspectConstraint.itemToAspectCardinality === "SINGLE") {
      desc += `A value for '${aspect.localizedAspectName}'. `;
    } else {
      desc += `Values for '${aspect.localizedAspectName}'. `;
    }
    if (
      aspect.aspectConstraint.aspectMode === "FREE_TEXT" &&
      aspect.aspectValues
    ) {
      desc +=
        "(ex. " +
        [...aspect.aspectValues]
          .sort(() => Math.random() - 0.5)
          .slice(0, 20)
          .map((v: AspectValue) => v.localizedValue)
          .join(", ") +
        ")";
    }
    if (!aspect.aspectConstraint.aspectRequired) {
      desc += " Return null if not applicable.";
    }
    return desc;
  };

  return aspects.reduce((acc: FormattedAspects, aspect: Aspect) => {
    if (
      aspect.localizedAspectName === "MPN" ||
      aspect.localizedAspectName === "California Prop 65 Warning" ||
      aspect.localizedAspectName === "Unit Type" ||
      aspect.localizedAspectName === "Unit Quantity" ||
      aspect.localizedAspectName === "Item Width" ||
      aspect.localizedAspectName === "Item Height" ||
      aspect.localizedAspectName === "Item Weight" ||
      aspect.localizedAspectName === "Item Length"
    ) {
      return acc;
    }
    const baseType = transformType(aspect.aspectConstraint);
    acc[aspect.localizedAspectName] = {
      type: aspect.aspectConstraint.aspectRequired
        ? baseType
        : [baseType, "null"],
      description: createDescription(aspect),
      ...(aspect.aspectConstraint.itemToAspectCardinality === "MULTI"
        ? {
            items: {
              type:
                aspect.aspectConstraint.aspectDataType === "NUMBER"
                  ? "number"
                  : "string",
            },
          }
        : {}),
      ...(aspect.aspectConstraint.aspectMode === "SELECTION_ONLY"
        ? {
            enum:
              aspect.localizedAspectName === "Country/Region of Manufacture"
                ? ["Japan"]
                : aspect.aspectValues.map(
                    (value: AspectValue) => value.localizedValue
                  ),
          }
        : {}),
    };
    return acc;
  }, {});
};

export const handler = async (event: Event) => {
  log(event);
  const aspects = JSON.parse(fs.readFileSync("69528.json", "utf8")).aspects;
  const formattedAspects = transformAspects(aspects);
  log(formattedAspects);
  //   chatgptで処理
  const gptResult = await chatgpt(event, formattedAspects);
  if (
    gptResult.risk_checklist.violates_ebay_policies ||
    gptResult.risk_checklist.requires_comment_before_purchase ||
    gptResult.risk_checklist.not_japanese_product
  ) {
    throw new Error(gptResult.risk_checklist.explanation);
  }
  // 入力を整形
  const shippingYen = calcShippingFee(
    gptResult.shipping_weight_and_box_dimensions.box_dimensions.length,
    gptResult.shipping_weight_and_box_dimensions.box_dimensions.width,
    gptResult.shipping_weight_and_box_dimensions.box_dimensions.height,
    gptResult.shipping_weight_and_box_dimensions.weight,
    event.item.orgPrice
  );

  const { orgDescription, ...filteredItem } = event.item;
  return {
    ...filteredItem,
    ebayFulfillmentPolicy: event.user.fulfillmentPolicy,
    shippingYen,
    weightGram: gptResult.shipping_weight_and_box_dimensions.weight,
    boxSizeCm: [
      gptResult.shipping_weight_and_box_dimensions.box_dimensions.length,
      gptResult.shipping_weight_and_box_dimensions.box_dimensions.width,
      gptResult.shipping_weight_and_box_dimensions.box_dimensions.height,
    ],
    ebayTitle: gptResult.reselling_information.listing_title,
    ebayDescription: `<div style="color: rgb(51, 51, 51); font-family: Arial;"><p>${gptResult.reselling_information.promotional_text}</p><h3 style="margin-top: 1.6em;">Condition</h3><p>${gptResult.reselling_information.item_condition}</p><h3 style="margin-top: 1.6em;">Shipping</h3><p>Tracking numbers are provided to all orders. The item will be carefully packed to ensure it arrives safely.</p><h3 style="margin-top: 1.6em;">Customs and import charges</h3><p>Import duties, taxes, and charges are not included in the item price or shipping cost. Buyers are responsible for these charges. These charges may be collected by the carrier when you receive the item.</p></div>`,
    ebayCategorySrc: [
      "Collectibles",
      "Animation Art & Merchandise",
      "Animation Merchandise",
      "Other Animation Merchandise",
    ],
    ebayStoreCategorySrc: ["Anime Merchandise"],
    ebayConditionSrc: "Used",
    ebayConditionDescription: gptResult.reselling_information.item_condition,
    ebayAspectParam: Object.fromEntries(
      Object.entries(gptResult.reselling_information.item_specifics)
        .filter(([_, value]) => {
          if (value == null || value === "") return false;
          if (Array.isArray(value)) {
            return (
              value.length > 0 && value.every((v) => v != null && v !== "")
            );
          }
          return true;
        })
        .map(([key, value]) => [key, Array.isArray(value) ? value : [value]])
    ),
  };
};
