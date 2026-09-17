"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Check, CircleAlert, Plus, Trash2 } from "lucide-react";
import { PlannerHeader } from "@/components/PlannerHeader";
import { PageIntro } from "@/components/PageIntro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CurrencyCode, currencyDetails, formatMoney, isCurrencyCode } from "@/lib/currency";
import { createId } from "@/lib/id";
import { loadPreviewState, PreviewBill, savePreviewState } from "@/lib/preview-storage";
import { createClient } from "@/lib/supabase/client";

type Bill = PreviewBill;
const categories = ["Housing", "Utilities", "Phone & internet", "Insurance", "Transport", "Childcare", "Subscriptions", "Tax", "Other"];
const currentMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

function dueDateFor(day: number, date = new Date()) {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return new Date(date.getFullYear(), date.getMonth(), Math.min(day, lastDay), 12);
}

function billStatus(bill: Bill, today = new Date()) {
  if (bill.last_paid_month === currentMonth()) return { label: "Paid", tone: "text-positive", rank: 4 };
  const due = dueDateFor(bill.due_day, today);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const days = Math.round((due.getTime() - start.getTime()) / 86_400_000);
  if (days < 0) return { label: `${Math.abs(days)} day${days === -1 ? "" : "s"} overdue`, tone: "text-avalanche", rank: 0 };
  if (days === 0) return { label: "Due today", tone: "text-avalanche", rank: 1 };
  if (days <= 7) return { label: `Due in ${days} day${days === 1 ? "" : "s"}`, tone: "text-snowball", rank: 2 };
  return { label: `Due ${due.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`, tone: "text-muted-ink", rank: 3 };
}

