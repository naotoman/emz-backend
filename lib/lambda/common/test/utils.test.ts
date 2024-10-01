import { getFormattedDate, jsonStringify } from "../src/utils";

describe("getFormattedDate", () => {
  it("should return the formatted date string in JST", () => {
    const date = new Date("2023-06-12T07:22:01Z"); // UTC time
    const expected = "2023-06-12 16:22:01"; // JST time
    const result = getFormattedDate(date);
    expect(result).toBe(expected);
  });
});

describe("jsonStringify", () => {
  it("should convert an object to a JSON string", () => {
    const obj = { key: "value" };
    const result = jsonStringify(obj);
    expect(result).toBe('{"key":"value"}');
  });

  it("should handle empty objects", () => {
    const obj = {};
    const result = jsonStringify(obj);
    expect(result).toBe("{}");
  });

  it("should handle nested objects", () => {
    const obj = { key: { nestedKey: "nestedValue" } };
    const result = jsonStringify(obj);
    expect(result).toBe('{"key":{"nestedKey":"nestedValue"}}');
  });

  it("should handle arrays", () => {
    const arr = [1, 2, 3];
    const result = jsonStringify(arr);
    expect(result).toBe("[1,2,3]");
  });

  it("should handle strings", () => {
    const str = "test";
    const result = jsonStringify(str);
    expect(result).toBe('"test"');
  });

  it("should handle numbers", () => {
    const num = 123;
    const result = jsonStringify(num);
    expect(result).toBe("123");
  });

  it("should handle booleans", () => {
    const bool = true;
    const result = jsonStringify(bool);
    expect(result).toBe("true");
  });

  it("should handle null", () => {
    const result = jsonStringify(null);
    expect(result).toBe("null");
  });

  it("should handle undefined", () => {
    const result = jsonStringify(undefined);
    expect(result).toBe(undefined);
  });

  it("should handle nested undefined", () => {
    const obj = { key: { nestedKey: undefined } };
    const result = jsonStringify(obj);
    expect(result).toBe('{"key":{"nestedKey":"!!UNDEFINED!!"}}');
  });
});
