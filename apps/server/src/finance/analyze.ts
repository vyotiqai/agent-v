import type { AmountConvention, FinanceReport, Transaction } from "@agent-v/shared";
import { AppError } from "../errors.ts";

const maxRows = 5000;

/** RFC 4180 CSV with quoted fields, CRLF and a BOM. The delimiter is detected from the header. */
export function parseCsv(input: string): string[][] {
  const csv = input.replace(/^﻿/, "");
  const firstLine = csv.slice(0, csv.search(/\r?\n|$/));
  const delimiter = [",", ";", "\t"].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i <= csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === undefined) throw new AppError("The CSV has an unclosed quoted field", 422);
      if (c === '"' && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && !cell.trim()) {
      cell = "";
      quoted = true;
    } else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r" || c === undefined) {
      if (c === "\r" && csv[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => v.trim())) rows.push(row.map((v) => v.trim()));
      row = [];
      if (rows.length > maxRows + 1)
        throw new AppError(`Import at most ${maxRows.toLocaleString("en")} transactions`, 422);
    } else cell += c;
  }
  return rows;
}

const aliases = {
  date: ["date", "transaction date", "posted date", "posting date", "booking date", "trans date"],
  description: [
    "description",
    "details",
    "memo",
    "payee",
    "merchant",
    "name",
    "narrative",
    "transaction description",
    "reference",
  ],
  amount: ["amount", "transaction amount", "value", "amount (usd)", "amount (eur)", "sum"],
  debit: ["debit", "debits", "withdrawal", "withdrawals", "money out", "paid out", "outflow"],
  credit: ["credit", "credits", "deposit", "deposits", "money in", "paid in", "inflow"],
  category: ["category", "categories", "type of spend"],
  currency: ["currency", "ccy"],
};
type Column = keyof typeof aliases;

function columns(header: string[]) {
  const names = header.map((h) =>
    h
      .toLowerCase()
      .replace(/[_\s]+/g, " ")
      .trim(),
  );
  const found = {} as Partial<Record<Column, number>>;
  for (const key of Object.keys(aliases) as Column[]) {
    const index = names.findIndex((n) => aliases[key].includes(n));
    if (index >= 0) found[key] = index;
  }
  return found;
}

const symbols: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "₹": "INR",
  "¥": "JPY",
};

/** Parse "1,234.56", "1.234,56", "(12.00)", "-$5", "12.00-" or "€ 3,50" into cents. */
export function parseAmount(raw: string): { cents: number; currency: string | null } | null {
  let s = raw.trim();
  if (!s) return null;
  let currency: string | null = null;
  for (const [symbol, code] of Object.entries(symbols)) if (s.includes(symbol)) currency = code;
  const code = s.match(/\b(USD|EUR|GBP|INR|JPY|CAD|AUD)\b/i)?.[1];
  if (code) currency = code.toUpperCase();
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^\d.,+-]/g, "");
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let decimal: "." | "," | null = null;
  if (lastDot >= 0 && lastComma >= 0) decimal = lastDot > lastComma ? "." : ",";
  else if (lastComma >= 0) decimal = /,\d{1,2}$/.test(s) && !/,\d{3}(,|$)/.test(s) ? "," : null;
  else if (lastDot >= 0)
    decimal = /\.\d{3}$/.test(s) && (s.match(/\./g)?.length ?? 0) > 1 ? null : ".";
  const [whole = "", fraction = ""] = decimal
    ? [s.slice(0, s.lastIndexOf(decimal)), s.slice(s.lastIndexOf(decimal) + 1)]
    : [s, ""];
  const digits = whole.replace(/[.,]/g, "");
  if (fraction.length > 2 || !digits) return null;
  const cents = Number(digits) * 100 + Number(fraction.padEnd(2, "0") || 0);
  if (!Number.isSafeInteger(cents) || cents > 1e13) return null;
  return { cents: negative ? -cents : cents, currency };
}