export function BillCalendar({ demo = false }: { demo?: boolean }) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const supabase = useMemo(() => demo || !configured ? null : createClient(), [configured, demo]);
  const [userId, setUserId] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("GBP");
  const [bills, setBills] = useState<Bill[]>([]);
  const [loaded, setLoaded] = useState(demo);
  const [status, setStatus] = useState(demo ? "Saved in this browser" : "All changes saved");
  const initial = useRef(true);
  const month = currentMonth();

  useEffect(() => {
    if (demo) {
      const preview = loadPreviewState();
      queueMicrotask(() => {
        setBills(preview.bills);
        setCurrency(preview.currency);
        initial.current = false;
      });
      return;
    }
    if (!supabase) { window.location.replace("/preview/bills"); return; }
    let active = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.replace("/login"); return; }
      const [billResult, settingsResult] = await Promise.all([
        supabase.from("bills").select("id,name,amount,due_day,category,autopay,last_paid_month").order("due_day"),
        supabase.from("user_settings").select("currency").maybeSingle(),
      ]);
      if (!active) return;
      setUserId(user.id);
      setCurrency(isCurrencyCode(settingsResult.data?.currency) ? settingsResult.data.currency : "GBP");
      if (billResult.error || settingsResult.error) {
        setStatus("Couldn’t load bills");
      } else {
        setBills((billResult.data ?? []).map((bill) => ({ ...bill, amount: Number(bill.amount), due_day: Number(bill.due_day) })));
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
      const rows = bills.map((bill) => ({ ...bill, user_id: userId }));
      const results = await Promise.all([
        rows.length ? supabase.from("bills").upsert(rows, { onConflict: "id" }) : Promise.resolve({ error: null }),
        supabase.from("user_settings").upsert({ user_id: userId, currency }, { onConflict: "user_id" }),
      ]);
      setStatus(results.some((result) => result.error) ? "Couldn’t save changes" : "All changes saved");
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [bills, currency, demo, loaded, supabase, userId]);

  function persist(next: Bill[]) {
    setBills(next);
    if (demo) savePreviewState({ bills: next });
  }

  function addBill() {
    persist([...bills, { id: createId(), name: "New bill", amount: 0, due_day: 1, category: "Other", autopay: false, last_paid_month: null }]);
  }

  function updateBill(id: string, field: keyof Bill, value: string | boolean | null) {
    const next = bills.map((bill) => {
      if (bill.id !== id) return bill;
      if (field === "amount") return { ...bill, amount: Math.max(0, Number(value)) };
      if (field === "due_day") return { ...bill, due_day: Math.min(31, Math.max(1, Number(value))) };
      return { ...bill, [field]: value };
    });
    persist(next);
  }

  async function removeBill(id: string) {
    persist(bills.filter((bill) => bill.id !== id));
    if (supabase && !demo) {
      const { error } = await supabase.from("bills").delete().eq("id", id);
      if (error) setStatus("Couldn’t delete bill");
    }
  }

  const sortedBills = useMemo(() => [...bills].sort((a, b) => {
    const statusDifference = billStatus(a).rank - billStatus(b).rank;
    return statusDifference || a.due_day - b.due_day;
  }), [bills]);
  const unpaid = bills.filter((bill) => bill.last_paid_month !== month);
  const paid = bills.filter((bill) => bill.last_paid_month === month);
  const dueSoon = unpaid.filter((bill) => billStatus(bill).rank <= 2);
  const unpaidTotal = unpaid.reduce((sum, bill) => sum + bill.amount, 0);
  const paidTotal = paid.reduce((sum, bill) => sum + bill.amount, 0);

  if (!loaded) return <main className="grid min-h-screen place-items-center bg-paper"><p className="font-serif text-2xl">Loading your bills…</p></main>;

  return (
    <main className="min-h-screen bg-paper pb-20 text-center text-ink">
      <PlannerHeader demo={demo} active="bills" currency={currency} onCurrencyChange={(next) => { setCurrency(next); if (demo) savePreviewState({ currency: next }); }} status={status} />
      <div className="planner-content">
        <PageIntro icon={CalendarClock} title="Bill calendar" description="See what is due, mark it paid, and keep automatic payments visible before they leave your account." />

        <section className="mt-9 grid border-y border-rule bg-sheet md:grid-cols-3 md:divide-x md:divide-rule">
          <div className="p-7"><p className="text-sm text-muted-ink">Due now or within 7 days</p><p className={`mt-1 font-serif text-4xl ${dueSoon.length ? "text-avalanche" : "text-positive"}`}>{dueSoon.length}</p></div>
          <div className="border-t border-rule p-7 md:border-t-0"><p className="text-sm text-muted-ink">Still unpaid this month</p><p className="mt-1 font-serif text-4xl">{formatMoney(unpaidTotal, currency)}</p></div>
          <div className="border-t border-rule p-7 md:border-t-0"><p className="text-sm text-muted-ink">Marked paid this month</p><p className="mt-1 font-serif text-4xl text-positive">{formatMoney(paidTotal, currency)}</p></div>
        </section>

        {dueSoon.length > 0 && <div className="mx-auto mt-7 flex max-w-3xl items-center justify-center gap-3 border-y border-avalanche bg-sheet px-5 py-4 text-avalanche"><CircleAlert className="size-5 shrink-0" /><p className="font-semibold">{dueSoon.length} bill{dueSoon.length === 1 ? " needs" : "s need"} attention.</p></div>}

        <section className="mt-9 overflow-x-auto border-y border-rule bg-sheet">
          <Table className="min-w-[1050px]">
            <TableHeader><TableRow className="hover:bg-transparent [&_th]:text-center"><TableHead>Bill name</TableHead><TableHead className="w-44">Amount</TableHead><TableHead className="w-32">Due day</TableHead><TableHead className="w-48">Category</TableHead><TableHead className="w-28">Automatic</TableHead><TableHead className="w-44">Reminder</TableHead><TableHead className="w-36">This month</TableHead><TableHead className="w-16"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {sortedBills.map((bill) => {
                const itemStatus = billStatus(bill);
                const isPaid = bill.last_paid_month === month;
                return <TableRow key={bill.id} className={isPaid ? "opacity-65" : ""}>
                  <TableCell><Input aria-label="Bill name" value={bill.name} onChange={(event) => updateBill(bill.id, "name", event.target.value)} className="rounded-none bg-white text-center" /></TableCell>
                  <TableCell><div className="flex items-center justify-center"><span className="mr-2 text-muted-ink">{currencyDetails(currency).symbol}</span><Input aria-label={`${bill.name} amount`} type="number" min="0" step="0.01" value={bill.amount} onChange={(event) => updateBill(bill.id, "amount", event.target.value)} className="rounded-none bg-white text-center tabular-nums" /></div></TableCell>
                  <TableCell><Input aria-label={`${bill.name} due day`} type="number" min="1" max="31" value={bill.due_day} onChange={(event) => updateBill(bill.id, "due_day", event.target.value)} className="rounded-none bg-white text-center tabular-nums" /></TableCell>
                  <TableCell><Select value={bill.category} onValueChange={(value) => updateBill(bill.id, "category", value)}><SelectTrigger aria-label={`${bill.name} category`} className="w-full rounded-none bg-white"><SelectValue /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></TableCell>
                  <TableCell><div className="flex justify-center"><Switch aria-label={`${bill.name} automatic payment`} checked={bill.autopay} onCheckedChange={(checked) => updateBill(bill.id, "autopay", checked)} /></div></TableCell>
                  <TableCell><span className={`font-semibold ${itemStatus.tone}`}>{itemStatus.label}</span>{bill.autopay && !isPaid && <span className="mt-1 block text-xs text-muted-ink">Automatic payment</span>}</TableCell>
                  <TableCell><Button variant={isPaid ? "outline" : "default"} className="h-11 w-28" onClick={() => updateBill(bill.id, "last_paid_month", isPaid ? null : month)}>{isPaid ? <><Check /> Paid</> : "Mark paid"}</Button></TableCell>
                  <TableCell><Button variant="ghost" size="icon" className="size-11" onClick={() => void removeBill(bill.id)} title={`Delete ${bill.name}`}><Trash2 /></Button></TableCell>
                </TableRow>;
              })}
              {!sortedBills.length && <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-ink">No bills yet. Add the first one below.</TableCell></TableRow>}
            </TableBody>
          </Table>
          <button type="button" onClick={addBill} className="action-row-button"><Plus className="size-4" /> Add another bill</button>
        </section>
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-muted-ink">Bills organise your due dates. They are not subtracted again from the This month total, because they may already be included in essential spending.</p>
      </div>
    </main>
  );
}
