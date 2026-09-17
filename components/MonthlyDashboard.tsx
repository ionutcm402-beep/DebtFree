"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, PiggyBank, ReceiptText, TrendingDown, WalletCards } from "lucide-react";
import { PlannerHeader } from "@/components/PlannerHeader";
import { Progress } from "@/components/ui/progress";
import { CurrencyCode, formatMoney, isCurrencyCode } from "@/lib/currency";
import { loadPreviewState, savePreviewState } from "@/lib/preview-storage";
import { createClient } from "@/lib/supabase/client";

type Totals = {
  income: number;
  essentials: number;
  debtPayments: number;
  spending: number;
  saved: number;
  savedUnassigned: number;
  savedMoved: number;
  wasted: number;
};

const emptyTotals: Totals = { income: 0, essentials: 0, debtPayments: 0, spending: 0, saved: 0, savedUnassigned: 0, savedMoved: 0, wasted: 0 };

function monthWindow(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const daysLeft = Math.max(1, lastDay - date.getDate() + 1);
  return { start, end, daysLeft };
}

const sumAmounts = (rows: Array<{ amount: unknown }> | null) =>
  (rows ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

export function MonthlyDashboard({ demo = false }: { demo?: boolean }) {
  const supabase = useMemo(() => demo ? null : createClient(), [demo]);
  const [currency, setCurrency] = useState<CurrencyCode>("GBP");
  const [totals, setTotals] = useState<Totals>(emptyTotals);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("All figures up to date");
  const { start, end, daysLeft } = useMemo(() => monthWindow(), []);
  const monthName = useMemo(() => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date()), []);

  useEffect(() => {
    if (demo) {
      const preview = loadPreviewState();
      const currentExpenses = preview.expenses.filter((entry) => entry.expense_date >= start && entry.expense_date <= end);
      const currentSavings = preview.savingEntries.filter((entry) => entry.saving_date >= start && entry.saving_date <= end);
      const currentWaste = preview.wasteEntries.filter((entry) => entry.waste_date >= start && entry.waste_date <= end);
      queueMicrotask(() => {
        setCurrency(preview.currency);
        setTotals({
          income: preview.cashflow.filter((entry) => entry.kind === "income").reduce((sum, entry) => sum + entry.amount, 0),
          essentials: preview.cashflow.filter((entry) => entry.kind === "essential").reduce((sum, entry) => sum + entry.amount, 0),
          debtPayments: preview.debts.reduce((sum, debt) => sum + debt.min_payment + (debt.extra_payment ?? 0), 0),
          spending: currentExpenses.reduce((sum, entry) => sum + entry.amount, 0),
          saved: currentSavings.reduce((sum, entry) => sum + entry.amount, 0),
          savedUnassigned: currentSavings.filter((entry) => !entry.allocation_type || entry.allocation_type === "unassigned").reduce((sum, entry) => sum + entry.amount, 0),
          savedMoved: currentSavings.filter((entry) => entry.allocation_complete).reduce((sum, entry) => sum + entry.amount, 0),
          wasted: currentWaste.reduce((sum, entry) => sum + entry.amount, 0),
        });
        setStatus("Saved in this browser");
        setLoaded(true);
      });
      return;
    }

    if (!supabase) {
      window.location.replace("/preview/month");
      return;
    }

    let active = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.replace("/login");
        return;
      }

      const [cashflow, debts, settings, expenses, savings, waste] = await Promise.all([
        supabase.from("cashflow_entries").select("kind,amount"),
        supabase.from("debts").select("min_payment,extra_payment"),
        supabase.from("user_settings").select("currency").maybeSingle(),
        supabase.from("expenses").select("amount").gte("expense_date", start).lte("expense_date", end),
        supabase.from("saving_entries").select("amount,allocation_type,allocation_complete").gte("saving_date", start).lte("saving_date", end),
        supabase.from("waste_entries").select("amount").gte("waste_date", start).lte("waste_date", end),
      ]);
      if (!active) return;

      const cashflowRows = cashflow.data ?? [];
      setCurrency(isCurrencyCode(settings.data?.currency) ? settings.data.currency : "GBP");
      const savingRows = (savings.data ?? []) as Array<{ amount: unknown; allocation_type: string; allocation_complete: boolean }>;
      setTotals({
        income: cashflowRows.filter((entry) => entry.kind === "income").reduce((sum, entry) => sum + Number(entry.amount), 0),
        essentials: cashflowRows.filter((entry) => entry.kind === "essential").reduce((sum, entry) => sum + Number(entry.amount), 0),
        debtPayments: (debts.data ?? []).reduce((sum, debt) => sum + Number(debt.min_payment) + Number(debt.extra_payment ?? 0), 0),
        spending: sumAmounts(expenses.data),
        saved: sumAmounts(savingRows),
        savedUnassigned: savingRows.filter((entry) => entry.allocation_type === "unassigned").reduce((sum, entry) => sum + Number(entry.amount), 0),
        savedMoved: savingRows.filter((entry) => entry.allocation_complete).reduce((sum, entry) => sum + Number(entry.amount), 0),
        wasted: sumAmounts(waste.data),
      });
      const hasError = [cashflow, debts, settings, expenses, savings, waste].some((result) => result.error);
      setStatus(hasError ? "Some figures couldn’t be loaded" : "All figures up to date");
      setLoaded(true);
    })();

    return () => { active = false; };
  }, [demo, end, start, supabase]);

  const plannedAfterCommitments = totals.income - totals.essentials - totals.debtPayments;
  const safeToSpend = plannedAfterCommitments - totals.spending;
  const dailyAmount = Math.max(0, safeToSpend) / daysLeft;
  const usedPercent = plannedAfterCommitments > 0 ? Math.min(100, Math.max(0, totals.spending / plannedAfterCommitments * 100)) : totals.spending > 0 ? 100 : 0;
  const base = demo ? "/preview" : "/app";

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

  if (!loaded) return <main className="grid min-h-screen place-items-center bg-paper"><p className="font-serif text-2xl">Preparing this month…</p></main>;

  return (
    <main className="min-h-screen bg-paper pb-20 text-center text-ink">
      <PlannerHeader demo={demo} active="month" currency={currency} onCurrencyChange={(next) => void changeCurrency(next)} status={status} />

      <div className="planner-content">
        <div className="flex items-center justify-center gap-2 text-sm font-semibold text-muted-ink"><CalendarDays className="size-4" /> {monthName}</div>
        <h1 className="mt-4 planner-title">This month</h1>

        <section className={`mx-auto mt-8 max-w-4xl border-y-4 bg-sheet px-6 py-10 ${safeToSpend >= 0 ? "border-positive" : "border-avalanche"}`}>
          <p className="text-sm font-semibold text-muted-ink">Safe to spend after your plan and recorded purchases</p>
          <p className={`mt-2 font-serif text-4xl tracking-[-.05em] sm:text-6xl ${safeToSpend >= 0 ? "text-ink" : "text-avalanche"}`}>{formatMoney(safeToSpend, currency)}</p>
          <p className="mx-auto mt-4 max-w-xl text-[17px] leading-7 text-muted-ink">
            {safeToSpend >= 0
              ? `${formatMoney(dailyAmount, currency)} per day for the remaining ${daysLeft} day${daysLeft === 1 ? "" : "s"} of this month.`
              : `You are ${formatMoney(Math.abs(safeToSpend), currency)} beyond the amount left after planned essentials and debt payments.`}
          </p>
          <div className="mx-auto mt-7 max-w-xl"><Progress value={usedPercent} className="h-2" /><div className="mt-2 flex justify-between text-sm text-muted-ink"><span>Recorded spending</span><span>{Math.round(usedPercent)}% of flexible money</span></div></div>
        </section>

        <section className="mt-10 border-y border-rule bg-sheet">
          <div className="grid divide-y divide-rule md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="p-7"><WalletCards className="mx-auto size-6 text-snowball" /><p className="mt-3 text-sm text-muted-ink">Monthly income</p><p className="mt-1 font-serif text-3xl">{formatMoney(totals.income, currency)}</p></div>
            <div className="p-7"><TrendingDown className="mx-auto size-6 text-avalanche" /><p className="mt-3 text-sm text-muted-ink">Planned commitments</p><p className="mt-1 font-serif text-3xl">{formatMoney(totals.essentials + totals.debtPayments, currency)}</p></div>
            <div className="p-7"><ReceiptText className="mx-auto size-6 text-ink" /><p className="mt-3 text-sm text-muted-ink">Recorded spending</p><p className="mt-1 font-serif text-3xl">{formatMoney(totals.spending, currency)}</p></div>
          </div>
          <dl className="mx-auto max-w-3xl divide-y divide-rule border-t border-rule px-5 text-base">
            <div className="flex justify-between gap-5 py-4"><dt>Essential spending plan</dt><dd className="font-semibold tabular-nums">− {formatMoney(totals.essentials, currency)}</dd></div>
            <div className="flex justify-between gap-5 py-4"><dt>Debt payments</dt><dd className="font-semibold tabular-nums">− {formatMoney(totals.debtPayments, currency)}</dd></div>
            <div className="flex justify-between gap-5 py-4"><dt>Flexible money before recorded purchases</dt><dd className="font-semibold tabular-nums">{formatMoney(plannedAfterCommitments, currency)}</dd></div>
          </dl>
        </section>

        <section className="mt-10 grid gap-5 md:grid-cols-2">
          <div className="border-t-4 border-positive bg-sheet p-7"><PiggyBank className="mx-auto size-7 text-positive" /><p className="mt-4 text-sm text-muted-ink">Everyday money saved</p><p className="mt-1 font-serif text-4xl">{formatMoney(totals.saved, currency)}</p><p className="mt-3 text-sm leading-6 text-muted-ink">{formatMoney(totals.savedUnassigned, currency)} ready to assign · {formatMoney(totals.savedMoved, currency)} marked as moved.</p></div>
          <div className="border-t-4 border-avalanche bg-sheet p-7"><ReceiptText className="mx-auto size-7 text-avalanche" /><p className="mt-4 text-sm text-muted-ink">Money marked as wasted</p><p className="mt-1 font-serif text-4xl">{formatMoney(totals.wasted, currency)}</p><p className="mt-3 text-sm leading-6 text-muted-ink">A reflection figure only. It is not subtracted again from safe-to-spend.</p></div>
        </section>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <a href={`${base}/income`} target="_top" className="inline-flex h-11 min-w-52 items-center justify-center gap-2 border border-ink px-5 font-semibold">Edit monthly plan <ArrowRight className="size-4" /></a>
          <a href={`${base}/spending`} target="_top" className="inline-flex h-11 min-w-52 items-center justify-center gap-2 bg-ink px-5 font-semibold text-paper">Add spending or savings <ArrowRight className="size-4" /></a>
        </div>
      </div>
    </main>
  );
}
