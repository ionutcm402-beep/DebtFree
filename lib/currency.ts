export type CurrencyCode = string;

const fallbackCodes = ["GBP", "EUR", "USD", "RON", "CHF", "CAD", "AUD", "NZD", "JPY", "CNY", "HKD", "SGD", "INR", "BRL", "MXN", "ZAR", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "BGN", "TRY", "AED", "SAR", "ILS", "KRW", "THB"];

export const currencyCodes: string[] = (() => {
  try {
    const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "currency") => string[] };
    return intl.supportedValuesOf?.("currency") ?? fallbackCodes;
  } catch {
    return fallbackCodes;
  }
})();

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

export function currencyDetails(code: CurrencyCode) {
  const safeCode = isCurrencyCode(code) ? code : "GBP";
  let symbol = safeCode;
  let label = safeCode;
  try {
    symbol = new Intl.NumberFormat("en", { style: "currency", currency: safeCode, currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).formatToParts(0).find((part) => part.type === "currency")?.value ?? safeCode;
    label = new Intl.DisplayNames(["en"], { type: "currency" }).of(safeCode) ?? safeCode;
  } catch {}
  return { code: safeCode, symbol, label };
}

export function formatMoney(value: number, code: CurrencyCode, exact = true) {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: isCurrencyCode(code) ? code : "GBP",
      minimumFractionDigits: exact ? 2 : 0,
      maximumFractionDigits: exact ? 2 : 0,
    }).format(value);
  } catch {
    return `${code} ${value.toFixed(exact ? 2 : 0)}`;
  }
}
