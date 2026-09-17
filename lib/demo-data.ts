import type { DebtInput } from "@/lib/simulate";

export const previewDebts: DebtInput[] = [
  { id: "preview-card", name: "Credit card", balance: 7250, apr: 24.9, min_payment: 220, extra_payment: 100, start_date: "2026-09-01", account_type: "Credit card" },
  { id: "preview-car", name: "Car finance", balance: 4820, apr: 8.7, min_payment: 145, extra_payment: 50, start_date: "2026-09-01", account_type: "Car finance" },
  { id: "preview-overdraft", name: "Overdraft", balance: 1400, apr: 39.9, min_payment: 80, extra_payment: 50, start_date: "2026-09-01", account_type: "Overdraft" },
];

export const previewIncome = {
  currency: "GBP" as const,
  monthly_income: 2800,
  housing_cost: 950,
  utilities_cost: 260,
  food_cost: 380,
  transport_cost: 220,
  other_essential_cost: 190,
};

export const previewCashflow = [
  { id: "income-wages", kind: "income" as const, name: "Main wages", amount: 2500, pay_day: 28 },
  { id: "income-benefit", kind: "income" as const, name: "Other regular income", amount: 300, pay_day: 10 },
  { id: "expense-home", kind: "essential" as const, name: "Rent or mortgage", amount: 950, pay_day: 1 },
  { id: "expense-bills", kind: "essential" as const, name: "Bills and utilities", amount: 260, pay_day: 1 },
  { id: "expense-food", kind: "essential" as const, name: "Food and groceries", amount: 380, pay_day: 1 },
  { id: "expense-travel", kind: "essential" as const, name: "Transport", amount: 220, pay_day: 1 },
  { id: "expense-other", kind: "essential" as const, name: "Other essentials", amount: 190, pay_day: 1 },
];

export const previewAccounts = [
  { id: "asset-cash", name: "Emergency cash", asset_type: "Cash", value: 1200 },
  { id: "asset-savings", name: "Savings account", asset_type: "Savings account", value: 3400 },
  { id: "asset-crypto", name: "Crypto portfolio", asset_type: "Crypto", value: 850 },
  { id: "asset-stocks", name: "Stocks & ETFs", asset_type: "Stocks", value: 2100 },
];
