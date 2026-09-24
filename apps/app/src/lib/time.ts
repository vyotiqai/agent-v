const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];
const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "just now", "5 minutes ago", "yesterday"… */
export function ago(iso: string) {
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  for (const [unit, size] of units)
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  return "just now";
}
