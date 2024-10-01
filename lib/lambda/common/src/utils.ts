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
 * Returns a stringified JSON object.
 * If the value is undefined, it will be replaced with "!!UNDEFINED!!".
 * @param obj - An object to be stringified.
 * @returns A stringified JSON object.
 */
export const jsonStringify = (obj: unknown) => {
  if (obj == null) return JSON.stringify(obj);
  return JSON.stringify(obj, (_, v) => (v === undefined ? "!!UNDEFINED!!" : v));
};
