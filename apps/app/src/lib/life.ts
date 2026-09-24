import type { Monitor } from "@agent-v/shared";

/** 1234.5 → "1,234.50" (with "EUR " when the currency is known). */
export function money(value: number, currency: string | null = null) {
  const text = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${text}` : text;
}

export const intervals = [
  { value: 15, label: "15 min" },
  { value: 60, label: "Hourly" },
  { value: 360, label: "6 hours" },
  { value: 1440, label: "Daily" },
];

export function every(minutes: number) {
  const known = intervals.find((i) => i.value === minutes);
  if (known) return known.label.toLowerCase();
  return minutes % 60 ? `every ${minutes} min` : `every ${minutes / 60} h`;
}

/** What a watch is waiting for, in words. */
export function watchGoal(m: Pick<Monitor, "condition" | "value" | "currency">) {
  if (m.condition === "price_below") return `Price below ${money(Number(m.value), m.currency)}`;
  if (m.condition === "contains") return `“${m.value}” appears`;
  return "Any change";
}

/** The watch's current state in one short line. */
export function watchState(m: Monitor) {
  if (m.status === "stopped") return "Stopped";
  if (m.status === "paused") return m.error ? `Paused · ${m.error}` : "Paused";
  if (m.error) return `Retrying · ${m.error}`;
  if (!m.checks) return "Checking for the first time…";
  if (m.condition === "price_below")
    return m.lastPrice === null
      ? "No price found yet"
      : `${m.matched ? "Below target" : "Now"} ${money(m.lastPrice, m.currency)}`;
  if (m.condition === "contains") return m.matched ? "Found on the page" : "Not there yet";
  return `${m.checks} check${m.checks === 1 ? "" : "s"}`;
}

export const demoPages = [
  { url: "demo://availability", label: "Restaurant tables" },
  { url: "demo://price", label: "Headphones price" },
];
