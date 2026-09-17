"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Calculator, Check, LogOut, Plus, Trash2 } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import { previewDebts } from "@/lib/demo-data";
import { DebtInput, debtFreeDate, estimateApr, simulatePayoff } from "@/lib/simulate";
import { PlannerHeader } from "@/components/PlannerHeader";
import { currencyDetails, CurrencyCode, formatMoney, isCurrencyCode } from "@/lib/currency";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createId } from "@/lib/id";
import { loadPreviewState, savePreviewState } from "@/lib/preview-storage";

type SaveState = "saved" | "saving" | "error";
const debtTypes = ["Credit card", "Personal loan", "Mortgage", "Overdraft", "Car finance", "Student loan", "Buy now, pay later", "Tax debt", "Medical debt", "Business loan", "Family loan", "Other debt"];
const today = () => new Date().toISOString().slice(0, 10);
const finishDate = (start: string | undefined, months: number | undefined) => {
  if (!months) return "—";
  const date = new Date(`${start || today()}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  date.setMonth(date.getMonth() + months);
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(date);
};
export function Planner({ demo = false }: { demo?: boolean }) {
  const router = useRouter();
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const supabase = useMemo(() => demo || !supabaseConfigured ? null : createClient(), [demo, supabaseConfigured]);
  const [userId, setUserId] = useState(demo ? "preview" : "");
  const [email, setEmail] = useState(demo ? "Preview" : "");
  const [debts, setDebts] = useState<DebtInput[]>(demo ? previewDebts : []);
  const [extraPayment, setExtraPayment] = useState(0);
  const [currency, setCurrency] = useState<CurrencyCode>("GBP");
  const [loaded, setLoaded] = useState(demo);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [aprDebtId, setAprDebtId] = useState<string | null>(null);
  const [aprValues, setAprValues] = useState({ balance: "", payment: "", months: "" });
  const initialLoad = useRef(true);
  const debtsRef = useRef<DebtInput[]>([]);
  const extraPaymentRef = useRef(0);

  useEffect(() => {
    debtsRef.current = debts;
    extraPaymentRef.current = extraPayment;
  }, [debts, extraPayment]);

  useEffect(() => {
    if (demo) {
      const preview = loadPreviewState();
      queueMicrotask(() => {
        setDebts(preview.debts);
        setCurrency(preview.currency);
        initialLoad.current = false;
      });
      return;
    }
    if (!supabase) {
      window.location.replace("/preview");
      return;
    }
    let active = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/login");
          return;
        }
        const [debtResult, settingsResult] = await Promise.all([
          supabase.from("debts").select("id,name,balance,apr,min_payment,extra_payment,start_date,account_type").order("created_at"),
          supabase.from("user_settings").select("extra_payment,currency").maybeSingle(),
        ]);
        if (debtResult.error) throw debtResult.error;
        if (settingsResult.error) throw settingsResult.error;
        if (!active) return;
        setUserId(user.id);
        setEmail(user.email ?? "");
        setDebts((debtResult.data ?? []).map((debt) => ({ ...debt, balance: Number(debt.balance), apr: Number(debt.apr), min_payment: Number(debt.min_payment), extra_payment: Number(debt.extra_payment ?? 0), start_date: debt.start_date ?? today(), account_type: debt.account_type ?? "Other debt" })));
        setExtraPayment(0);
        setCurrency(isCurrencyCode(settingsResult.data?.currency) ? settingsResult.data.currency : "GBP");
        setLoaded(true);
        queueMicrotask(() => { initialLoad.current = false; });
      } catch {
        if (active) setSaveState("error");
      }
    })();
    return () => { active = false; };
  }, [demo, router, supabase]);

  useEffect(() => {
    if (demo || !supabase || !loaded || !userId || initialLoad.current) return;
    setSaveState("saving");
    const timeout = window.setTimeout(async () => {
      const payload = debts.map((debt) => ({ ...debt, user_id: userId }));
      const results = await Promise.all([
        payload.length ? supabase.from("debts").upsert(payload, { onConflict: "id" }) : Promise.resolve({ error: null }),
        supabase.from("user_settings").upsert({ user_id: userId, extra_payment: 0, currency }, { onConflict: "user_id" }),
      ]);
      setSaveState(results.some((result) => result.error) ? "error" : "saved");
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [currency, debts, demo, extraPayment, loaded, supabase, userId]);

  useEffect(() => {
    if (!loaded || !document.modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    const register = document.modelContext.registerTool.bind(document.modelContext);
    const validatePlan = (input: unknown) => {
      if (!input || typeof input !== "object") throw new Error("A plan object is required.");
      const value = input as { debts?: unknown; extraPayment?: unknown };
      if (!Array.isArray(value.debts) || typeof value.extraPayment !== "number" || value.extraPayment < 0) throw new Error("Provide a debts array and a non-negative extraPayment.");
      const nextDebts = value.debts.map((item, index) => {
        if (!item || typeof item !== "object") throw new Error(`Debt ${index + 1} is invalid.`);
        const debt = item as Record<string, unknown>;
        if (typeof debt.name !== "string" || !debt.name.trim() || ["balance", "apr", "min_payment"].some((key) => typeof debt[key] !== "number" || Number(debt[key]) < 0)) throw new Error(`Debt ${index + 1} has invalid fields.`);
        return { id: createId(), name: debt.name.trim(), balance: Number(debt.balance), apr: Number(debt.apr), min_payment: Number(debt.min_payment), extra_payment: typeof debt.extra_payment === "number" ? Math.max(0, debt.extra_payment) : 0, start_date: today(), account_type: "Other debt" };
      });
      if (value.extraPayment > 0 && nextDebts[0]) nextDebts[0].extra_payment = (nextDebts[0].extra_payment ?? 0) + value.extraPayment;
      return { debts: nextDebts, extraPayment: 0 };
    };

    void Promise.all([
      register({
        name: "read_payoff_summary",
        title: "Read payoff summary",
        description: "Read the current debt totals and calculated avalanche and snowball results without changing the plan.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute() {
          const currentDebts = debtsRef.current;
          const currentExtra = extraPaymentRef.current;
          const a = simulatePayoff(currentDebts, currentExtra, "avalanche");
          const s = simulatePayoff(currentDebts, currentExtra, "snowball");
          return { debtCount: currentDebts.length, totalBalance: currentDebts.reduce((sum, debt) => sum + debt.balance, 0), extraPayment: currentDebts.reduce((sum, debt) => sum + (debt.extra_payment ?? 0), 0), avalanche: { months: a.months, totalInterest: a.totalInterest, completed: a.completed }, snowball: { months: s.months, totalInterest: s.totalInterest, completed: s.completed } };
        },
      }, { signal: lifecycle.signal }),
      register({
        name: "replace_debt_plan",
        title: "Replace debt plan",
        description: "Replace the signed-in user's visible debt ledger and monthly extra payment, then save and recalculate the plan.",
        inputSchema: {
          type: "object",
          properties: {
            debts: { type: "array", items: { type: "object", properties: { name: { type: "string" }, balance: { type: "number", minimum: 0 }, apr: { type: "number", minimum: 0 }, min_payment: { type: "number", minimum: 0 }, extra_payment: { type: "number", minimum: 0 } }, required: ["name", "balance", "apr", "min_payment"], additionalProperties: false } },
            extraPayment: { type: "number", minimum: 0 },
          },
          required: ["debts", "extraPayment"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(input: unknown) {
          const plan = validatePlan(input);
          if (supabase && !demo) {
            const payload = plan.debts.map((debt) => ({ ...debt, user_id: userId }));
            const deletion = await supabase.from("debts").delete().eq("user_id", userId);
            if (deletion.error) throw deletion.error;
            if (payload.length) {
              const insertion = await supabase.from("debts").insert(payload);
              if (insertion.error) throw insertion.error;
            }
            const settings = await supabase.from("user_settings").upsert({ user_id: userId, extra_payment: plan.extraPayment }, { onConflict: "user_id" });
            if (settings.error) throw settings.error;
          }
          setDebts(plan.debts);
          setExtraPayment(plan.extraPayment);
          if (demo) savePreviewState({ debts: plan.debts });
          const a = simulatePayoff(plan.debts, plan.extraPayment, "avalanche");
          const s = simulatePayoff(plan.debts, plan.extraPayment, "snowball");
          return { updated: true, debtCount: plan.debts.length, avalancheMonths: a.months, snowballMonths: s.months };
        },
      }, { signal: lifecycle.signal }),
    ]).catch(() => undefined);
    return () => lifecycle.abort();
  }, [demo, loaded, supabase, userId]);

  const avalanche = useMemo(() => simulatePayoff(debts, 0, "avalanche"), [debts]);
  const snowball = useMemo(() => simulatePayoff(debts, 0, "snowball"), [debts]);
  const minimums = useMemo(() => simulatePayoff(debts.map((debt) => ({ ...debt, extra_payment: 0 })), 0, "avalanche"), [debts]);
  const warningIds = new Set(avalanche.warningDebtIds);
  const totalBalance = debts.reduce((sum, debt) => sum + Math.max(0, debt.balance), 0);
  const minimumTotal = debts.reduce((sum, debt) => sum + Math.max(0, debt.min_payment) + Math.max(0, debt.extra_payment ?? 0), 0);

  const chartData = useMemo(() => {
    const length = Math.max(minimums.balances.length, avalanche.balances.length, snowball.balances.length);
    return Array.from({ length }, (_, month) => ({
      month,
      minimums: minimums.balances[month]?.balance ?? null,
      avalanche: avalanche.balances[month]?.balance ?? null,
      snowball: snowball.balances[month]?.balance ?? null,
    }));
  }, [minimums, avalanche, snowball]);

  const winnerText = useMemo(() => {
    if (!avalanche.completed || !snowball.completed) return "One or more debts remain after the 50-year simulation limit. Increase a minimum or add an extra payment.";
    const interestDiff = Math.abs(avalanche.totalInterest - snowball.totalInterest);
    const monthDiff = Math.abs(avalanche.months - snowball.months);
    if (interestDiff < 0.01 && monthDiff === 0) return "Both methods give the same result because they prioritise your debts in the same order.";
    const winner = avalanche.totalInterest <= snowball.totalInterest ? "Avalanche" : "Snowball";
    return `${winner} saves ${formatMoney(interestDiff, currency)} in interest${monthDiff ? ` and finishes ${monthDiff} month${monthDiff === 1 ? "" : "s"} sooner` : ", although both finish in the same month"}.`;
  }, [avalanche, currency, snowball]);

  function updateDebt(id: string, field: keyof DebtInput, value: string) {
    const textFields: Array<keyof DebtInput> = ["name", "start_date", "account_type"];
    const next = debts.map((debt) => debt.id === id ? { ...debt, [field]: textFields.includes(field) ? value : Math.max(0, Number(value)) } : debt);
    setDebts(next);
    if (demo) savePreviewState({ debts: next });
  }

  function addDebt() {
    const next = [...debts, { id: createId(), name: "New debt", balance: 0, apr: 0, min_payment: 0, extra_payment: 0, start_date: today(), account_type: "Credit card" }];
    setDebts(next);
    if (demo) savePreviewState({ debts: next });
  }

  async function removeDebt() {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    const next = debts.filter((debt) => debt.id !== id);
    setDebts(next);
    if (demo) savePreviewState({ debts: next });
    if (supabase && !demo) {
      const { error } = await supabase.from("debts").delete().eq("id", id);
      if (error) setSaveState("error");
    }
  }

  function openAprEstimator(debt: DebtInput) {
    setAprDebtId(debt.id);
    setAprValues({ balance: String(debt.balance || ""), payment: String(debt.min_payment || ""), months: "" });
  }

  const estimatedApr = estimateApr(Number(aprValues.balance), Number(aprValues.payment), Number(aprValues.months));

  function applyApr() {
    if (aprDebtId && estimatedApr !== null) updateDebt(aprDebtId, "apr", estimatedApr.toFixed(2));
    setAprDebtId(null);
  }

  function changeCurrency(nextCurrency: CurrencyCode) {
    setCurrency(nextCurrency);
    if (demo) savePreviewState({ currency: nextCurrency });
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    window.location.assign("/login");
  }

  if (!loaded) return <main className="grid min-h-screen place-items-center bg-paper text-ink"><p className="font-serif text-2xl">Loading your ledger…</p></main>;

  const preferred = avalanche.completed && (!snowball.completed || avalanche.totalInterest <= snowball.totalInterest) ? avalanche : snowball;

  return (
    <main className="min-h-screen bg-paper pb-20 text-ink">
      <PlannerHeader
        demo={demo}
        active="plan"
        currency={currency}
        onCurrencyChange={changeCurrency}
        status={demo ? "Saved in this browser" : saveState === "saving" ? "Saving…" : saveState === "error" ? "Couldn’t save changes" : "All changes saved"}
        action={demo
          ? <a href="/login" target="_top" className="inline-flex h-11 items-center justify-center gap-2 px-4 text-sm font-semibold text-ink underline underline-offset-4"><LogOut className="size-4" /> Log in to account</a>
          : <Button variant="ghost" size="sm" onClick={signOut}><LogOut /> Log out<span className="sr-only"> {email}</span></Button>}
      />

      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        {demo && <div className="mt-5 flex flex-wrap items-center justify-center gap-3 border-l-2 border-snowball bg-sheet px-4 py-3 text-center text-sm"><span>Your preview changes are saved on this browser.</span><a href="/login" target="_top" className="font-semibold underline underline-offset-4">Already registered? Log in</a><a href="/signup" target="_top" className="font-semibold underline underline-offset-4">Create a new account</a></div>}
        <section className="border-b border-rule py-10 text-center md:py-14">
          <div className="mx-auto max-w-4xl">
            <p className="text-sm text-muted-ink">Your estimated debt-free date</p>
            <h1 className="mt-2 font-serif text-5xl leading-none tracking-[-.04em] sm:text-6xl">{debts.length ? debtFreeDate(preferred.months, preferred.completed) : "Add your first debt"}</h1>
            <p className="mt-5 text-[17px] leading-7 text-muted-ink">{debts.length ? `${formatMoney(totalBalance, currency, false)} across ${debts.length} debt${debts.length === 1 ? "" : "s"}, with ${formatMoney(minimumTotal, currency, false)} going out each month.` : "Your payoff date, interest cost, and route to zero will appear here."}</p>
          </div>
        </section>

        <section className="py-10">
          <div className="mb-5 text-center">
            <div><h2 className="font-serif text-3xl tracking-tight">Debt ledger</h2><p className="mt-1 text-sm text-muted-ink">Edit any figure directly. Changes save automatically.</p></div>
          </div>
          <div className="grid gap-px border-b border-rule bg-rule text-center sm:grid-cols-3">
            <div className="bg-paper px-4 py-4"><p className="font-semibold">Balance</p><p className="mt-1 text-sm leading-6 text-muted-ink">The amount you owe today.</p></div>
            <div className="bg-paper px-4 py-4"><p className="font-semibold">APR</p><p className="mt-1 text-sm leading-6 text-muted-ink">Annual Percentage Rate — the interest rate for one year. The planner divides it by 12 for monthly calculations.</p></div>
            <div className="bg-paper px-4 py-4"><p className="font-semibold">Minimum / month</p><p className="mt-1 text-sm leading-6 text-muted-ink">The smallest payment your lender requires each month.</p></div>
          </div>
          <div className="border-y border-rule bg-sheet">
            {debts.length === 0 ? (
              <button type="button" onClick={addDebt} className="flex w-full flex-col items-center px-5 py-14 text-center hover:bg-muted/40"><Plus className="mb-3 size-7 text-muted-ink" /><span className="font-serif text-2xl">Add your first debt</span><span className="mt-2 text-sm text-muted-ink">You only need the name, balance, APR and minimum payment.</span></button>
            ) : (
              <Table>
                <TableHeader><TableRow className="hover:bg-transparent [&_th]:text-center"><TableHead className="min-w-44">Type</TableHead><TableHead className="min-w-44">Debt name</TableHead><TableHead className="min-w-36">Balance<span className="block text-xs font-normal text-muted-ink">{currencyDetails(currency).symbol} owed today</span></TableHead><TableHead className="min-w-28">APR<span className="block text-xs font-normal text-muted-ink">% per year</span></TableHead><TableHead className="min-w-36">Minimum / month</TableHead><TableHead className="min-w-36">Extra / month</TableHead><TableHead className="min-w-40">Start date</TableHead><TableHead className="min-w-36">Est. finish<span className="block text-xs font-normal text-muted-ink">lower-cost plan</span></TableHead><TableHead className="w-16"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
                <TableBody>
                  {debts.map((debt) => (
                    <TableRow key={debt.id} className={`[&_td]:text-center ${warningIds.has(debt.id) ? "bg-[#fff4ed]" : ""}`}>
                      <TableCell><Select value={debt.account_type ?? "Other debt"} onValueChange={(value) => updateDebt(debt.id, "account_type", value)}><SelectTrigger aria-label={`${debt.name} type`} className="rounded-none bg-white"><SelectValue /></SelectTrigger><SelectContent>{debtTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></TableCell>
                      <TableCell><Input aria-label="Debt name" value={debt.name} onChange={(e) => updateDebt(debt.id, "name", e.target.value)} className="rounded-none bg-white text-center" /></TableCell>
                      <TableCell><div className="flex items-center"><span className="mr-1 text-muted-ink">{currencyDetails(currency).symbol}</span><Input aria-label={`${debt.name} balance`} type="number" min="0" step="0.01" value={debt.balance} onChange={(e) => updateDebt(debt.id, "balance", e.target.value)} className="rounded-none bg-white text-center tabular-nums" /></div></TableCell>
                      <TableCell><div className="flex items-center gap-1"><Input aria-label={`${debt.name} APR`} type="number" min="0" step="0.01" value={Number(debt.apr.toFixed(2))} onChange={(e) => updateDebt(debt.id, "apr", e.target.value)} className="rounded-none bg-white text-center tabular-nums" /><span className="text-muted-ink">%</span><Button variant="ghost" size="icon-sm" onClick={() => openAprEstimator(debt)} title="Estimate APR"><Calculator /></Button></div></TableCell>
                      <TableCell><div className="flex items-center"><span className="mr-1 text-muted-ink">{currencyDetails(currency).symbol}</span><Input aria-label={`${debt.name} minimum payment`} type="number" min="0" step="0.01" value={debt.min_payment} onChange={(e) => updateDebt(debt.id, "min_payment", e.target.value)} className="rounded-none bg-white text-center tabular-nums" /></div></TableCell>
                      <TableCell><div className="flex items-center"><span className="mr-1 text-muted-ink">{currencyDetails(currency).symbol}</span><Input aria-label={`${debt.name} extra payment`} type="number" min="0" step="0.01" value={debt.extra_payment ?? 0} onChange={(e) => updateDebt(debt.id, "extra_payment", e.target.value)} className="rounded-none bg-white text-center tabular-nums" /></div></TableCell>
                      <TableCell><Input aria-label={`${debt.name} start date`} type="date" value={debt.start_date ?? today()} onChange={(e) => updateDebt(debt.id, "start_date", e.target.value)} className="rounded-none bg-white text-center" /></TableCell>
                      <TableCell className="font-semibold">{finishDate(debt.start_date, preferred.payoffMonthByDebt[debt.id])}</TableCell>
                      <TableCell><Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(debt.id)} title={`Delete ${debt.name}`}><Trash2 /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {debts.length > 0 && <button type="button" onClick={addDebt} className="action-row-button"><Plus className="size-4" /> Add another debt</button>}
          </div>
          <p className="mt-4 text-center text-sm text-muted-ink">Extra amounts are pooled, then avalanche or snowball decides which active debt receives them first.</p>
          {warningIds.size > 0 && <div className="mt-4 flex items-start justify-center gap-3 border-l-2 border-avalanche pl-4 text-sm leading-6 text-muted-ink"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-avalanche" /><p>{warningIds.size === 1 ? "One debt’s" : `${warningIds.size} debts’`} minimum payment does not cover its current monthly interest.</p></div>}
        </section>

        {debts.length > 0 && <>
          <section className="border-t border-rule py-10 text-center">
            <h2 className="font-serif text-3xl tracking-tight">Two routes to zero</h2>
            <p className="mt-1 text-sm text-muted-ink">{winnerText}</p>
            <div className="mx-auto mt-5 max-w-2xl border-y border-rule bg-sheet px-5 py-4">
              <p className="text-sm text-muted-ink">Interest difference between the two methods</p>
              <p className="mt-1 font-serif text-4xl">{formatMoney(Math.abs(avalanche.totalInterest - snowball.totalInterest), currency)}</p>
              <p className="mt-1 text-sm text-muted-ink">{Math.abs(avalanche.totalInterest - snowball.totalInterest) < 0.01 ? "No difference for the current debt order." : `${avalanche.totalInterest <= snowball.totalInterest ? "Avalanche" : "Snowball"} costs less.`}</p>
            </div>
            <div className="mt-6 grid gap-px bg-rule md:grid-cols-2">
              {[
                { label: "Avalanche", description: "Highest APR first", result: avalanche, colour: "text-avalanche", border: "border-t-avalanche" },
                { label: "Snowball", description: "Smallest balance first", result: snowball, colour: "text-snowball", border: "border-t-snowball" },
              ].map(({ label, description, result, colour, border }) => (
                <article key={label} className={`border-t-4 bg-sheet p-6 sm:p-8 ${border}`}>
                  <div className="flex flex-col items-center"><h3 className={`font-serif text-3xl ${colour}`}>{label}</h3><p className="mt-1 text-sm text-muted-ink">{description}</p>{preferred.method === result.method && result.completed && <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-positive"><Check className="size-3.5" /> Lower cost</span>}</div>
                  <dl className="mt-8 grid grid-cols-2 gap-6 border-t border-rule pt-6">
                    <div><dt className="text-sm text-muted-ink">Debt-free in</dt><dd className="mt-1 font-serif text-3xl">{result.completed ? `${result.months} months` : "50+ years"}</dd></div>
                    <div><dt className="text-sm text-muted-ink">Total interest</dt><dd className="mt-1 font-serif text-3xl">{result.completed ? formatMoney(result.totalInterest, currency) : "Not repaid"}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <section className="border-t border-rule py-10 text-center">
            <div className="mb-6"><h2 className="font-serif text-3xl tracking-tight">Balance over time</h2><p className="mt-1 text-sm text-muted-ink">How the total balance changes month by month.</p></div>
            <div className="h-[360px] min-w-0 border-y border-rule bg-sheet px-2 py-6 sm:px-6">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 312 }}>
                <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                  <CartesianGrid stroke="#dbe0dc" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#66706b", fontSize: 12 }} label={{ value: "Months", position: "insideBottomRight", offset: -2, fill: "#66706b" }} />
                  <YAxis tickFormatter={(value) => `${currencyDetails(currency).symbol}${Math.round(value / 1000)}k`} tickLine={false} axisLine={false} width={58} tick={{ fill: "#66706b", fontSize: 12 }} />
                  <Tooltip formatter={(value) => formatMoney(Number(value), currency)} labelFormatter={(label) => `Month ${label}`} contentStyle={{ borderRadius: 0, borderColor: "#cfd7d1", background: "#fbfbf7" }} />
                  <Legend verticalAlign="top" height={36} />
                  <Line type="monotone" dataKey="minimums" name="Minimums only" stroke="#59635e" strokeWidth={3} strokeDasharray="10 7" dot={false} connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="avalanche" name="Avalanche" stroke="#d86532" strokeWidth={4} dot={false} connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="snowball" name="Snowball" stroke="#287da8" strokeWidth={4} strokeDasharray="2 7" strokeLinecap="round" dot={false} connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-4 text-sm text-muted-ink">Grey dashed = minimums only · orange solid = avalanche · blue dotted = snowball. If two plans overlap, the dots and gaps let you see both.</p>
          </section>
        </>}
      </div>

      <Dialog open={Boolean(aprDebtId)} onOpenChange={(open) => !open && setAprDebtId(null)}>
        <DialogContent className="rounded-none border-t-4 border-t-snowball bg-sheet">
          <DialogHeader><DialogTitle className="font-serif text-3xl">Estimate the APR</DialogTitle><DialogDescription>Use the balance, monthly payment and number of months shown on your agreement.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-3">
            <div className="space-y-2"><Label htmlFor="apr-balance">Balance ({currencyDetails(currency).symbol})</Label><Input id="apr-balance" type="number" min="0" value={aprValues.balance} onChange={(e) => setAprValues({ ...aprValues, balance: e.target.value })} className="rounded-none bg-white" /></div>
            <div className="space-y-2"><Label htmlFor="apr-payment">Monthly payment ({currencyDetails(currency).symbol})</Label><Input id="apr-payment" type="number" min="0" value={aprValues.payment} onChange={(e) => setAprValues({ ...aprValues, payment: e.target.value })} className="rounded-none bg-white" /></div>
            <div className="space-y-2"><Label htmlFor="apr-months">Months remaining</Label><Input id="apr-months" type="number" min="1" step="1" value={aprValues.months} onChange={(e) => setAprValues({ ...aprValues, months: e.target.value })} className="rounded-none bg-white" /></div>
            <div className="border-y border-rule py-4"><p className="text-sm text-muted-ink">Estimated APR</p><p className="mt-1 font-serif text-4xl">{estimatedApr === null ? "—" : `${estimatedApr.toFixed(2)}%`}</p>{estimatedApr === null && aprValues.months && <p className="mt-2 text-sm text-destructive">These figures do not produce a non-negative interest rate.</p>}</div>
          </div>
          <DialogFooter><Button variant="outline" className="rounded-none" onClick={() => setAprDebtId(null)}>Cancel</Button><Button className="rounded-none" onClick={applyApr} disabled={estimatedApr === null}>Apply to debt</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="rounded-none bg-sheet"><AlertDialogHeader><AlertDialogTitle className="font-serif text-2xl">Delete this debt?</AlertDialogTitle><AlertDialogDescription>This removes it from your saved ledger and recalculates both plans.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="rounded-none">Keep it</AlertDialogCancel><AlertDialogAction onClick={removeDebt} className="rounded-none bg-destructive text-white hover:bg-destructive/90">Delete debt</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
