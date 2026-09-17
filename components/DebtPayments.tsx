"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Landmark, Plus, Trash2 } from "lucide-react";
import { PlannerHeader } from "@/components/PlannerHeader";
import { PageIntro } from "@/components/PageIntro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CurrencyCode, currencyDetails, formatMoney, isCurrencyCode } from "@/lib/currency";
import { createId } from "@/lib/id";
import { loadPreviewState, PreviewDebtPayment, savePreviewState } from "@/lib/preview-storage";
import { DebtInput } from "@/lib/simulate";
import { createClient } from "@/lib/supabase/client";

type DebtPayment = PreviewDebtPayment;
type PaymentDraft = { debt_id: string; payment_date: string; amount: number; note: string; reduce_balance: boolean };

function dateValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function monthValue() {
  return dateValue().slice(0, 7);
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function DebtPayments({ demo = false }: { demo?: boolean }) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const supabase = useMemo(() => demo || !configured ? null : createClient(), [configured, demo]);
  const [userId, setUserId] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("GBP");
  const [debts, setDebts] = useState<DebtInput[]>([]);
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [month, setMonth] = useState(monthValue);
  const [loaded, setLoaded] = useState(demo);
  const [status, setStatus] = useState(demo ? "Saved in this browser" : "All changes saved");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<PaymentDraft>({ debt_id: "", payment_date: dateValue(), amount: 0, note: "", reduce_balance: true });

  useEffect(() => {
    if (demo) {
      const preview = loadPreviewState();
      queueMicrotask(() => {
        setDebts(preview.debts);
        setPayments(preview.debtPayments);
        setCurrency(preview.currency);
      });
      return;
    }
    if (!supabase) { window.location.replace("/preview/payments"); return; }
    let active = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.replace("/login"); return; }
      const [debtResult, paymentResult, settingsResult] = await Promise.all([
        supabase.from("debts").select("id,name,balance,apr,min_payment,extra_payment,start_date,account_type").order("created_at"),
        supabase.from("debt_payments").select("id,debt_id,payment_date,amount,note").order("payment_date", { ascending: false }),
        supabase.from("user_settings").select("currency").maybeSingle(),
      ]);
      if (!active) return;
      setUserId(user.id);
      setCurrency(isCurrencyCode(settingsResult.data?.currency) ? settingsResult.data.currency : "GBP");
      if (debtResult.error || paymentResult.error || settingsResult.error) {
        setStatus("Couldn’t load payments — run the latest database schema");
      } else {
        setDebts((debtResult.data ?? []).map((debt) => ({
          ...debt,
          balance: Number(debt.balance),
          apr: Number(debt.apr),
          min_payment: Number(debt.min_payment),
          extra_payment: Number(debt.extra_payment),
        })));
        setPayments((paymentResult.data ?? []).map((payment) => ({ ...payment, amount: Number(payment.amount) })));
      }
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [demo, supabase]);

  const selectedDebtId = draft.debt_id || debts.find((debt) => debt.balance > 0)?.id || debts[0]?.id || "";
  const selectedDebt = debts.find((debt) => debt.id === selectedDebtId);
  const monthPayments = useMemo(() => payments.filter((payment) => payment.payment_date.startsWith(month)), [month, payments]);
  const actualTotal = monthPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const plannedTotal = debts.filter((debt) => debt.balance > 0).reduce((sum, debt) => sum + debt.min_payment + (debt.extra_payment ?? 0), 0);
  const planDifference = actualTotal - plannedTotal;
  const totalBalance = debts.reduce((sum, debt) => sum + debt.balance, 0);

  async function changeCurrency(next: CurrencyCode) {
    setCurrency(next);
    if (demo) {
      savePreviewState({ currency: next });
      return;
    }
    if (!supabase || !userId) return;
    const { error } = await supabase.from("user_settings").upsert({ user_id: userId, currency: next }, { onConflict: "user_id" });
    setStatus(error ? "Couldn’t save currency" : "All changes saved");
  }

  async function addPayment() {
    setMessage("");
    if (!selectedDebt || draft.amount <= 0) {
      setMessage("Choose a debt and enter a payment greater than zero.");
      return;
    }
    const payment: DebtPayment = {
      id: createId(),
      debt_id: selectedDebt.id,
      payment_date: draft.payment_date,
      amount: Math.round(draft.amount * 100) / 100,
      note: draft.note.trim(),
    };
    const nextPayments = [payment, ...payments];
    const nextBalance = Math.max(0, Math.round((selectedDebt.balance - payment.amount) * 100) / 100);
    const nextDebts = draft.reduce_balance
      ? debts.map((debt) => debt.id === selectedDebt.id ? { ...debt, balance: nextBalance } : debt)
      : debts;

    if (demo) {
      setPayments(nextPayments);
      setDebts(nextDebts);
      savePreviewState({ debtPayments: nextPayments, debts: nextDebts });
      setDraft({ debt_id: selectedDebt.id, payment_date: dateValue(), amount: 0, note: "", reduce_balance: true });
      setMessage(`Payment recorded${draft.reduce_balance ? " and balance updated" : ""}.`);
      return;
    }

    if (!supabase || !userId) return;
    setStatus("Saving…");
    const { error: paymentError } = await supabase.from("debt_payments").insert({ ...payment, user_id: userId });
    if (paymentError) {
      setStatus("Couldn’t save payment");
      setMessage("The payment was not saved. Run the latest database schema and try again.");
      return;
    }
    setPayments(nextPayments);
    if (draft.reduce_balance) {
      const { error: debtError } = await supabase.from("debts").update({ balance: nextBalance }).eq("id", selectedDebt.id).eq("user_id", userId);
      if (debtError) {
        setStatus("Payment saved; balance not updated");
        setMessage("The payment is in your history, but update the current balance on the Debt plan page.");
        return;
      }
      setDebts(nextDebts);
    }
    setStatus("All changes saved");
    setDraft({ debt_id: selectedDebt.id, payment_date: dateValue(), amount: 0, note: "", reduce_balance: true });
    setMessage(`Payment recorded${draft.reduce_balance ? " and balance updated" : ""}.`);
  }

  async function removePayment(id: string) {
    const next = payments.filter((payment) => payment.id !== id);
    setPayments(next);
    if (demo) {
      savePreviewState({ debtPayments: next });
      return;
    }
    if (!supabase) return;
    setStatus("Saving…");
    const { error } = await supabase.from("debt_payments").delete().eq("id", id);
    setStatus(error ? "Couldn’t delete payment" : "All changes saved");
  }

  if (!loaded) return <main className="grid min-h-screen place-items-center bg-paper"><p className="font-serif text-2xl">Loading your payments…</p></main>;

  return (
    <main className="min-h-screen bg-paper pb-20 text-center text-ink">
      <PlannerHeader demo={demo} active="payments" currency={currency} onCurrencyChange={(next) => void changeCurrency(next)} status={status} />

      <div className="planner-content">
        <PageIntro icon={Landmark} title="Payment tracker" description="Record what you really paid, compare it with this month’s plan, and keep every debt balance current." tone="text-avalanche" />

        <div className="mx-auto mt-7 w-full max-w-xs">
          <label className="text-sm font-semibold">Month<Input aria-label="Payment month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-2 h-11 rounded-none bg-white text-center" /></label>
        </div>

        <section className="mt-9 grid border-y border-rule bg-sheet sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-rule">
          <div className="p-7"><p className="text-sm text-muted-ink">Planned for {monthLabel(month)}</p><p className="mt-1 font-serif text-4xl">{formatMoney(plannedTotal, currency)}</p></div>
          <div className="border-t border-rule p-7 sm:border-l sm:border-t-0"><p className="text-sm text-muted-ink">Actually paid</p><p className="mt-1 font-serif text-4xl text-positive">{formatMoney(actualTotal, currency)}</p></div>
          <div className="border-t border-rule p-7 lg:border-t-0"><p className="text-sm text-muted-ink">{planDifference >= 0 ? "Ahead of plan" : "Still to reach plan"}</p><p className={`mt-1 font-serif text-4xl ${planDifference >= 0 ? "text-positive" : "text-avalanche"}`}>{formatMoney(Math.abs(planDifference), currency)}</p></div>
          <div className="border-t border-rule p-7 sm:border-l lg:border-t-0"><p className="text-sm text-muted-ink">Current debt balance</p><p className="mt-1 font-serif text-4xl">{formatMoney(totalBalance, currency)}</p></div>
        </section>

        <section className="mt-9 border-y border-rule bg-sheet p-6 md:p-8">
          <h2 className="font-serif text-3xl">Record a payment</h2>
          <p className="mt-2 text-sm text-muted-ink">The balance option subtracts the payment from the current balance used by your payoff plan.</p>
          {debts.length ? (
            <>
              <div className="mt-6 grid items-end gap-4 md:grid-cols-2 xl:grid-cols-[1.3fr_.8fr_.8fr_1.3fr]">
                <label className="text-sm font-semibold">Debt<Select value={selectedDebtId} onValueChange={(value) => setDraft({ ...draft, debt_id: value })}><SelectTrigger className="mt-2 h-11 w-full rounded-none bg-white"><SelectValue /></SelectTrigger><SelectContent>{debts.map((debt) => <SelectItem key={debt.id} value={debt.id}>{debt.name} · {formatMoney(debt.balance, currency)}</SelectItem>)}</SelectContent></Select></label>
                <label className="text-sm font-semibold">Payment date<Input type="date" value={draft.payment_date} onChange={(event) => setDraft({ ...draft, payment_date: event.target.value })} className="mt-2 h-11 rounded-none bg-white text-center" /></label>
                <label className="text-sm font-semibold">Amount<div className="mt-2 flex h-11 items-center border border-input bg-white px-3"><span className="mr-2 text-muted-ink">{currencyDetails(currency).symbol}</span><Input aria-label="Payment amount" type="number" min="0.01" step="0.01" value={draft.amount || ""} onChange={(event) => setDraft({ ...draft, amount: Math.max(0, Number(event.target.value)) })} placeholder="0.00" className="h-9 border-0 bg-transparent text-center tabular-nums shadow-none focus-visible:ring-0" /></div></label>
                <label className="text-sm font-semibold">Note<Input value={draft.note} maxLength={240} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Optional" className="mt-2 h-11 rounded-none bg-white text-center" /></label>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
                <label className="flex h-11 items-center gap-3 border border-rule bg-paper px-4 text-sm font-semibold"><Switch checked={draft.reduce_balance} onCheckedChange={(checked) => setDraft({ ...draft, reduce_balance: checked })} />Apply to current balance</label>
                <Button onClick={() => void addPayment()} className="h-11 min-w-48 rounded-none"><Plus /> Record payment</Button>
              </div>
              {message && <p role="status" className="mt-4 text-sm font-semibold text-muted-ink">{message}</p>}
            </>
          ) : (
            <div className="mx-auto mt-6 max-w-xl border-y border-rule py-7">
              <CircleAlert className="mx-auto size-6 text-avalanche" />
              <p className="mt-3">Add a debt on the Debt plan page before recording a payment.</p>
            </div>
          )}
        </section>

        <section className="mt-9 overflow-x-auto border-y border-rule bg-sheet">
          <div className="px-6 pt-7"><h2 className="font-serif text-3xl">{monthLabel(month)} by debt</h2><p className="mt-2 text-sm text-muted-ink">Planned amounts include each minimum and its extra monthly payment.</p></div>
          <Table className="mt-5 min-w-[850px]">
            <TableHeader><TableRow className="hover:bg-transparent [&_th]:text-center"><TableHead>Debt</TableHead><TableHead>Planned</TableHead><TableHead>Paid</TableHead><TableHead>Difference</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {debts.map((debt) => {
                const planned = debt.balance > 0 ? debt.min_payment + (debt.extra_payment ?? 0) : 0;
                const paid = monthPayments.filter((payment) => payment.debt_id === debt.id).reduce((sum, payment) => sum + payment.amount, 0);
                const difference = paid - planned;
                return <TableRow key={debt.id}>
                  <TableCell><p className="font-semibold">{debt.name}</p><p className="mt-1 text-xs text-muted-ink">{formatMoney(debt.balance, currency)} balance</p></TableCell>
                  <TableCell className="tabular-nums">{formatMoney(planned, currency)}</TableCell>
                  <TableCell className="font-semibold tabular-nums">{formatMoney(paid, currency)}</TableCell>
                  <TableCell className={`font-semibold tabular-nums ${difference >= 0 ? "text-positive" : "text-avalanche"}`}>{difference >= 0 ? "+" : "−"}{formatMoney(Math.abs(difference), currency)}</TableCell>
                  <TableCell>{paid >= planned ? <span className="inline-flex items-center gap-2 font-semibold text-positive"><CheckCircle2 className="size-4" /> On plan</span> : <span className="font-semibold text-avalanche">Payment remaining</span>}</TableCell>
                </TableRow>;
              })}
              {!debts.length && <TableRow><TableCell colSpan={5} className="py-10 text-muted-ink">No debts to compare yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </section>

        <section className="mt-9 overflow-x-auto border-y border-rule bg-sheet">
          <div className="px-6 pt-7"><h2 className="font-serif text-3xl">Payment history</h2><p className="mt-2 text-sm text-muted-ink">Deleting a history row does not change the current debt balance.</p></div>
          <Table className="mt-5 min-w-[850px]">
            <TableHeader><TableRow className="hover:bg-transparent [&_th]:text-center"><TableHead>Date</TableHead><TableHead>Debt</TableHead><TableHead>Note</TableHead><TableHead>Amount</TableHead><TableHead className="w-20"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {monthPayments.map((payment) => <TableRow key={payment.id}>
                <TableCell>{new Date(`${payment.payment_date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</TableCell>
                <TableCell className="font-semibold">{debts.find((debt) => debt.id === payment.debt_id)?.name ?? "Deleted debt"}</TableCell>
                <TableCell className="text-muted-ink">{payment.note || "—"}</TableCell>
                <TableCell className="font-semibold tabular-nums text-positive">{formatMoney(payment.amount, currency)}</TableCell>
                <TableCell><Button variant="ghost" size="icon" className="size-11" onClick={() => void removePayment(payment.id)} title="Delete payment"><Trash2 /></Button></TableCell>
              </TableRow>)}
              {!monthPayments.length && <TableRow><TableCell colSpan={5} className="py-10 text-muted-ink">No payments recorded for this month.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </section>
      </div>
    </main>
  );
}
