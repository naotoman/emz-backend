import { getSecureSsmParam } from "common/ssmParamExtension";
import { log } from "common/utils";
import OpenAI from "openai";

interface Item {
  shippingYen: number;
  orgImageUrls: string[];
  orgTitle: string;
  orgDescription: string;
}

interface AppParams {
  chatGptKeySsmParamName: string;
}

interface Event {
  item: Item;
  appParams: AppParams;
}

interface ChatGptResponse {
  title: string;
  specifics: {
    franchise: string | null;
    characters: string[] | null;
    brand: string | null;
  };
  condition: string;
  promotion: string;
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
      name: "transform_mercari_to_ebay",
      schema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description:
              "eBay listing title (within 80 characters, including spaces)",
          },
          condition: {
            type: "string",
            description: "brief summary of the item's condition",
          },
          specifics: {
            type: "object",
            description: "item specifics",
            properties: {
              franchise: {
                type: ["string", "null"],
                description:
                  "franchise of the product (ex. title of anime, game, etc)",
              },
              characters: {
                type: ["array", "null"],
                description: "characters relevant to the item",
                items: {
                  type: "string",
                },
              },
              brand: {
                type: ["string", "null"],
                description: "brand of the item",
              },
            },
            required: ["franchise", "characters", "brand"],
            additionalProperties: false,
          },
          promotion: {
            type: "string",
            description: "short promotional text for the item",
          },
          weight: {
            type: "number",
            description: "estimated weight of the item",
          },
          box_size: {
            type: "object",
            description: "estimated box size for packaging",
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
          "title",
          "condition",
          "promotion",
          "weight",
          "box_size",
          "specifics",
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
          "You assist users in reselling Japanese Mercari items on eBay. Based on the item's images, titles, and descriptions, you provide an eBay listing title, item condition, item specifics, promotional text, an estimated weight (in grams), and an estimated box size (in centimeters) for packaging.",
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: event.item.orgImageUrls[0] as string,
              detail: "low",
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
  weight: number
) => {
  let japanPostFee = 100000;
  if (
    width + height + depth <= 90 &&
    Math.max(width, height, depth) <= 60 &&
    weight <= 2000
  ) {
    japanPostFee = Math.max(830, 830 + Math.ceil(2.1 * (weight - 100)));
  }
  const fedexVolumeWeight = Math.max(
    weight / 1000,
    (width * height * depth) / 5000
  );
  if (fedexVolumeWeight > 12) {
    throw new Error("too big");
  }
  const fedexFee = Math.max(
    2700,
    (11300 * fedexVolumeWeight) / 11.5 + 25400 / 11.5
  );
  return Math.min(japanPostFee, fedexFee);
};

export const handler = async (event: Event) => {
  log(event);
  //   chatgptで処理
  const gptResult = await chatgpt(event);
  // 入力を整形
  const shippingYen = event.item.shippingYen
    ? event.item.shippingYen
    : calcShippingFee(
        gptResult.box_size.width,
        gptResult.box_size.height,
        gptResult.box_size.depth,
        gptResult.weight
      );

  const { orgTitle, orgDescription, ...filteredItem } = event.item;
  return {
    ...filteredItem,
    shippingYen,
    weightGram: gptResult.weight,
    boxSizeCm: [
      gptResult.box_size.width,
      gptResult.box_size.height,
      gptResult.box_size.depth,
    ],
    ebayTitle: gptResult.title,
    ebayDescription: `<div style="color: rgb(51, 51, 51); font-family: Arial;"><p>${gptResult.promotion}</p><h3 style="margin-top: 1.6em;">Condition</h3><p>${gptResult.condition}</p><h3 style="margin-top: 1.6em;">Shipping</h3><p>Tracking numbers are provided to all orders. The item will be carefully packed to ensure it arrives safely.</p><h3 style="margin-top: 1.6em;">Customs and import charges</h3><p>Import duties, taxes, and charges are not included in the item price or shipping cost. Buyers are responsible for these charges. These charges may be collected by the carrier when you receive the item.</p></div>`,
    ebayCategorySrc: [
      "Collectibles",
      "Animation Art & Merchandise",
      "Animation Merchandise",
      "Other Animation Merchandise",
    ],
    ebayStoreCategorySrc: ["Anime Merchandise"],
    ebayConditionSrc: "Used",
    ebayConditionDescription: gptResult.condition,
    ebayAspectParam: {
      ...(gptResult.specifics.franchise
        ? {
            Franchise: [gptResult.specifics.franchise],
            "TV Show": [gptResult.specifics.franchise],
          }
        : {}),
      ...(gptResult.specifics.brand
        ? { Brand: [gptResult.specifics.brand] }
        : {}),
      ...(gptResult.specifics.characters
        ? { Character: gptResult.specifics.characters }
        : {}),
      "Country/Region of Manufacture": ["Japan"],
      Theme: ["Anime & Manga"],
      Signed: ["No"],
    },
  };
};
