import { S3Client } from "@aws-sdk/client-s3";
import * as fs from "fs";
import * as path from "path";
import { editImages, loadImages, uploadImagesToR2 } from "../src/index";

describe("loadImages", () => {
  beforeEach(() => {
    const file = path.join(__dirname, "img/0_200300.jpg");
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  });

  test("should load images from public URL", async () => {
    const imageUrls = ["https://picsum.photos/200/300.jpg"];
    const outDir = path.join(__dirname, "img");
    const result = await loadImages(imageUrls, outDir);
    const filePath = path.join(outDir, "0_200300.jpg");
    expect(result).toEqual([filePath]);
    const fileExists = fs.existsSync(filePath);
    expect(fileExists).toBe(true);
  });
});

describe("editImages", () => {
  beforeEach(() => {
    const file = path.join(__dirname, "img/dist_0.jpg");
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  });
  test("should edit images", async () => {
    const imagePaths = [path.join(__dirname, "srcImg.jpg")];
    const outDir = path.join(__dirname, "img");
    const result = await editImages(imagePaths, outDir);
    const filePath = path.join(outDir, "dist_0.jpg");
    expect(result).toEqual([filePath]);
    const fileExists = fs.existsSync(filePath);
    expect(fileExists).toBe(true);
  });
});

describe("uploadImagesToR2", () => {
  // Use S3Client instead of R2
  test("should upload images to R2", async () => {
    const s3Client = new S3Client({});
    const imagePaths = [path.join(__dirname, "srcImg.jpg")];
    const r2Bucket = "test-bucket-48309";
    const r2Prefix = "emz/test-uploadImagesToR2/item-images";
    const result = await uploadImagesToR2(
      s3Client,
      imagePaths,
      r2Bucket,
      r2Prefix
    );
    expect(result).toEqual([`${r2Prefix}/image-0.jpg`]);
  });
});