const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Numeric dates are read day-first or month-first, whichever fits every row. */
function dateReader(samples: string[]) {
  let dayFirst = false;
  for (const s of samples) {
    const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (m && Number(m[1]) > 12) dayFirst = true;
  }
  const month = (name: string | undefined) => months.indexOf(String(name).toLowerCase()) + 1;
  // Each reader returns [year, month, day] or null.
  const readers: ((s: string) => [number, number, number] | null)[] = [
    (s) => {
      const m = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:[T\s].*)?$/);
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
    },
    (s) => {
      const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
      if (!m) return null;
      const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const year = y < 100 ? 2000 + y : y;
      return dayFirst || s.includes(".") ? [year, b, a] : [year, a, b];
    },
    (s) => {
      const m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})$/);
      return m ? [Number(m[3]), month(m[2]), Number(m[1])] : null;
    },
    (s) => {
      const m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/);
      return m ? [Number(m[3]), month(m[1]), Number(m[2])] : null;
    },
  ];
  return (raw: string): string | null => {
    const s = raw.trim();
    let parts: [number, number, number] | null = null;
    for (const read of readers) {
      parts = read(s);
      if (parts) break;
    }
    if (!parts) return null;
    const [y, mo, d] = parts;
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (mo < 1 || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
    return date.toISOString().slice(0, 10);
  };
}

const categoryRules: [string, RegExp][] = [
  ["Income", /\b(salary|payroll|paycheck|direct dep|interest paid|dividend|refund)\b/i],
  ["Housing", /\b(rent|mortgage|landlord|hoa|property)\b/i],
  [
    "Utilities",
    /\b(electric|energy|power|water|gas bill|internet|comcast|verizon|at&t|t-mobile|utility|broadband)\b/i,
  ],
  [
    "Groceries",
    /\b(grocery|groceries|supermarket|whole foods|trader joe|safeway|kroger|aldi|lidl|tesco|costco|walmart)\b/i,
  ],
  [
    "Dining",
    /\b(restaurant|cafe|coffee|starbucks|pizza|ramen|sushi|burger|bar |doordash|uber eats|grubhub|deliveroo|mcdonald|chipotle|bakery)\b/i,
  ],
  [
    "Transport",
    /\b(uber|lyft|taxi|metro|transit|train|bus|fuel|gas station|shell|chevron|parking|toll)\b/i,
  ],
  [
    "Subscriptions",
    /\b(netflix|spotify|hulu|disney|youtube|apple\.com|icloud|prime|patreon|subscription|github|openai|adobe)\b/i,
  ],
  ["Shopping", /\b(amazon|target|ikea|best buy|ebay|etsy|store|shop)\b/i],
  ["Health", /\b(pharmacy|cvs|walgreens|doctor|dental|clinic|hospital|gym|fitness)\b/i],
  ["Travel", /\b(airline|airways|flight|hotel|airbnb|booking\.com|expedia)\b/i],
  ["Transfers", /\b(transfer|venmo|zelle|paypal|atm|withdrawal)\b/i],
];

export function categorize(description: string, cents: number) {
  for (const [name, rule] of categoryRules) if (rule.test(description)) return name;
  return cents < 0 ? "Income" : "Other";
}

