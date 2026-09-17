"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarRange, Check, WalletCards } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PlannerHeader } from "@/components/PlannerHeader";
import { PageIntro } from "@/components/PageIntro";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CurrencyCode, currencyDetails, formatMoney, isCurrencyCode } from "@/lib/currency";
import { buildCashflowForecast, ForecastBill, ForecastCashflow, ForecastDebt, ForecastSettings, ForecastSubscription } from "@/lib/forecast";
import { loadPreviewState, savePreviewState } from "@/lib/preview-storage";
import { createClient } from "@/lib/supabase/client";

const eventLabels = { income: "Income", bill: "Bill", subscription: "Subscription", debt: "Debt" } as const;

function displayDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function CashflowForecast({ demo = false }: { demo?: boolean }) {
  const supabase = useMemo(() => demo ? null : createClient(), [demo]);
  const [userId, setUserId] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("GBP");
  const [cashflow, setCashflow] = useState<ForecastCashflow[]>([]);
  const [bills, setBills] = useState<ForecastBill[]>([]);
  const [subscriptions, setSubscriptions] = useState<ForecastSubscription[]>([]);
  const [debts, setDebts] = useState<ForecastDebt[]>([]);
  const [settings, setSettings] = useState<ForecastSettings>({ starting_balance: 0, horizon: 30, debt_payment_day: 28 });
  const [loaded, setLoaded] = useState(demo);
  const [status, setStatus] = useState(demo ? "Saved in this browser" : "All changes saved");
  const initial = useRef(true);

  useEffect(() => {
    if (demo) {
      const preview = loadPreviewState();
      queueMicrotask(() => {
        setCashflow(preview.cashflow);
        setBills(preview.bills.map(({ id, name, amount, due_day }) => ({ id, name, amount, due_day })));
        setSubscriptions(preview.subscriptions);
        setDebts(preview.debts.map((debt) => ({ id: debt.id, name: debt.name, min_payment: debt.min_payment, extra_payment: debt.extra_payment })));
        setSettings(preview.forecastSettings);
        setCurrency(preview.currency);
        initial.current = false;
      });
      return;
    }
    if (!supabase) { window.location.replace("/preview/forecast"); return; }
    let active = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.replace("/login"); return; }
      const [cashflowResult, billResult, subscriptionResult, debtResult, settingsResult] = await Promise.all([
        supabase.from("cashflow_entries").select("id,kind,name,amount,pay_day").order("created_at"),
        supabase.from("bills").select("id,name,amount,due_day").order("due_day"),
        supabase.from("subscriptions").select("id,name,amount,billing_cycle,renewal_date,decision").order("renewal_date"),
        supabase.from("debts").select("id,name,min_payment,extra_payment").order("created_at"),
        supabase.from("user_settings").select("currency,forecast_starting_balance,forecast_horizon,debt_payment_day").maybeSingle(),
      ]);
      if (!active) return;
      setUserId(user.id);
      const hasError = [cashflowResult, billResult, subscriptionResult, debtResult, settingsResult].some((result) => result.error);
      if (hasError) {
        setStatus("Couldn’t load the forecast — run the latest database schema");
      } else {
        setCashflow((cashflowResult.data ?? []).map((entry) => ({ ...entry, kind: entry.kind as ForecastCashflow["kind"], amount: Number(entry.amount), pay_day: Number(entry.pay_day ?? 1) })));
        setBills((billResult.data ?? []).map((bill) => ({ ...bill, amount: Number(bill.amount), due_day: Number(bill.due_day) })));
        setSubscriptions((subscriptionResult.data ?? []).map((item) => ({ ...item, amount: Number(item.amount) })) as ForecastSubscription[]);
        setDebts((debtResult.data ?? []).map((debt) => ({ ...debt, min_payment: Number(debt.min_payment), extra_payment: Number(debt.extra_payment ?? 0) })));
        setSettings({
          starting_balance: Number(settingsResult.data?.forecast_starting_balance ?? 0),
          horizon: ([30, 60, 90].includes(Number(settingsResult.data?.forecast_horizon)) ? Number(settingsResult.data?.forecast_horizon) : 30) as ForecastSettings["horizon"],
          debt_payment_day: Number(settingsResult.data?.debt_payment_day ?? 28),
        });
        setCurrency(isCurrencyCode(settingsResult.data?.currency) ? settingsResult.data.currency : "GBP");
      }
      setLoaded(true);
      queueMicrotask(() => { initial.current = false; });
    })();
    return () => { active = false; };
  }, [demo, supabase]);

  useEffect(() => {
    if (demo || !supabase || !loaded || !userId || initial.current) return;
    setStatus("Saving…");
    const timeout = window.setTimeout(async () => {
      const rows = cashflow.map((entry) => ({ ...entry, user_id: userId }));
      const results = await Promise.all([
        rows.length ? supabase.from("cashflow_entries").upsert(rows, { onConflict: "id" }) : Promise.resolve({ error: null }),
        supabase.from("user_settings").upsert({ user_id: userId, currency, forecast_starting_balance: settings.starting_balance, forecast_horizon: settings.horizon, debt_payment_day: settings.debt_payment_day }, { onConflict: "user_id" }),
      ]);
      setStatus(results.some((result) => result.error) ? "Couldn’t save changes" : "All changes saved");
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [cashflow, currency, demo, loaded, settings, supabase, userId]);

  function persistCashflow(next: ForecastCashflow[]) {
    setCashflow(next);
    if (demo) savePreviewState({ cashflow: next });
  }

  function updateIncome(id: string, field: "name" | "amount" | "pay_day", value: string) {
    const next = cashflow.map((entry) => {
      if (entry.id !== id) return entry;
      if (field === "amount") return { ...entry, amount: Math.max(0, Number(value)) };
      if (field === "pay_day") return { ...entry, pay_day: Math.min(31, Math.max(1, Number(value))) };
      return { ...entry, name: value };
    });
    persistCashflow(next);
  }

  function updateSettings(next: ForecastSettings) {
    setSettings(next);
    if (demo) savePreviewState({ forecastSettings: next });
  }

  const forecast = useMemo(() => buildCashflowForecast({ cashflow, bills, subscriptions, debts, settings }), [bills, cashflow, debts, settings, subscriptions]);
  const incomes = cashflow.filter((entry) => entry.kind === "income");
  const nextIncomeText = forecast.nextIncome ? `${displayDate(forecast.nextIncome.date)} · ${forecast.nextIncome.name}` : "No payday in this range";
  const eventTone = (amount: number) => amount >= 0 ? "text-positive" : "text-ink";

  if (!loaded) return <main className="grid min-h-screen place-items-center bg-paper"><p className="font-serif text-2xl">Building your forecast…</p></main>;

  return (
    <main className="min-h-screen bg-paper pb-20 text-center text-ink">
      <PlannerHeader demo={demo} active="forecast" currency={currency} onCurrencyChange={(next) => { setCurrency(next); if (demo) savePreviewState({ currency: next }); }} status={status} />
      <div className="planner-content">
        <PageIntro icon={CalendarRange} title="Payday cash-flow forecast" description="See whether your money lasts until payday before deciding what is genuinely safe to spend." />

        <section className="mt-9 grid border-y border-rule bg-sheet md:grid-cols-3 md:divide-x md:divide-rule">
          <label className="p-6"><span className="text-sm font-semibold text-muted-ink">Available balance today</span><div className="mx-auto mt-2 flex max-w-52 items-center justify-center"><span className="mr-2 text-muted-ink">{currencyDetails(currency).symbol}</span><Input aria-label="Available balance today" type="number" step="0.01" value={settings.starting_balance} onChange={(event) => updateSettings({ ...settings, starting_balance: Number(event.target.value) })} className="rounded-none bg-white text-center tabular-nums" /></div></label>
          <label className="border-t border-rule p-6 md:border-t-0"><span className="text-sm font-semibold text-muted-ink">Forecast length</span><Select value={String(settings.horizon)} onValueChange={(value) => updateSettings({ ...settings, horizon: Number(value) as ForecastSettings["horizon"] })}><SelectTrigger aria-label="Forecast length" className="mx-auto mt-2 w-52 rounded-none bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">30 days</SelectItem><SelectItem value="60">60 days</SelectItem><SelectItem value="90">90 days</SelectItem></SelectContent></Select></label>
          <label className="border-t border-rule p-6 md:border-t-0"><span className="text-sm font-semibold text-muted-ink">Debt payment day</span><Input aria-label="Debt payment day" type="number" min="1" max="31" value={settings.debt_payment_day} onChange={(event) => updateSettings({ ...settings, debt_payment_day: Math.min(31, Math.max(1, Number(event.target.value))) })} className="mx-auto mt-2 w-52 rounded-none bg-white text-center tabular-nums" /></label>
        </section>

        <section className="mt-8 border-y border-rule bg-sheet">
          <div className="border-b border-rule px-5 py-4"><h2 className="font-serif text-2xl">Your paydays</h2><p className="mt-1 text-sm text-muted-ink">Day 31 automatically becomes the last day in shorter months.</p></div>
          <div className="divide-y divide-rule">
            {incomes.map((income) => <div key={income.id} className="grid items-center gap-3 px-5 py-4 sm:grid-cols-[1fr_13rem_8rem]">
              <Input aria-label="Income name" value={income.name} onChange={(event) => updateIncome(income.id, "name", event.target.value)} className="rounded-none bg-white text-center" />
              <div className="flex items-center justify-center"><span className="mr-2 text-muted-ink">{currencyDetails(currency).symbol}</span><Input aria-label={`${income.name} monthly amount`} type="number" min="0" step="0.01" value={income.amount} onChange={(event) => updateIncome(income.id, "amount", event.target.value)} className="rounded-none bg-white text-center tabular-nums" /></div>
              <Input aria-label={`${income.name} payday`} type="number" min="1" max="31" value={income.pay_day} onChange={(event) => updateIncome(income.id, "pay_day", event.target.value)} className="rounded-none bg-white text-center tabular-nums" />
            </div>)}
            {!incomes.length && <p className="px-5 py-8 text-muted-ink">Add an income source on the Income page to calculate your next payday.</p>}
          </div>
          <a href={demo ? "/preview/income" : "/app/income"} target="_top" className="flex h-11 w-full items-center justify-center border-t border-rule px-5 font-semibold hover:bg-muted">Open income page</a>
        </section>

        <section className="mt-9 grid border-y border-rule bg-sheet sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-rule">
          <div className="p-7"><p className="text-sm text-muted-ink">Safe before next payday</p><p className="mt-1 font-serif text-4xl text-positive">{formatMoney(forecast.safeUntilPayday, currency)}</p><p className="mt-2 text-sm text-muted-ink">{nextIncomeText}</p></div>
          <div className="border-t border-rule p-7 sm:border-l sm:border-t-0 lg:border-l-0"><p className="text-sm text-muted-ink">Safe spending per week</p><p className="mt-1 font-serif text-4xl">{formatMoney(forecast.safePerWeek, currency)}</p><p className="mt-2 text-sm text-muted-ink">Until the next income</p></div>
          <div className="border-t border-rule p-7 lg:border-t-0"><p className="text-sm text-muted-ink">Lowest projected balance</p><p className={`mt-1 font-serif text-4xl ${forecast.lowestPoint.balance < 0 ? "text-avalanche" : "text-snowball"}`}>{formatMoney(forecast.lowestPoint.balance, currency)}</p><p className="mt-2 text-sm text-muted-ink">{displayDate(forecast.lowestPoint.date)}</p></div>
          <div className="border-t border-rule p-7 sm:border-l lg:border-l-0 lg:border-t-0"><p className="text-sm text-muted-ink">Unscheduled essentials</p><p className="mt-1 font-serif text-4xl">{formatMoney(forecast.dailyReserve, currency)}</p><p className="mt-2 text-sm text-muted-ink">Reserved each day</p></div>
        </section>

        {forecast.firstNegative ? <div className="mx-auto mt-7 flex max-w-3xl items-center justify-center gap-3 border-y border-avalanche bg-sheet px-5 py-4 text-avalanche"><AlertTriangle className="size-5 shrink-0" /><p className="font-semibold">Your projected balance goes below zero on {displayDate(forecast.firstNegative.date)}. Reduce spending, move a payment date, or lower an extra debt payment.</p></div> : <div className="mx-auto mt-7 flex max-w-3xl items-center justify-center gap-3 border-y border-positive bg-sheet px-5 py-4 text-positive"><Check className="size-5 shrink-0" /><p className="font-semibold">Your balance stays above zero throughout this forecast.</p></div>}

        <section className="mt-10 border-t border-rule py-10">
          <div className="mb-6"><WalletCards className="mx-auto size-6 text-snowball" /><h2 className="mt-3 font-serif text-3xl">Projected account balance</h2><p className="mt-1 text-sm text-muted-ink">Income raises the line; scheduled payments and the daily essential reserve lower it.</p></div>
          <div className="h-[360px] min-w-0 border-y border-rule bg-sheet px-2 py-6 sm:px-6">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 312 }}>
              <LineChart data={forecast.points} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid stroke="#dbe0dc" vertical={false} />
                <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={36} tickLine={false} axisLine={false} tick={{ fill: "#66706b", fontSize: 12 }} />
                <YAxis tickFormatter={(value) => `${currencyDetails(currency).symbol}${Math.round(Number(value))}`} tickLine={false} axisLine={false} width={66} tick={{ fill: "#66706b", fontSize: 12 }} />
                <Tooltip formatter={(value) => formatMoney(Number(value), currency)} labelFormatter={(_, payload) => payload?.[0]?.payload?.date ? displayDate(payload[0].payload.date) : ""} contentStyle={{ borderRadius: 0, borderColor: "#cfd7d1", background: "#fbfbf7" }} />
                <ReferenceLine y={0} stroke="#d86532" strokeDasharray="6 5" />
                <Line type="monotone" dataKey="balance" name="Projected balance" stroke="#287da8" strokeWidth={4} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="mt-2 overflow-x-auto border-y border-rule bg-sheet">
          <div className="border-b border-rule px-5 py-5"><h2 className="font-serif text-3xl">Upcoming money events</h2><p className="mt-1 text-sm text-muted-ink">The first 20 scheduled entries in this forecast.</p></div>
          <Table className="min-w-[760px]"><TableHeader><TableRow className="hover:bg-transparent [&_th]:text-center"><TableHead>Date</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader><TableBody>
            {forecast.events.slice(0, 20).map((event) => <TableRow key={event.id}><TableCell>{displayDate(event.date)}</TableCell><TableCell className="font-semibold">{event.name}</TableCell><TableCell>{eventLabels[event.kind]}</TableCell><TableCell className={`font-semibold tabular-nums ${eventTone(event.amount)}`}>{event.amount >= 0 ? "+ " : "− "}{formatMoney(Math.abs(event.amount), currency)}</TableCell></TableRow>)}
            {!forecast.events.length && <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-ink">Add income, bills, subscriptions or debts to create scheduled events.</TableCell></TableRow>}
          </TableBody></Table>
        </section>
        <p className="mx-auto mt-5 max-w-3xl text-sm leading-6 text-muted-ink">Bills and subscriptions are not counted twice. If they are already included in your essential-spending plan, the forecast subtracts them before spreading the remaining essentials across each day. This is a planning estimate, not your bank’s live balance.</p>
      </div>
    </main>
  );
}
