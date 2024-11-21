/**
 * Returns a formatted string of current date and time (JST).
 * ex. 2023-06-12 16:22:01
 * @returns a formatted string of current date and time (JST).
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
 * Returns the gap between two dates.
 * @param targetDate - The target date string.
 * @param baseDate - The current date string.
 * @returns the gap between two dates.
 */
export const dateGap = (targetDate: string, baseDate: string): number => {
  const base = new Date(baseDate);
  const target = new Date(targetDate);
  const timeDiff = target.getTime() - base.getTime();
  const dayDiff = timeDiff / (1000 * 3600 * 24);
  return dayDiff;
};