/** A stable, readable merchant name: card prefixes, reference numbers and noise removed. */
export function merchantName(description: string) {
  const cleaned = description
    .replace(
      /^(pos|debit card purchase|card purchase|purchase|visa|mastercard|dd|so|sq \*|tst\*)\s*/i,
      "",
    )
    .replace(/\b(x{2,}|\*{2,})\d+\b/gi, "")
    .replace(/\*\S*/g, "")
    .replace(/\b[a-z]{0,2}\d{5,}\b/gi, "")
    .replace(/#\s*\d+/g, "")
    .replace(/\b\d{3,}\b/g, "")
    .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, "")
    .replace(/[*_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words =
    cleaned
      .split(" ")
      .map((w) => w.replace(/^[-–.,:]+|[-–.,:]+$/g, ""))
      .filter((w) => /[a-z]/i.test(w))
      .slice(0, 3)
      .join(" ") || description.trim();
  return words
    .toLowerCase()
    .replace(/(^|\s)[a-z]/g, (c) => c.toUpperCase())
    .slice(0, 60);
}

type Summary = Omit<FinanceReport, "id" | "name" | "goalId" | "createdAt">;
const toMoney = (cents: number) => Math.round(cents) / 100;

export function analyzeTransactions(
  csv: string,
  signs: "auto" | "expenses_positive" | "expenses_negative" = "auto",
): { summary: Summary; transactions: Transaction[] } {
  const [header, ...body] = parseCsv(csv);
  if (!header || !body.length) throw new AppError("The CSV has no transactions", 422);
  if (body.length > maxRows)
    throw new AppError(`Import at most ${maxRows.toLocaleString("en")} transactions`, 422);
  const col = columns(header);
  const hasSplit = col.debit !== undefined || col.credit !== undefined;
  if (
    col.date === undefined ||
    col.description === undefined ||
    (col.amount === undefined && !hasSplit)
  )
    throw new AppError(
      "The CSV needs a date, a description, and an amount column (or debit and credit columns)",
      422,
    );
  const get = (row: string[], key: Column) => (col[key] === undefined ? "" : (row[col[key]] ?? ""));
  const readDate = dateReader(body.map((r) => get(r, "date")));
  const warnings: string[] = [];
  const currencies = new Set<string>();
  const raw: { date: string; description: string; cents: number; category: string }[] = [];
  let skipped = 0;
  for (const row of body) {
    const date = readDate(get(row, "date"));
    let amount: ReturnType<typeof parseAmount>;
    if (col.amount !== undefined && get(row, "amount")) amount = parseAmount(get(row, "amount"));
    else {
      // Debit is money out, credit is money in; one of them is filled per row.
      const debit = parseAmount(get(row, "debit"));
      const credit = parseAmount(get(row, "credit"));
      amount =
        debit || credit
          ? {
              cents: Math.abs(debit?.cents ?? 0) - Math.abs(credit?.cents ?? 0),
              currency: debit?.currency ?? credit?.currency ?? null,
            }
          : null;
    }
    if (!date || !amount) {
      skipped++;
      continue;
    }
    const currency = get(row, "currency").toUpperCase() || amount.currency;
    if (currency) currencies.add(currency);
    raw.push({
      date,
      description: get(row, "description").slice(0, 300) || "(no description)",
      cents: amount.cents,
      category: get(row, "category").slice(0, 60),
    });
  }
  if (!raw.length) throw new AppError("No rows had a readable date and amount", 422);
  if (skipped > body.length * 0.2)
    throw new AppError(
      `${skipped} of ${body.length} rows had an unreadable date or amount. Check the file's format.`,
      422,
    );
  if (skipped)
    warnings.push(
      `Skipped ${skipped} row${skipped === 1 ? "" : "s"} with an unreadable date or amount.`,
    );
  if (currencies.size > 1)
    warnings.push(
      `The file mixes currencies (${[...currencies].join(", ")}); totals add them as-is.`,
    );

  let convention: AmountConvention;
  if (hasSplit && col.amount === undefined) convention = "debit_credit";
  else if (signs !== "auto") convention = signs;
  else {
    // Bank exports usually show spending as negative; most rows in a statement are spending.
    const negatives = raw.filter((t) => t.cents < 0).length;
    convention = negatives > raw.length / 2 ? "expenses_negative" : "expenses_positive";
    warnings.push(
      convention === "expenses_negative"
        ? "Read negative amounts as spending. Import again with the other sign if that is wrong."
        : "Read positive amounts as spending. Import again with the other sign if that is wrong.",
    );
  }
  const flip = convention === "expenses_negative" ? -1 : 1;
  const transactions: (Transaction & { cents: number })[] = raw
    .map((t) => {
      const cents = t.cents * flip;
      return {
        date: t.date,
        description: t.description,
        cents,
        amount: toMoney(cents),
        category: t.category || categorize(t.description, cents),
        merchant: merchantName(t.description),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  let income = 0;
  let spending = 0;
  const byCategory = new Map<string, number>();
  const byMonth = new Map<string, { income: number; spending: number }>();
  const byMerchant = new Map<
    string,
    { cents: number; count: number; months: Map<string, number[]>; category: string }
  >();
  for (const t of transactions) {
    const month = t.date.slice(0, 7);
    const m = byMonth.get(month) ?? { income: 0, spending: 0 };
    if (t.cents >= 0) {
      spending += t.cents;
      m.spending += t.cents;
      byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.cents);
      const merchant = byMerchant.get(t.merchant) ?? {
        cents: 0,
        count: 0,
        months: new Map(),
        category: t.category,
      };
      merchant.cents += t.cents;
      merchant.count++;
      merchant.months.set(month, [...(merchant.months.get(month) ?? []), t.cents]);
      byMerchant.set(t.merchant, merchant);
    } else {
      income -= t.cents;
      m.income -= t.cents;
    }
    byMonth.set(month, m);
  }
  const recurring = [...byMerchant]
    .filter(([, m]) => m.months.size >= 2 && [...m.months.values()].every((v) => v.length === 1))
    .map(([name, m]) => {
      const amounts = [...m.months.values()].map((v) => v[0] ?? 0).sort((a, b) => a - b);
      const median = amounts[Math.floor(amounts.length / 2)] ?? 0;
      // Subscriptions and bills repeat at (almost) the same amount.
      const steady = amounts.every((a) => Math.abs(a - median) <= Math.max(50, median * 0.03));
      return steady
        ? { merchant: name, amount: toMoney(median), months: m.months.size, category: m.category }
        : null;
    })
    .filter((r) => r !== null)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 20);
  const dates = transactions.map((t) => t.date).sort();
  return {
    summary: {
      currency: currencies.size === 1 ? ([...currencies][0] ?? null) : null,
      convention,
      period: { from: dates[0] ?? "", to: dates.at(-1) ?? "" },
      count: transactions.length,
      income: toMoney(income),
      spending: toMoney(spending),
      net: toMoney(income - spending),
      categories: [...byCategory]
        .map(([name, cents]) => ({
          name,
          amount: toMoney(cents),
          share: spending ? Math.round((cents / spending) * 1000) / 1000 : 0,
        }))
        .sort((a, b) => b.amount - a.amount),
      months: [...byMonth]
        .map(([month, v]) => ({ month, income: toMoney(v.income), spending: toMoney(v.spending) }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      merchants: [...byMerchant]
        .map(([name, m]) => ({ name, amount: toMoney(m.cents), count: m.count }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10),
      recurring,
      warnings,
    },
    transactions: transactions.map(({ cents, ...t }) => t),
  };
}

/** Three months of fictional transactions, dated relative to today, for trying the feature. */
export function sampleTransactionsCsv(now = new Date()) {
  const rows = ["Date,Description,Amount,Category"];
  const date = (monthsAgo: number, day: number) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, day));
    return d.toISOString().slice(0, 10);
  };
  const monthly: [number, string, string, string][] = [
    [1, "Payroll ACME Corp", "-4200.00", "Income"],
    [2, "Rent - Oak Street Apartments", "1650.00", "Housing"],
    [5, "City Power & Light", "84.20", ""],
    [8, "NETFLIX.COM", "15.49", ""],
    [9, "Spotify P1234567", "11.99", ""],
    [11, "Comcast Internet", "65.00", ""],
    [15, "Payroll ACME Corp", "-4200.00", "Income"],
    [21, "Planet Fitness #221", "24.99", ""],
  ];
  const varied: [number, string, number][] = [
    [3, "Whole Foods Market #10234", 92.14],
    [6, "Trader Joe's #552", 64.37],
    [7, "Blue Bottle Coffee", 6.5],
    [10, "Uber Trip 8XK2", 18.4],
    [12, "Ramen Nakamura", 38.9],
    [13, "Amazon.com*MK12", 47.99],
    [16, "Shell Oil 57442", 51.02],
    [17, "Whole Foods Market #10234", 88.61],
    [19, "Chipotle 1832", 14.25],
    [22, "CVS Pharmacy #0931", 23.18],
    [24, "Target T-1932", 76.4],
    [26, "Trader Joe's #552", 71.09],
    [27, "Blue Bottle Coffee", 6.5],
  ];
  for (let m = 2; m >= 0; m--) {
    for (const [day, description, amount, category] of monthly)
      if (m > 0 || day <= now.getUTCDate())
        rows.push(`${date(m, day)},${description},${amount},${category}`);
    for (const [day, description, base] of varied) {
      if (m === 0 && day > now.getUTCDate()) continue;
      const amount = (base * (0.7 + ((day * (m + 3)) % 7) / 10)).toFixed(2);
      rows.push(`${date(m, day)},"${description}",${amount},`);
    }
  }
  return `${rows.join("\n")}\n`;
}
