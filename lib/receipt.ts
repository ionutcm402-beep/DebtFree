export const expenseCategories = [
  "Groceries",
  "Eating out",
  "Transport",
  "Housing",
  "Utilities",
  "Shopping",
  "Health",
  "Family",
  "Entertainment",
  "Subscriptions",
  "Debt payment",
  "Other",
] as const;

export type ExpenseCategory = (typeof expenseCategories)[number];

export type ReceiptResult = {
  merchant: string;
  expense_date: string;
  amount: number;
  category: ExpenseCategory;
  confidence: number;
};

const merchantCategories: Array<[ExpenseCategory, RegExp]> = [
  ["Groceries", /\b(tesco|sainsbury|asda|aldi|lidl|waitrose|morrisons|co-?op|iceland|supermarket|grocery|groceries)\b/i],
  ["Eating out", /\b(restaurant|cafe|coffee|pizza|burger|mcdonald|kfc|subway|deliveroo|just eat|uber eats|pub|bar)\b/i],
  ["Transport", /\b(shell|esso|bp|petrol|diesel|fuel|uber|train|rail|bus|parking|taxi|tfl)\b/i],
  ["Utilities", /\b(electric|electricity|water|gas bill|broadband|internet|mobile|vodafone|o2|ee|three)\b/i],
  ["Health", /\b(pharmacy|chemist|boots|hospital|dental|dentist|optician|medicine)\b/i],
  ["Family", /\b(nursery|childcare|school|toy|baby|kids|children)\b/i],
  ["Entertainment", /\b(cinema|theatre|bowling|game|ticket|spotify|netflix)\b/i],
  ["Subscriptions", /\b(subscription|membership|monthly plan|annual plan)\b/i],
  ["Housing", /\b(rent|mortgage|landlord|home repair|plumber|builder)\b/i],
  ["Shopping", /\b(amazon|primark|next|zara|h&m|clothing|clothes|argos|ikea|retail)\b/i],
];

function normaliseAmount(value: string) {
  const cleaned = value.replace(/\s/g, "").replace(/,(?=\d{2}$)/, ".").replace(/[^\d.]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseDate(text: string) {
  const iso = text.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const uk = text.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2}|\d{2})\b/);
  if (uk) {
    const year = uk[3].length === 2 ? `20${uk[3]}` : uk[3];
    return `${year}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`;
  }
  return new Date().toISOString().slice(0, 10);
}

export function categoriseExpense(text: string): ExpenseCategory {
  return merchantCategories.find(([, pattern]) => pattern.test(text))?.[0] ?? "Other";
}

export function parseReceiptText(text: string, ocrConfidence = 0): ReceiptResult {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const totalLines = lines.filter((line) => /\b(grand total|amount due|balance due|total)\b/i.test(line) && !/sub\s*total/i.test(line));
  const amountsFrom = (source: string[]) => source.flatMap((line) =>
    [...line.matchAll(/(?:£|gbp|eur|usd|\$|€)?\s*(\d{1,6}(?:[.,]\d{2}))/gi)].map((match) => normaliseAmount(match[1])),
  ).filter((amount) => amount > 0);
  const preferredAmounts = amountsFrom(totalLines);
  const allAmounts = amountsFrom(lines);
  const amount = preferredAmounts.at(-1) ?? (allAmounts.length ? Math.max(...allAmounts) : 0);
  const merchant = lines.find((line) =>
    line.length >= 2 && line.length <= 80 && !/\b(receipt|invoice|vat|tel|phone|www\.|http|date|time|cashier|store no)\b/i.test(line) && !/^\W?\d/.test(line),
  ) ?? "Receipt purchase";

  return {
    merchant: merchant.replace(/[^\p{L}\p{N}&' .-]/gu, "").trim() || "Receipt purchase",
    expense_date: normaliseDate(text),
    amount: Math.round(amount * 100) / 100,
    category: categoriseExpense(`${merchant}\n${text}`),
    confidence: Math.max(0, Math.min(1, ocrConfidence / 100)),
  };
}
