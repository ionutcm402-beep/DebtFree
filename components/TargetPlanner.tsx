"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarRange, Check, Snowflake, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlannerHeader } from "@/components/PlannerHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { previewCashflow, previewDebts, previewIncome } from "@/lib/demo-data";
import { DebtInput, paymentForTarget } from "@/lib/simulate";
import { createClient } from "@/lib/supabase/client";
import { CurrencyCode, formatMoney, isCurrencyCode } from "@/lib/currency";
import { loadPreviewState, savePreviewState } from "@/lib/preview-storage";

type IncomeSettings = Omit<typeof previewIncome, "currency"> & { currency: CurrencyCode };
const quickTerms = [...Array.from({ length: 13 }, (_, index) => index + 1), 18, 24, 36, 60, 120, 180, 240, 300, 360, 480, 600, 900, 1200];
const targetOptions = [
  ...Array.from({ length: 24 }, (_, index) => index + 1),
  ...Array.from({ length: 98 }, (_, index) => (index + 3) * 12),
];
const termLabel = (months: number) => months < 12 ? `${months} month${months === 1 ? "" : "s"}` : months % 12 === 0 ? `${months / 12} year${months === 12 ? "" : "s"}` : `${months} months`;

export function TargetPlanner({ demo = false }: { demo?: boolean }) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const supabase = useMemo(() => demo || !configured ? null : createClient(), [configured, demo]);
  const [debts, setDebts] = useState<DebtInput[]>(demo ? previewDebts : []);
  const [income, setIncome] = useState<IncomeSettings>(demo ? { ...previewIncome, monthly_income: previewCashflow.filter((entry) => entry.kind === "income").reduce((sum, entry) => sum + entry.amount, 0), housing_cost: previewCashflow.filter((entry) => entry.kind === "essential").reduce((sum, entry) => sum + entry.amount, 0), utilities_cost: 0, food_cost: 0, transport_cost: 0, other_essential_cost: 0 } : { currency: "GBP", monthly_income: 0, housing_cost: 0, utilities_cost: 0, food_cost: 0, transport_cost: 0, other_essential_cost: 0 });
  const [targetMonths, setTargetMonths] = useState(24);
  const [loaded, setLoaded] = useState(demo);

  useEffect(() => {
    if (demo) {
      const preview = loadPreviewState();
      const incomeTotal = preview.cashflow.filter((entry) => entry.kind === "income").reduce((sum, entry) => sum + entry.amount, 0);
      const essentialTotal = preview.cashflow.filter((entry) => entry.kind === "essential").reduce((sum, entry) => sum + entry.amount, 0);
      queueMicrotask(() => {
        setDebts(preview.debts);
        setIncome({ currency: preview.currency, monthly_income: incomeTotal, housing_cost: essentialTotal, utilities_cost: 0, food_cost: 0, transport_cost: 0, other_essential_cost: 0 });
      });
      return;
    }
    if (!supabase) {
      window.location.replace("/preview/target");
      return;
    }
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.replace("/login");
        return;
      }
      const [debtsResult, settingsResult, cashflowResult] = await Promise.all([
        supabase.from("debts").select("id,name,balance,apr,min_payment,extra_payment,start_date,account_type").order("created_at"),
        supabase.from("user_settings").select("currency").maybeSingle(),
        supabase.from("cashflow_entries").select("kind,amount"),
      ]);
      if (!active) return;
      if (!debtsResult.error) setDebts((debtsResult.data ?? []).map((debt) => ({ ...debt, balance: Number(debt.balance), apr: Number(debt.apr), min_payment: Number(debt.min_payment), extra_payment: Number(debt.extra_payment ?? 0) })));
      const row = settingsResult.data;
      const cashflow = cashflowResult.data ?? [];
      if (!settingsResult.error && !cashflowResult.error) setIncome({
        currency: isCurrencyCode(row?.currency) ? row.currency : "GBP",
        monthly_income: cashflow.filter((entry) => entry.kind === "income").reduce((sum, entry) => sum + Number(entry.amount), 0),
        housing_cost: cashflow.filter((entry) => entry.kind === "essential").reduce((sum, entry) => sum + Number(entry.amount), 0),
        utilities_cost: 0,
        food_cost: 0,
        transport_cost: 0,
        other_essential_cost: 0,
      });
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [demo, supabase]);

  const avalanche = useMemo(() => paymentForTarget(debts, targetMonths, "avalanche"), [debts, targetMonths]);
  const snowball = useMemo(() => paymentForTarget(debts, targetMonths, "snowball"), [debts, targetMonths]);
  const essentialTotal = income.housing_cost + income.utilities_cost + income.food_cost + income.transport_cost + income.other_essential_cost;
  const availableForDebt = Math.max(0, income.monthly_income - essentialTotal);

  async function changeCurrency(currency: CurrencyCode) {
    setIncome((current) => ({ ...current, currency }));
    if (demo) {
      savePreviewState({ currency });
      return;
    }
    if (!demo && supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await supabase.from("user_settings").upsert({ user_id: user.id, currency }, { onConflict: "user_id" });
    }
  }

  if (!loaded) return <main className="grid min-h-screen place-items-center bg-paper"><p className="font-serif text-2xl">Calculating your targets…</p></main>;

  return (
    <main className="min-h-screen bg-paper pb-20 text-ink">
      <PlannerHeader demo={demo} active="target" currency={income.currency} onCurrencyChange={(currency) => void changeCurrency(currency)} status={demo ? "Saved in this browser" : "Uses your saved debts"} />

      <div className="planner-content text-center">
        <a href={demo ? "/preview" : "/app"} target="_top" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-ink hover:text-ink"><ArrowLeft className="size-4" /> Back to debt plan</a>
        <section className="mt-8">
          <div className="mx-auto max-w-3xl">
            <h1 className="planner-title">Choose when to finish</h1>
            <p className="mt-3 text-[17px] leading-7 text-muted-ink">Pick any target from 1 month to 100 years. The planner works backwards from your balances and APRs to calculate the total amount you would need to pay each month.</p>
          </div>

          <div className="mt-8 border-y border-rule bg-sheet p-5 sm:p-7">
            <div className="flex flex-wrap items-end justify-center gap-12">
              <div><p className="text-sm font-semibold text-muted-ink">Debt-free target</p><p className="mt-1 font-serif text-4xl">{termLabel(targetMonths)}</p></div>
              <div>
                <label htmlFor="target-term" className="mb-2 block text-sm text-muted-ink">Monthly to 2 years, then yearly to 100</label>
                <Select value={String(targetMonths)} onValueChange={(value) => setTargetMonths(Number(value))}>
                  <SelectTrigger id="target-term" className="h-11 w-48 rounded-none bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{targetOptions.map((month) => <SelectItem key={month} value={String(month)}>{termLabel(month)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-2" aria-label="Quick payoff targets">
              {quickTerms.map((month) => <Button key={month} type="button" variant={targetMonths === month ? "default" : "outline"} size="sm" onClick={() => setTargetMonths(month)} className="rounded-none">{month <= 13 ? `${month}m` : termLabel(month)}</Button>)}
            </div>
          </div>
        </section>

        {debts.length === 0 ? (
          <section className="mt-8 border-y border-rule bg-sheet px-6 py-12 text-center"><CalendarRange className="mx-auto size-8 text-muted-ink" /><h2 className="mt-4 font-serif text-3xl">Add debts first</h2><p className="mt-2 text-muted-ink">The target calculator needs your balances, APRs and minimum payments.</p><a href={demo ? "/preview" : "/app"} target="_top" className="mt-6 inline-flex h-11 items-center justify-center bg-ink px-5 font-semibold text-paper">Go to debt ledger</a></section>
        ) : (
          <>
            <section className="mt-8 grid gap-px bg-rule md:grid-cols-2">
              {[
                { label: "Avalanche", description: "Highest APR first", result: avalanche, colour: "text-avalanche", border: "border-t-avalanche", icon: TrendingDown },
                { label: "Snowball", description: "Smallest balance first", result: snowball, colour: "text-snowball", border: "border-t-snowball", icon: Snowflake },
              ].map(({ label, description, result, colour, border, icon: Icon }) => {
                const difference = availableForDebt - result.totalMonthlyPayment;
                return (
                  <article key={label} className={`border-t-4 bg-sheet p-6 sm:p-8 ${border}`}>
                    <div className="flex items-center gap-3"><Icon className={`size-6 ${colour}`} /><div><h2 className={`font-serif text-3xl ${colour}`}>{label}</h2><p className="text-sm text-muted-ink">{description}</p></div></div>
                    <p className="mt-8 text-sm text-muted-ink">Pay this total each month</p>
                    <p className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">{formatMoney(result.totalMonthlyPayment, income.currency)}</p>
                    <dl className="mt-7 divide-y divide-rule border-y border-rule text-sm">
                      <div className="flex justify-between py-3"><dt>Extra above minimums</dt><dd>{formatMoney(result.extraPayment, income.currency)}</dd></div>
                      <div className="flex justify-between py-3"><dt>Estimated interest</dt><dd>{formatMoney(result.totalInterest, income.currency)}</dd></div>
                      <div className="flex justify-between py-3"><dt>Target</dt><dd>{termLabel(targetMonths)}</dd></div>
                    </dl>
                    {income.monthly_income > 0 ? <p className={`mt-5 border-l-2 pl-4 text-sm leading-6 ${difference >= 0 ? "border-positive text-positive" : "border-avalanche text-avalanche"}`}>{difference >= 0 ? <><Check className="mr-1 inline size-4" /> Fits your income with {formatMoney(difference, income.currency)} left.</> : <>This is {formatMoney(Math.abs(difference), income.currency)} more than your available monthly amount.</>}</p> : <p className="mt-5 border-l-2 border-rule pl-4 text-sm leading-6 text-muted-ink">Add your income to check whether this monthly payment fits.</p>}
                  </article>
                );
              })}
            </section>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-5 border-y border-rule py-5"><p className="text-sm text-muted-ink">Available from your income page: <strong className="text-ink">{formatMoney(availableForDebt, income.currency)} / month</strong></p><a href={demo ? "/preview/income" : "/app/income"} target="_top" className="font-semibold underline underline-offset-4">Update income and expenses</a></div>
          </>
        )}
      </div>
    </main>
  );
}
