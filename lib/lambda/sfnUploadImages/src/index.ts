import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import axios from "axios";
import { getSecureSsmParam } from "common/ssmParamExtension";
import { log } from "common/utils";
import fs, { createReadStream } from "fs";
import path from "path";
import sharp from "sharp";

interface Event {
  enhanceImages: boolean;
  item: {
    ebaySku: string;
    orgImageUrls: string[];
  };
  appParams: {
    r2KeySsmParamName: string;
    r2Bucket: string;
    r2Prefix: string;
    r2Endpoint: string;
    r2Domain: string;
  };
}

const downloadImage = async (url: string, outPath: string) => {
  const response = await axios.get(url, {
    responseType: "stream",
    timeout: 5000,
  });
  if (response.status !== 200) {
    throw new Error(`Failed to download image: ${url}`);
  }

  const writer = fs.createWriteStream(outPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
};

export const loadImages = async (imageUrls: string[], outDir: string) => {
  const outPaths = [];
  for (const [i, url] of imageUrls.entries()) {
    const fileName = `${i}_` + new URL(url).pathname.replace(/\//g, "");
    const outPath = path.join(outDir, fileName);
    await downloadImage(url, outPath);
    outPaths.push(outPath);
  }
  return outPaths;
};

export const editImages = async (imagePaths: string[], outDir: string) => {
  const outPaths = [];
  for (const [i, imagePath] of imagePaths.entries()) {
    const newImage = sharp(imagePath)
      .gamma(1.8)
      .resize(1600, 1600, { fit: "inside" });
    const fileName = `dist_${i}.jpg`;
    const outPath = path.join(outDir, fileName);
    await newImage.toFile(outPath);
    outPaths.push(outPath);
  }
  return outPaths;
};

const getR2ApiToken = async (r2KeySsmParamName: string) => {
  const jsonStr = await getSecureSsmParam(r2KeySsmParamName);
  const data = JSON.parse(jsonStr);
  if (!data["Access Key ID"] || !data["Secret Access Key"]) {
    throw new Error("Failed to get R2 API tokens");
  }
  return {
    accessKeyId: data["Access Key ID"] as string,
    secretAccessKey: data["Secret Access Key"] as string,
  };
};

export const getR2Client = async (
  r2KeySsmParamName: string,
  r2Endpoint: string
) => {
  const r2Tokens = await getR2ApiToken(r2KeySsmParamName);
  return new S3Client({
    endpoint: r2Endpoint,
    region: "auto",
    credentials: r2Tokens,
  });
};

export const uploadImagesToR2 = async (
  r2Client: S3Client,
  imagePaths: string[],
  r2Bucket: string,
  r2Folder: string
) => {
  const outPaths = [];
  for (const [i, imagePath] of imagePaths.entries()) {
    const outPath = path.join(r2Folder, `image-${i}.jpg`);
    const upload = new Upload({
      client: r2Client,
      params: {
        Body: createReadStream(imagePath),
        Bucket: r2Bucket,
        Key: outPath,
      },
    });
    await upload.done();
    outPaths.push(outPath);
  }
  return outPaths;
};

export const handler = async (event: Event) => {
  log({ event });
  if (!event.enhanceImages) {
    return { distImageUrls: event.item.orgImageUrls };
  }

  const srcImages = await loadImages(
    event.item.orgImageUrls,
    fs.mkdtempSync("/tmp/src")
  );
  log({ srcImages });

  const distImages = await editImages(srcImages, fs.mkdtempSync("/tmp/dist"));
  log({ distImages });

  const r2Client = await getR2Client(
    event.appParams.r2KeySsmParamName,
    event.appParams.r2Endpoint
  );

  const r2Images = await uploadImagesToR2(
    r2Client,
    distImages,
    event.appParams.r2Bucket,
    path.join(
      event.appParams.r2Prefix,
      "item-images",
      event.item.ebaySku,
      `${Date.now()}`
    )
  );
  log({ r2Images });

  const r2ImageUrls = r2Images.map(
    (image) => new URL(image, event.appParams.r2Domain).href
  );
  log({ r2ImageUrls });

  return {
    distImageUrls: r2ImageUrls,
  };
};
