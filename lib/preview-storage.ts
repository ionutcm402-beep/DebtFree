import { CurrencyCode, isCurrencyCode } from "@/lib/currency";
import { previewAccounts, previewCashflow, previewDebts } from "@/lib/demo-data";
import type { DebtInput } from "@/lib/simulate";
import type { WorkIncomeSettings, WorkShift } from "@/lib/uk-pay";

export type PreviewCashflowEntry = { id: string; kind: "income" | "essential"; name: string; amount: number; pay_day: number };
export type PreviewMoneyAccount = { id: string; name: string; asset_type: string; value: number };
export type PreviewExpense = {
  id: string;
  merchant: string;
  expense_date: string;
  amount: number;
  category: string;
  source: "manual" | "receipt_private" | "receipt_ai";
};
export type PreviewWasteEntry = {
  id: string;
  name: string;
  waste_date: string;
  amount: number;
  reason: string;
  category: string;
};
export type PreviewSavingEntry = {
  id: string;
  name: string;
  saving_date: string;
  amount: number;
  reason: string;
  category: string;
  allocation_type: "unassigned" | "available" | "emergency" | "debt";
  allocation_target: string;
  allocation_label: string;
  allocation_complete: boolean;
};
export type PreviewBill = {
  id: string;
  name: string;
  amount: number;
  due_day: number;
  category: string;
  autopay: boolean;
  last_paid_month: string | null;
};
export type PreviewMoneyGoal = {
  id: string;
  name: string;
  goal_type: string;
  target_amount: number;
  current_amount: number;
  target_date: string;
};
export type PreviewSubscription = {
  id: string;
  name: string;
  category: string;
  amount: number;
  billing_cycle: "monthly" | "annual";
  renewal_date: string;
  decision: "keep" | "review" | "cancel";
};
export type PreviewCategoryBudget = { id: string; category: string; monthly_limit: number };
export type PreviewDebtPayment = { id: string; debt_id: string; payment_date: string; amount: number; note: string };
export type PreviewDebtSnapshot = { id: string; snapshot_date: string; total_balance: number };
export type PreviewState = {
  debts: DebtInput[];
  cashflow: PreviewCashflowEntry[];
  accounts: PreviewMoneyAccount[];
  expenses: PreviewExpense[];
  wasteEntries: PreviewWasteEntry[];
  savingEntries: PreviewSavingEntry[];
  bills: PreviewBill[];
  goals: PreviewMoneyGoal[];
  subscriptions: PreviewSubscription[];
  forecastSettings: { starting_balance: number; horizon: 30 | 60 | 90; debt_payment_day: number };
  categoryBudgets: PreviewCategoryBudget[];
  debtPayments: PreviewDebtPayment[];
  debtSnapshots: PreviewDebtSnapshot[];
  workShifts: WorkShift[];
  workIncomeSettings: WorkIncomeSettings;
  currency: CurrencyCode;
};

const storageKey = "debt-payoff-planner-preview-v1";
const cookieMaxAge = 60 * 60 * 24 * 365;

export function hasSavedPreviewState(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage?.getItem(storageKey)) return true;
  } catch {
    // The cookie fallback is checked below.
  }
  return typeof document !== "undefined" && document.cookie
    .split("; ")
    .some((cookie) => cookie.startsWith(`${storageKey}=`));
}

const defaults = (): PreviewState => ({
  debts: previewDebts.map((debt) => ({ ...debt })),
  cashflow: previewCashflow.map((entry) => ({ ...entry })),
  accounts: previewAccounts.map((account) => ({ ...account })),
  expenses: [],
  wasteEntries: [],
  savingEntries: [],
  bills: [
    { id: "b1000000-0000-4000-8000-000000000001", name: "Rent", amount: 950, due_day: 1, category: "Housing", autopay: true, last_paid_month: null },
    { id: "b1000000-0000-4000-8000-000000000002", name: "Electricity", amount: 82, due_day: 12, category: "Utilities", autopay: true, last_paid_month: null },
    { id: "b1000000-0000-4000-8000-000000000003", name: "Mobile phone", amount: 24, due_day: 22, category: "Phone & internet", autopay: false, last_paid_month: null },
  ],
  goals: [
    { id: "a1000000-0000-4000-8000-000000000001", name: "Emergency cushion", goal_type: "Emergency fund", target_amount: 3000, current_amount: 650, target_date: "2027-09-01" },
    { id: "a1000000-0000-4000-8000-000000000002", name: "Weekend away", goal_type: "Holiday", target_amount: 900, current_amount: 180, target_date: "2027-04-01" },
  ],
  subscriptions: [
    { id: "c1000000-0000-4000-8000-000000000001", name: "Streaming service", category: "Entertainment", amount: 10.99, billing_cycle: "monthly", renewal_date: "2026-10-03", decision: "keep" },
    { id: "c1000000-0000-4000-8000-000000000002", name: "Cloud storage", category: "Technology", amount: 79.99, billing_cycle: "annual", renewal_date: "2026-10-12", decision: "review" },
    { id: "c1000000-0000-4000-8000-000000000003", name: "Unused app", category: "Apps", amount: 6.99, billing_cycle: "monthly", renewal_date: "2026-09-28", decision: "cancel" },
  ],
  forecastSettings: { starting_balance: 1450, horizon: 60, debt_payment_day: 28 },
  categoryBudgets: [
    { id: "d1000000-0000-4000-8000-000000000001", category: "Groceries", monthly_limit: 450 },
    { id: "d1000000-0000-4000-8000-000000000002", category: "Eating out", monthly_limit: 120 },
    { id: "d1000000-0000-4000-8000-000000000003", category: "Transport", monthly_limit: 220 },
    { id: "d1000000-0000-4000-8000-000000000004", category: "Shopping", monthly_limit: 100 },
    { id: "d1000000-0000-4000-8000-000000000005", category: "Entertainment", monthly_limit: 80 },
  ],
  debtPayments: [
    { id: "e1000000-0000-4000-8000-000000000001", debt_id: "preview-card", payment_date: "2026-09-05", amount: 320, note: "Monthly payment" },
    { id: "e1000000-0000-4000-8000-000000000002", debt_id: "preview-overdraft", payment_date: "2026-09-12", amount: 130, note: "Minimum plus extra" },
  ],
  debtSnapshots: [
    { id: "f1000000-0000-4000-8000-000000000001", snapshot_date: "2026-06-01", total_balance: 14780 },
    { id: "f1000000-0000-4000-8000-000000000002", snapshot_date: "2026-07-01", total_balance: 14320 },
    { id: "f1000000-0000-4000-8000-000000000003", snapshot_date: "2026-08-01", total_balance: 13890 },
    { id: "f1000000-0000-4000-8000-000000000004", snapshot_date: "2026-09-01", total_balance: 13470 },
  ],
  workShifts: [],
  workIncomeSettings: { hourly_rate: 0, tax_code: "1257L", ni_category: "A", pension_percent: 0, holiday_allowance_days: 28, holiday_day_hours: 8, payroll_cutoff_days: 7, payroll_payday_weekday: 5, payroll_week_start: 5 },
  currency: "GBP",
});

