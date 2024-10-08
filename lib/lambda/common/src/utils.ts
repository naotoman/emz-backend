import * as util from "util";

/**
 * Returns a formatted string of the date and time (JST).
 * ex. 2023-06-12 16:22:01
 * @returns a formatted string of the date and time (JST).
 */
export const getFormattedDate = (date: Date): string => {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  };
  return date.toLocaleString("ja-JP", options).replaceAll("/", "-");
};

/**
 * Logs the object to the console.
 * @param obj - An object to be logged.
 */
export const log = (obj: unknown) => {
  console.log(util.inspect(obj, { depth: null }));
};
