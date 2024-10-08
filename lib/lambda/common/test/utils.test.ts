import { getFormattedDate } from "../src/utils";

describe("getFormattedDate", () => {
  it("should return the formatted date string in JST", () => {
    const date = new Date("2023-06-12T07:22:01Z"); // UTC time
    const expected = "2023-06-12 16:22:01"; // JST time
    const result = getFormattedDate(date);
    expect(result).toBe(expected);
  });
});