export function loadPreviewState(): PreviewState {
  const fallback = defaults();
  if (typeof window === "undefined") return fallback;
  try {
    let raw: string | null = null;
    try {
      raw = window.localStorage?.getItem(storageKey) ?? null;
    } catch {
      // Some embedded previews block localStorage; the cookie below is the fallback.
    }
    if (!raw && typeof document !== "undefined") {
      const storedCookie = document.cookie
        .split("; ")
        .find((cookie) => cookie.startsWith(`${storageKey}=`));
      if (storedCookie) raw = decodeURIComponent(storedCookie.slice(storageKey.length + 1));
    }
    const stored = JSON.parse(raw ?? "null") as Partial<PreviewState> | null;
    if (!stored) return fallback;
    return {
      debts: Array.isArray(stored.debts) ? stored.debts : fallback.debts,
      cashflow: Array.isArray(stored.cashflow) ? stored.cashflow.map((entry) => ({ ...entry, pay_day: Number(entry.pay_day ?? 1) })) : fallback.cashflow,
      accounts: Array.isArray(stored.accounts) ? stored.accounts : fallback.accounts,
      expenses: Array.isArray(stored.expenses) ? stored.expenses : fallback.expenses,
      wasteEntries: Array.isArray(stored.wasteEntries) ? stored.wasteEntries : fallback.wasteEntries,
      savingEntries: Array.isArray(stored.savingEntries) ? stored.savingEntries : fallback.savingEntries,
      bills: Array.isArray(stored.bills) ? stored.bills : fallback.bills,
      goals: Array.isArray(stored.goals) ? stored.goals : fallback.goals,
      subscriptions: Array.isArray(stored.subscriptions) ? stored.subscriptions : fallback.subscriptions,
      forecastSettings: stored.forecastSettings && typeof stored.forecastSettings === "object" ? stored.forecastSettings : fallback.forecastSettings,
      categoryBudgets: Array.isArray(stored.categoryBudgets) ? stored.categoryBudgets : fallback.categoryBudgets,
      debtPayments: Array.isArray(stored.debtPayments) ? stored.debtPayments : fallback.debtPayments,
      debtSnapshots: Array.isArray(stored.debtSnapshots) ? stored.debtSnapshots : fallback.debtSnapshots,
      workShifts: Array.isArray(stored.workShifts) ? stored.workShifts.map((shift) => ({
        ...shift,
        entry_type: shift.entry_type === "holiday" ? "holiday" as const : "work" as const,
        start_time: shift.start_time ?? "",
        finish_time: shift.finish_time ?? "",
        break_minutes: Number(shift.break_minutes ?? 0),
        holiday_days: Number(shift.holiday_days ?? 0),
      })) : fallback.workShifts,
      workIncomeSettings: stored.workIncomeSettings && typeof stored.workIncomeSettings === "object"
        ? { ...fallback.workIncomeSettings, ...stored.workIncomeSettings }
        : fallback.workIncomeSettings,
      currency: isCurrencyCode(stored.currency) ? stored.currency : fallback.currency,
    };
  } catch {
    return fallback;
  }
}

export function savePreviewState(patch: Partial<PreviewState>): void {
  if (typeof window === "undefined") return;
  const next = { ...loadPreviewState(), ...patch };
  const serialized = JSON.stringify(next);
  try {
    const storage = window.localStorage;
    if (!storage) throw new Error("Browser storage is unavailable");
    storage.setItem(storageKey, serialized);
    return;
  } catch {
    // Fall back for embedded previews or privacy modes that disable localStorage.
  }
  if (typeof document !== "undefined") {
    document.cookie = `${storageKey}=${encodeURIComponent(serialized)}; path=/; max-age=${cookieMaxAge}; SameSite=Lax`;
  }
}
