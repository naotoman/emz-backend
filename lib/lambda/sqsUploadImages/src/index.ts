import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import axios from "axios";
import { getSecureSsmParam } from "common/ssmParamExtension";
import { log } from "common/utils";
import fs, { createReadStream } from "fs";
import path from "path";
import sharp from "sharp";

interface Body {
  orgImageUrls: string[];
  r2Bucket: string;
  r2ImagePaths: string[];
  r2KeySsmParamName: string;
  r2Endpoint: string;
}

interface Event {
  Records: {
    body: string;
  }[];
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
  imagePaths: string[],
  r2Client: S3Client,
  r2Bucket: string,
  r2Paths: string[]
) => {
  for (const [i, imagePath] of imagePaths.entries()) {
    const upload = new Upload({
      client: r2Client,
      params: {
        Body: createReadStream(imagePath),
        Bucket: r2Bucket,
        Key: r2Paths[i],
      },
    });
    await upload.done();
  }
};

export const handler = async (event: Event) => {
  log({ event });
  const bodyStr = event.Records[0]?.body;
  if (bodyStr == null) {
    throw new Error("body is null");
  }
  const body: Body = JSON.parse(bodyStr);

  const srcDir = fs.mkdtempSync("/tmp/src");
  const distDir = fs.mkdtempSync("/tmp/dist");
  try {
    const srcImages = await loadImages(body.orgImageUrls, srcDir);
    log({ srcImages });

    const distImages = await editImages(srcImages, distDir);
    log({ distImages });

    const r2Client = await getR2Client(body.r2KeySsmParamName, body.r2Endpoint);

    await uploadImagesToR2(
      distImages,
      r2Client,
      body.r2Bucket,
      body.r2ImagePaths
    );
  } finally {
    // Clean up temporary directories
    fs.rmSync(srcDir, { recursive: true, force: true });
    fs.rmSync(distDir, { recursive: true, force: true });
  }
};
