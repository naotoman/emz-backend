import { getCategoryId } from "../src/leafCategory";

describe("getCategoryId", () => {
  it("should return the correct category ID for a given category name", () => {
    const category = [
      "Sports Mem, Cards & Fan Shop",
      "Vintage Sports Memorabilia",
      "Stickers",
    ];
    const expectedCategoryId = "73432";
    const result = getCategoryId(category);
    expect(result).toBe(expectedCategoryId);
  });

  it("should throw an error for a non-existent category path", () => {
    const category = ["Non-Existent Category", "Subcategory", "Subsubcategory"];
    expect(() => getCategoryId(category)).toThrow(Error);
  });
});
