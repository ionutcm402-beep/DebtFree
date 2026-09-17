"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Plus, Trash2, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlannerHeader } from "@/components/PlannerHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CurrencyCode, currencyDetails, formatMoney, isCurrencyCode } from "@/lib/currency";
import { previewCashflow, previewDebts } from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/client";
import { createId } from "@/lib/id";
import { loadPreviewState, savePreviewState } from "@/lib/preview-storage";
import { WorkIncomeCalendar } from "@/components/WorkIncomeCalendar";
import type { UkPayEstimate } from "@/lib/uk-pay";

type CashflowEntry = { id: string; kind: "income" | "essential"; name: string; amount: number; pay_day: number };
const emptyWorkEstimate: UkPayEstimate = { hours: 0, holidayHours: 0, holidayPay: 0, wages: 0, directTips: 0, payrollTips: 0, otherIncome: 0, payrollExtras: 0, gross: 0, pension: 0, incomeTax: 0, nationalInsurance: 0, takeHome: 0, annualEquivalent: 0 };

export function IncomePlanner({ demo = false }: { demo?: boolean }) {
  const supabase = useMemo(() => demo ? null : createClient(), [demo]);
  const [userId, setUserId] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("GBP");
  const [entries, setEntries] = useState<CashflowEntry[]>(demo ? previewCashflow : []);
  const [debtPayment, setDebtPayment] = useState(demo ? previewDebts.reduce((sum, debt) => sum + debt.min_payment + (debt.extra_payment ?? 0), 0) : 0);
  const [trackedSpend, setTrackedSpend] = useState(0);
  const [workEstimate, setWorkEstimate] = useState<UkPayEstimate>(emptyWorkEstimate);
  const [loaded, setLoaded] = useState(demo);
  const [status, setStatus] = useState(demo ? "Saved in this browser" : "All changes saved");
  const initial = useRef(true);

  useEffect(() => {
    if (demo) {
      const preview = loadPreviewState();
      queueMicrotask(() => {
        setEntries(preview.cashflow);
        setDebtPayment(preview.debts.reduce((sum, debt) => sum + debt.min_payment + (debt.extra_payment ?? 0), 0));
        const month = new Date().toISOString().slice(0, 7);
        setTrackedSpend(preview.expenses.filter((expense) => expense.expense_date.startsWith(month)).reduce((sum, expense) => sum + expense.amount, 0));
        setCurrency(preview.currency);
        initial.current = false;
      });
      return;
    }
    if (!supabase) { window.location.replace("/preview/income"); return; }
    let active = true;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { window.location.replace("/login"); return; }
      const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
      const [cashflowResult, debtsResult, settingsResult, expenseResult] = await Promise.all([
        supabase.from("cashflow_entries").select("id,kind,name,amount,pay_day").order("created_at"),
        supabase.from("debts").select("min_payment,extra_payment"),
        supabase.from("user_settings").select("currency").maybeSingle(),
        supabase.from("expenses").select("amount").gte("expense_date", monthStart),
      ]);
      if (!active) return;
      if (cashflowResult.error || debtsResult.error || settingsResult.error || expenseResult.error) { setStatus("Couldn’t load income"); setLoaded(true); return; }
      setUserId(user.id);
      setEntries((cashflowResult.data ?? []).map((entry) => ({ ...entry, kind: entry.kind as CashflowEntry["kind"], amount: Number(entry.amount), pay_day: Number(entry.pay_day ?? 1) })));
      setDebtPayment((debtsResult.data ?? []).reduce((sum, debt) => sum + Number(debt.min_payment) + Number(debt.extra_payment ?? 0), 0));
      setTrackedSpend((expenseResult.data ?? []).reduce((sum, expense) => sum + Number(expense.amount), 0));
      setCurrency(isCurrencyCode(settingsResult.data?.currency) ? settingsResult.data.currency : "GBP");
      setLoaded(true);
      queueMicrotask(() => { initial.current = false; });
    })();
    return () => { active = false; };
  }, [demo, supabase]);

  useEffect(() => {
    if (demo || !supabase || !loaded || !userId || initial.current) return;
    setStatus("Saving…");
    const timeout = window.setTimeout(async () => {
      const rows = entries.map((entry) => ({ ...entry, user_id: userId }));
      const results = await Promise.all([
        rows.length ? supabase.from("cashflow_entries").upsert(rows, { onConflict: "id" }) : Promise.resolve({ error: null }),
        supabase.from("user_settings").upsert({ user_id: userId, currency }, { onConflict: "user_id" }),
      ]);
      setStatus(results.some((result) => result.error) ? "Couldn’t save changes" : "All changes saved");
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [currency, demo, entries, loaded, supabase, userId]);

  function addEntry(kind: CashflowEntry["kind"]) {
    const next = [...entries, { id: createId(), kind, name: kind === "income" ? "New income" : "New essential expense", amount: 0, pay_day: 1 }];
    setEntries(next);
    if (demo) savePreviewState({ cashflow: next });
  }

  function updateEntry(id: string, field: "name" | "amount" | "pay_day", value: string) {
    const next = entries.map((entry) => entry.id === id ? { ...entry, [field]: field === "amount" ? Math.max(0, Number(value)) : field === "pay_day" ? Math.min(31, Math.max(1, Number(value))) : value } : entry);
    setEntries(next);
    if (demo) savePreviewState({ cashflow: next });
  }

  async function removeEntry(id: string) {
    const next = entries.filter((entry) => entry.id !== id);
    setEntries(next);
    if (demo) savePreviewState({ cashflow: next });
    if (supabase && !demo) await supabase.from("cashflow_entries").delete().eq("id", id);
  }

  const incomes = entries.filter((entry) => entry.kind === "income");
  const essentials = entries.filter((entry) => entry.kind === "essential");
  const otherIncomeTotal = incomes.reduce((sum, entry) => sum + entry.amount, 0);
  const incomeTotal = otherIncomeTotal + workEstimate.takeHome;
  const essentialTotal = essentials.reduce((sum, entry) => sum + entry.amount, 0);
  const availableForDebt = Math.max(0, incomeTotal - essentialTotal);
  const difference = availableForDebt - debtPayment;

  if (!loaded) return <main className="grid min-h-screen place-items-center bg-paper"><p className="font-serif text-2xl">Loading your income…</p></main>;

  const ledger = (kind: CashflowEntry["kind"], rows: CashflowEntry[]) => (
    <div className="border-y border-rule bg-sheet">
      <Table><TableHeader><TableRow className="hover:bg-transparent [&_th]:text-center"><TableHead>Name</TableHead><TableHead className="w-56">Amount / month</TableHead>{kind === "income" && <TableHead className="w-32">Payday</TableHead>}<TableHead className="w-16"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>
        {rows.map((entry) => <TableRow key={entry.id}><TableCell><Input aria-label={`${kind} name`} value={entry.name} onChange={(event) => updateEntry(entry.id, "name", event.target.value)} className="rounded-none bg-white text-center" /></TableCell><TableCell><div className="flex items-center justify-center"><span className="mr-2 text-muted-ink">{currencyDetails(currency).symbol}</span><Input aria-label={`${entry.name} monthly amount`} type="number" min="0" step="0.01" value={entry.amount} onChange={(event) => updateEntry(entry.id, "amount", event.target.value)} className="rounded-none bg-white text-center tabular-nums" /></div></TableCell>{kind === "income" && <TableCell><Input aria-label={`${entry.name} payday`} type="number" min="1" max="31" value={entry.pay_day} onChange={(event) => updateEntry(entry.id, "pay_day", event.target.value)} className="rounded-none bg-white text-center tabular-nums" /></TableCell>}<TableCell><Button variant="ghost" size="icon-sm" onClick={() => void removeEntry(entry.id)} title={`Delete ${entry.name}`}><Trash2 /></Button></TableCell></TableRow>)}
      </TableBody></Table>
      <button type="button" onClick={() => addEntry(kind)} className="action-row-button"><Plus className="size-4" /> Add {kind === "income" ? "another income" : "essential spending"}</button>
    </div>
  );

  return (
    <main className="min-h-screen bg-paper pb-20 text-center text-ink">
      <PlannerHeader demo={demo} active="income" currency={currency} onCurrencyChange={(nextCurrency) => { setCurrency(nextCurrency); if (demo) savePreviewState({ currency: nextCurrency }); }} status={status} />
      <div className="planner-content">
        <a href={demo ? "/preview" : "/app"} target="_top" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-ink hover:text-ink"><ArrowLeft className="size-4" /> Back to debt plan</a>
        <h1 className="mt-8 planner-title">Income forecast</h1>
        <p className="mx-auto mt-3 max-w-2xl text-[17px] leading-7 text-muted-ink">Record each shift, see your expected take-home pay, then compare it with your monthly commitments.</p>
        <div className="mt-10"><WorkIncomeCalendar demo={demo} onForecastChange={setWorkEstimate} onStatusChange={setStatus} /></div>
        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_.72fr]">
          <section className="space-y-10"><div><h2 className="mb-2 font-serif text-3xl">Other monthly income</h2><p className="mx-auto mb-5 max-w-xl text-sm leading-6 text-muted-ink">Add regular income not already recorded in the work calendar. Do not enter your wages twice.</p>{ledger("income", incomes)}</div><div><h2 className="mb-5 font-serif text-3xl">Essential spending</h2>{ledger("essential", essentials)}</div></section>
          <aside className="lg:sticky lg:top-8 lg:self-start"><div className="border-y border-ink bg-sheet p-6"><WalletCards className="mx-auto size-7 text-snowball" /><p className="mt-6 text-sm text-muted-ink">Available for debt each month</p><p className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">{formatMoney(availableForDebt, currency)}</p><dl className="mt-7 divide-y divide-rule border-y border-rule text-sm"><div className="flex justify-between py-3"><dt>Shift take-home forecast</dt><dd>{formatMoney(workEstimate.takeHome, currency)}</dd></div><div className="flex justify-between py-3"><dt>Other monthly income</dt><dd>{formatMoney(otherIncomeTotal, currency)}</dd></div><div className="flex justify-between py-3"><dt>Total income</dt><dd>{formatMoney(incomeTotal, currency)}</dd></div><div className="flex justify-between py-3"><dt>Essential spending plan</dt><dd>− {formatMoney(essentialTotal, currency)}</dd></div><div className="flex justify-between py-3"><dt>Tracked this month</dt><dd>{formatMoney(trackedSpend, currency)}</dd></div><div className="flex justify-between py-3"><dt>Debt payments</dt><dd>− {formatMoney(debtPayment, currency)}</dd></div></dl><div className={`mt-5 border-l-2 pl-4 text-sm leading-6 ${difference >= 0 ? "border-positive text-positive" : "border-avalanche text-avalanche"}`}>{difference >= 0 ? <><Check className="mr-1 inline size-4" /> Your plan leaves {formatMoney(difference, currency)} each month.</> : <>Your debt plan is {formatMoney(Math.abs(difference), currency)} above the amount available.</>}</div><a href={demo ? "/preview/spending" : "/app/spending"} target="_top" className="mt-7 inline-flex h-11 w-full items-center justify-center border border-ink px-5 font-semibold text-ink">Open spending tracker</a><a href={demo ? "/preview/target" : "/app/target"} target="_top" className="mt-3 inline-flex h-11 w-full items-center justify-center bg-ink px-5 font-semibold text-paper">Choose a payoff target</a></div></aside>
        </div>
      </div>
    </main>
  );
}
