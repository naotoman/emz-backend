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
          box_size: {
            type: "object",
            description: "estimated box size (cm) for packaging",
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
        required: ["title", "box_size", "specifics"],
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
          "You assist users in listing Japanese Mercari items on eBay. Based on item images, titles, and descriptions, provide an eBay listing title, item specifics, and an estimated box size (cm) for packaging.",
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
            text: `#title
${event.item.orgTitle}
#description
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

const calcShippingFee = (width: number, height: number, depth: number) => {
  if (width + height + depth <= 90) {
    return 1670;
  } else if ((width * height * depth) / 5000 < 0.5) {
    return 3000;
  } else if ((width * height * depth) / 5000 < 1) {
    return 3300;
  } else if ((width * height * depth) / 5000 < 2) {
    return 3700;
  } else if ((width * height * depth) / 5000 < 3) {
    return 5000;
  } else if ((width * height * depth) / 5000 < 4) {
    return 5800;
  } else if ((width * height * depth) / 5000 < 5) {
    return 7100;
  } else {
    throw new Error("too large");
  }
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
        gptResult.box_size.depth
      );

  return {
    ...event.item,
    shippingYen,
    ebayTitle: gptResult.title,
    ebayDescription:
      '<h3 style="color: rgb(51, 51, 51); font-family: Arial; margin-top: 1.6em;">Shipping</h3><ul style="color: rgb(51, 51, 51); font-family: Arial;"><li>Tracking numbers are provided to all orders.</li></ul><h3 style="color: rgb(51, 51, 51); font-family: Arial; margin-top: 1.6em;">Please Note</h3><ul style="color: rgb(51, 51, 51); font-family: Arial;"><li>Import duties, taxes, and charges are not included in the item price or shipping cost. Buyers are responsible for these charges.</li><li>These charges may be collected by the carrier when you receive the item. Do not confuse them with additional shipping cost.</li></ul>',
    ebayCategorySrc: [
      "Collectibles",
      "Animation Art & Merchandise",
      "Animation Merchandise",
      "Other Animation Merchandise",
    ],
    ebayStoreCategorySrc: ["Anime Merchandise"],
    ebayConditionSrc: "Used",
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
