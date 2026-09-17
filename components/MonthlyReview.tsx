"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, CircleAlert, PiggyBank, ReceiptText, TrendingDown, WalletCards } from "lucide-react";
import { PlannerHeader } from "@/components/PlannerHeader";
import { Input } from "@/components/ui/input";
import { CurrencyCode, formatMoney, isCurrencyCode } from "@/lib/currency";
import { loadPreviewState, PreviewBill, PreviewCashflowEntry, PreviewExpense, PreviewSavingEntry, PreviewWasteEntry, savePreviewState } from "@/lib/preview-storage";
import { DebtInput, simulatePayoff } from "@/lib/simulate";
import { createClient } from "@/lib/supabase/client";

type ReviewData = {
  cashflow: PreviewCashflowEntry[];
  debts: DebtInput[];
  expenses: PreviewExpense[];
  savings: PreviewSavingEntry[];
  waste: PreviewWasteEntry[];
  bills: PreviewBill[];
};

const emptyData: ReviewData = { cashflow: [], debts: [], expenses: [], savings: [], waste: [], bills: [] };
const currentMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

export function MonthlyReview({ demo = false }: { demo?: boolean }) {
  const supabase = useMemo(() => demo ? null : createClient(), [demo]);
  const [currency, setCurrency] = useState<CurrencyCode>("GBP");
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<ReviewData>(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("All figures up to date");

  useEffect(() => {
    if (demo) {
      const preview = loadPreviewState();
      queueMicrotask(() => {
        setCurrency(preview.currency);
        setData({ cashflow: preview.cashflow, debts: preview.debts, expenses: preview.expenses, savings: preview.savingEntries, waste: preview.wasteEntries, bills: preview.bills });
        setStatus("Saved in this browser");
        setLoaded(true);
      });
      return;
    }
    if (!supabase) { window.location.replace("/preview/review"); return; }
    let active = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.replace("/login"); return; }
      const [cashflow, debts, settings, expenses, savings, waste, bills] = await Promise.all([
        supabase.from("cashflow_entries").select("id,kind,name,amount,pay_day").order("created_at"),
        supabase.from("debts").select("id,name,balance,apr,min_payment,extra_payment,start_date,account_type").order("created_at"),
        supabase.from("user_settings").select("currency").maybeSingle(),
        supabase.from("expenses").select("id,merchant,expense_date,amount,category,source").order("expense_date", { ascending: false }),
        supabase.from("saving_entries").select("id,name,saving_date,amount,reason,category,allocation_type,allocation_target,allocation_label,allocation_complete").order("saving_date", { ascending: false }),
        supabase.from("waste_entries").select("id,name,waste_date,amount,reason,category").order("waste_date", { ascending: false }),
        supabase.from("bills").select("id,name,amount,due_day,category,autopay,last_paid_month").order("due_day"),
      ]);
      if (!active) return;
      const hasError = [cashflow, debts, settings, expenses, savings, waste, bills].some((result) => result.error);
      setStatus(hasError ? "Some figures couldn’t be loaded" : "All figures up to date");
      setCurrency(isCurrencyCode(settings.data?.currency) ? settings.data.currency : "GBP");
      setData({
        cashflow: (cashflow.data ?? []).map((entry) => ({ ...entry, kind: entry.kind as PreviewCashflowEntry["kind"], amount: Number(entry.amount), pay_day: Number(entry.pay_day ?? 1) })),
        debts: (debts.data ?? []).map((debt) => ({ ...debt, balance: Number(debt.balance), apr: Number(debt.apr), min_payment: Number(debt.min_payment), extra_payment: Number(debt.extra_payment ?? 0) })),
        expenses: (expenses.data ?? []).map((entry) => ({ ...entry, amount: Number(entry.amount), source: entry.source as PreviewExpense["source"] })),
        savings: (savings.data ?? []).map((entry) => ({ ...entry, amount: Number(entry.amount), allocation_type: entry.allocation_type as PreviewSavingEntry["allocation_type"] })),
        waste: (waste.data ?? []).map((entry) => ({ ...entry, amount: Number(entry.amount) })),
        bills: (bills.data ?? []).map((entry) => ({ ...entry, amount: Number(entry.amount), due_day: Number(entry.due_day) })),
      });
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [demo, supabase]);

  const income = data.cashflow.filter((entry) => entry.kind === "income").reduce((sum, entry) => sum + entry.amount, 0);
  const essentials = data.cashflow.filter((entry) => entry.kind === "essential").reduce((sum, entry) => sum + entry.amount, 0);
  const debtPayments = data.debts.reduce((sum, debt) => sum + debt.min_payment + (debt.extra_payment ?? 0), 0);
  const flexiblePlan = income - essentials - debtPayments;
  const monthExpenses = data.expenses.filter((entry) => entry.expense_date.startsWith(month));
  const spending = monthExpenses.reduce((sum, entry) => sum + entry.amount, 0);
  const moneyLeft = flexiblePlan - spending;
  const monthSavings = data.savings.filter((entry) => entry.saving_date.startsWith(month));
  const saved = monthSavings.reduce((sum, entry) => sum + entry.amount, 0);
  const monthWaste = data.waste.filter((entry) => entry.waste_date.startsWith(month));
  const wasted = monthWaste.reduce((sum, entry) => sum + entry.amount, 0);
  const savedMinusWasted = saved - wasted;
  const paidBills = data.bills.filter((bill) => bill.last_paid_month === month);
  const paidBillTotal = paidBills.reduce((sum, bill) => sum + bill.amount, 0);

  const categoryTotals = (() => {
    const totals = new Map<string, number>();
    for (const expense of monthExpenses) totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
    return [...totals.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
  })();
  const largestCategory = Math.max(1, ...categoryTotals.map((entry) => entry.total));

  const plannedDebtSavings = monthSavings.filter((entry) => entry.allocation_type === "debt" && !entry.allocation_complete && entry.allocation_target);
  const plannedDebtTotal = plannedDebtSavings.reduce((sum, entry) => sum + entry.amount, 0);
  const adjustedDebts = data.debts.map((debt) => {
    const topUp = plannedDebtSavings.filter((entry) => entry.allocation_target === debt.id).reduce((sum, entry) => sum + entry.amount, 0);
    return { ...debt, balance: Math.max(0, debt.balance - topUp) };
  });
  const baselinePlan = simulatePayoff(data.debts, 0, "avalanche");
  const topUpPlan = simulatePayoff(adjustedDebts, 0, "avalanche");
  const monthsSaved = baselinePlan.completed && topUpPlan.completed ? Math.max(0, baselinePlan.months - topUpPlan.months) : 0;
  const interestSaved = baselinePlan.completed && topUpPlan.completed ? Math.max(0, baselinePlan.totalInterest - topUpPlan.totalInterest) : 0;

  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));

  async function changeCurrency(next: CurrencyCode) {
    setCurrency(next);
    if (demo) {
      savePreviewState({ currency: next });
      setStatus("Saved in this browser");
      return;
    }
    if (!supabase) return;
    setStatus("Saving…");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("user_settings").upsert({ user_id: user.id, currency: next }, { onConflict: "user_id" });
    setStatus(error ? "Couldn’t save currency" : "All figures up to date");
  }

  if (!loaded) return <main className="grid min-h-screen place-items-center bg-paper"><p className="font-serif text-2xl">Preparing your review…</p></main>;

  return (
    <main className="min-h-screen bg-paper pb-20 text-center text-ink">
      <PlannerHeader demo={demo} active="review" currency={currency} onCurrencyChange={(next) => void changeCurrency(next)} status={status} />

      <div className="planner-content">
        <CalendarCheck className="mx-auto size-8 text-snowball" />
        <h1 className="mt-4 planner-title">Monthly review</h1>
        <label className="mt-6 inline-block text-sm font-semibold">Review month<Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mx-auto mt-2 w-52 rounded-none bg-white text-center" /></label>
        <p className="mx-auto mt-3 max-w-2xl text-[17px] leading-7 text-muted-ink">A clear look at {monthLabel}: what came in, what was planned, what was recorded, and what could improve next month.</p>

        <section className={`mx-auto mt-9 max-w-4xl border-y-4 bg-sheet px-6 py-9 ${moneyLeft >= 0 ? "border-positive" : "border-avalanche"}`}>
          <p className="text-sm font-semibold text-muted-ink">Money remaining after the plan and recorded spending</p>
          <p className={`mt-2 font-serif text-4xl tracking-[-.05em] sm:text-6xl ${moneyLeft >= 0 ? "text-ink" : "text-avalanche"}`}>{formatMoney(moneyLeft, currency)}</p>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-ink">This uses your current monthly income, essential-spending plan, debt commitments, and the purchases recorded for {monthLabel}.</p>
        </section>

        <section className="mt-10 border-y border-rule bg-sheet">
          <div className="grid md:grid-cols-4 md:divide-x md:divide-rule">
            <div className="p-6"><WalletCards className="mx-auto size-6 text-snowball" /><p className="mt-3 text-sm text-muted-ink">Income</p><p className="mt-1 font-serif text-3xl">{formatMoney(income, currency)}</p></div>
            <div className="border-t border-rule p-6 md:border-t-0"><TrendingDown className="mx-auto size-6 text-avalanche" /><p className="mt-3 text-sm text-muted-ink">Essentials + debt</p><p className="mt-1 font-serif text-3xl">{formatMoney(essentials + debtPayments, currency)}</p></div>
            <div className="border-t border-rule p-6 md:border-t-0"><ReceiptText className="mx-auto size-6" /><p className="mt-3 text-sm text-muted-ink">Recorded spending</p><p className="mt-1 font-serif text-3xl">{formatMoney(spending, currency)}</p></div>
            <div className="border-t border-rule p-6 md:border-t-0"><CalendarCheck className="mx-auto size-6 text-positive" /><p className="mt-3 text-sm text-muted-ink">Bills marked paid</p><p className="mt-1 font-serif text-3xl">{formatMoney(paidBillTotal, currency)}</p><p className="mt-1 text-xs text-muted-ink">{paidBills.length} bill{paidBills.length === 1 ? "" : "s"}</p></div>
          </div>
        </section>

        <section className="mt-10 grid gap-5 md:grid-cols-3">
          <div className="border-t-4 border-positive bg-sheet p-7"><PiggyBank className="mx-auto size-7 text-positive" /><p className="mt-4 text-sm text-muted-ink">Everyday money saved</p><p className="mt-1 font-serif text-4xl">{formatMoney(saved, currency)}</p></div>
          <div className="border-t-4 border-avalanche bg-sheet p-7"><CircleAlert className="mx-auto size-7 text-avalanche" /><p className="mt-4 text-sm text-muted-ink">Money wasted</p><p className="mt-1 font-serif text-4xl">{formatMoney(wasted, currency)}</p></div>
          <div className={`border-t-4 bg-sheet p-7 ${savedMinusWasted >= 0 ? "border-positive" : "border-avalanche"}`}><p className="text-sm text-muted-ink">Saved minus wasted</p><p className={`mt-5 font-serif text-4xl ${savedMinusWasted >= 0 ? "text-positive" : "text-avalanche"}`}>{savedMinusWasted >= 0 ? "+" : "−"}{formatMoney(Math.abs(savedMinusWasted), currency)}</p></div>
        </section>

        <section className="mt-10 grid gap-8 lg:grid-cols-[1fr_.85fr]">
          <div className="border-y border-rule bg-sheet p-6 sm:p-8">
            <h2 className="font-serif text-3xl">Where recorded spending went</h2>
            <div className="mt-7 space-y-5">
              {categoryTotals.length ? categoryTotals.map((entry) => <div key={entry.category}><div className="flex justify-between gap-4 text-sm"><span>{entry.category}</span><span className="font-semibold tabular-nums">{formatMoney(entry.total, currency)}</span></div><div className="mt-2 h-3 bg-muted"><div className="h-full bg-avalanche" style={{ width: `${Math.max(4, entry.total / largestCategory * 100)}%` }} /></div></div>) : <p className="py-8 text-muted-ink">No spending was recorded for this month.</p>}
            </div>
          </div>

          <aside className="border-y border-snowball bg-sheet p-6 sm:p-8">
            <h2 className="font-serif text-3xl">Debt-plan opportunity</h2>
            <p className="mt-4 text-sm leading-6 text-muted-ink">Planned saved money assigned to a debt but not yet marked as moved.</p>
            <p className="mt-5 font-serif text-5xl">{formatMoney(plannedDebtTotal, currency)}</p>
            {plannedDebtTotal > 0 ? <div className="mt-6 border-y border-rule py-5"><p className="font-semibold">If paid now using avalanche:</p><p className="mt-2 text-sm leading-6 text-muted-ink">Estimated {monthsSaved} month{monthsSaved === 1 ? "" : "s"} sooner and {formatMoney(interestSaved, currency)} less interest.</p></div> : <p className="mt-6 border-y border-rule py-5 text-sm leading-6 text-muted-ink">Assign an everyday saving to a debt on the Spending page to see its estimated effect here.</p>}
            <p className="mt-5 text-xs leading-5 text-muted-ink">This is a planning estimate based on current balances. It does not record a real payment.</p>
          </aside>
        </section>
      </div>
    </main>
  );
}
