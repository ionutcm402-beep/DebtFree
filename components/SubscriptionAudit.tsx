"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCcw, Trash2 } from "lucide-react";
import { PlannerHeader } from "@/components/PlannerHeader";
import { PageIntro } from "@/components/PageIntro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CurrencyCode, currencyDetails, formatMoney, isCurrencyCode } from "@/lib/currency";
import { createId } from "@/lib/id";
import { loadPreviewState, PreviewSubscription, savePreviewState } from "@/lib/preview-storage";
import { createClient } from "@/lib/supabase/client";

type Subscription = PreviewSubscription;
const categories = ["Entertainment", "Apps", "Technology", "News", "Fitness", "Food", "Shopping", "Finance", "Education", "Other"];

function nextMonthDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function monthlyCost(item: Subscription) {
  return item.billing_cycle === "annual" ? item.amount / 12 : item.amount;
}

function daysUntil(dateValue: string) {
  const renewal = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(renewal.getTime())) return null;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  return Math.ceil((renewal.getTime() - start.getTime()) / 86_400_000);
}

function renewalLabel(dateValue: string) {
  const days = daysUntil(dateValue);
  if (days === null) return { text: "Choose a date", tone: "text-muted-ink" };
  if (days < 0) return { text: `${Math.abs(days)} day${days === -1 ? "" : "s"} overdue`, tone: "text-avalanche" };
  if (days === 0) return { text: "Renews today", tone: "text-avalanche" };
  if (days <= 30) return { text: `In ${days} day${days === 1 ? "" : "s"}`, tone: "text-snowball" };
  return { text: new Date(`${dateValue}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), tone: "text-muted-ink" };
}

export function SubscriptionAudit({ demo = false }: { demo?: boolean }) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const supabase = useMemo(() => demo || !configured ? null : createClient(), [configured, demo]);
  const [userId, setUserId] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("GBP");
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loaded, setLoaded] = useState(demo);
  const [status, setStatus] = useState(demo ? "Saved in this browser" : "All changes saved");
  const initial = useRef(true);

  useEffect(() => {
    if (demo) {
      const preview = loadPreviewState();
      queueMicrotask(() => {
        setSubscriptions(preview.subscriptions);
        setCurrency(preview.currency);
        initial.current = false;
      });
      return;
    }
    if (!supabase) { window.location.replace("/preview/subscriptions"); return; }
    let active = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.replace("/login"); return; }
      const [subscriptionResult, settingsResult] = await Promise.all([
        supabase.from("subscriptions").select("id,name,category,amount,billing_cycle,renewal_date,decision").order("renewal_date"),
        supabase.from("user_settings").select("currency").maybeSingle(),
      ]);
      if (!active) return;
      setUserId(user.id);
      setCurrency(isCurrencyCode(settingsResult.data?.currency) ? settingsResult.data.currency : "GBP");
      if (subscriptionResult.error || settingsResult.error) {
        setStatus("Couldn’t load subscriptions — run the latest database schema");
      } else {
        setSubscriptions((subscriptionResult.data ?? []).map((item) => ({ ...item, amount: Number(item.amount) })) as Subscription[]);
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
      const rows = subscriptions.map((item) => ({ ...item, user_id: userId }));
      const results = await Promise.all([
        rows.length ? supabase.from("subscriptions").upsert(rows, { onConflict: "id" }) : Promise.resolve({ error: null }),
        supabase.from("user_settings").upsert({ user_id: userId, currency }, { onConflict: "user_id" }),
      ]);
      setStatus(results.some((result) => result.error) ? "Couldn’t save changes" : "All changes saved");
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [currency, demo, loaded, subscriptions, supabase, userId]);

  function persist(next: Subscription[]) {
    setSubscriptions(next);
    if (demo) savePreviewState({ subscriptions: next });
  }

  function addSubscription() {
    persist([...subscriptions, { id: createId(), name: "New subscription", category: "Other", amount: 0, billing_cycle: "monthly", renewal_date: nextMonthDate(), decision: "review" }]);
  }

  function updateSubscription(id: string, field: keyof Subscription, value: string) {
    persist(subscriptions.map((item) => {
      if (item.id !== id) return item;
      if (field === "amount") return { ...item, amount: Math.max(0, Number(value)) };
      return { ...item, [field]: value } as Subscription;
    }));
  }

  async function removeSubscription(id: string) {
    persist(subscriptions.filter((item) => item.id !== id));
    if (supabase && !demo) {
      const { error } = await supabase.from("subscriptions").delete().eq("id", id);
      if (error) setStatus("Couldn’t delete subscription");
    }
  }

  const totals = useMemo(() => subscriptions.reduce((summary, item) => {
    const monthly = monthlyCost(item);
    return {
      monthly: summary.monthly + monthly,
      annual: summary.annual + monthly * 12,
      savings: summary.savings + (item.decision === "cancel" ? monthly * 12 : 0),
      upcoming: summary.upcoming + (item.decision !== "cancel" && (daysUntil(item.renewal_date) ?? 31) >= 0 && (daysUntil(item.renewal_date) ?? 31) <= 30 ? 1 : 0),
    };
  }, { monthly: 0, annual: 0, savings: 0, upcoming: 0 }), [subscriptions]);
  const symbol = currencyDetails(currency).symbol;

  if (!loaded) return <main className="grid min-h-screen place-items-center bg-paper"><p className="font-serif text-2xl">Loading subscriptions…</p></main>;

  return (
    <main className="min-h-screen bg-paper pb-20 text-center text-ink">
      <PlannerHeader demo={demo} active="subscriptions" currency={currency} onCurrencyChange={(next) => { setCurrency(next); if (demo) savePreviewState({ currency: next }); }} status={status} />
      <div className="planner-content">
        <PageIntro icon={RefreshCcw} title="Subscriptions & renewals" description="See the real yearly cost of recurring payments and decide what is worth keeping." />

        <section className="mt-9 grid border-y border-rule bg-sheet sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-rule">
          <div className="p-7"><p className="text-sm text-muted-ink">Monthly equivalent</p><p className="mt-1 font-serif text-4xl">{formatMoney(totals.monthly, currency)}</p></div>
          <div className="border-t border-rule p-7 sm:border-l sm:border-t-0 lg:border-l-0"><p className="text-sm text-muted-ink">Current yearly cost</p><p className="mt-1 font-serif text-4xl">{formatMoney(totals.annual, currency)}</p></div>
          <div className="border-t border-rule p-7 lg:border-t-0"><p className="text-sm text-muted-ink">Planned yearly saving</p><p className="mt-1 font-serif text-4xl text-positive">{formatMoney(totals.savings, currency)}</p></div>
          <div className="border-t border-rule p-7 sm:border-l lg:border-l-0 lg:border-t-0"><p className="text-sm text-muted-ink">Renewing within 30 days</p><p className={`mt-1 font-serif text-4xl ${totals.upcoming ? "text-avalanche" : "text-positive"}`}>{totals.upcoming}</p></div>
        </section>

        <section className="mt-10 overflow-x-auto border-y border-rule bg-sheet">
          <Table className="min-w-[1180px]">
            <TableHeader><TableRow className="hover:bg-transparent [&_th]:text-center"><TableHead>Subscription</TableHead><TableHead className="w-44">Category</TableHead><TableHead className="w-44">Price</TableHead><TableHead className="w-36">Billing</TableHead><TableHead className="w-48">Next renewal</TableHead><TableHead className="w-40">Decision</TableHead><TableHead className="w-44">True monthly cost</TableHead><TableHead className="w-16"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {subscriptions.map((item) => {
                const renewal = renewalLabel(item.renewal_date);
                return <TableRow key={item.id} className={item.decision === "cancel" ? "bg-muted/40" : ""}>
                  <TableCell><Input aria-label="Subscription name" value={item.name} onChange={(event) => updateSubscription(item.id, "name", event.target.value)} className="rounded-none bg-white text-center" /></TableCell>
                  <TableCell><Select value={item.category} onValueChange={(value) => updateSubscription(item.id, "category", value)}><SelectTrigger aria-label={`${item.name} category`} className="w-full rounded-none bg-white"><SelectValue /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></TableCell>
                  <TableCell><div className="flex items-center justify-center"><span className="mr-2 text-muted-ink">{symbol}</span><Input aria-label={`${item.name} price`} type="number" min="0" step="0.01" value={item.amount} onChange={(event) => updateSubscription(item.id, "amount", event.target.value)} className="rounded-none bg-white text-center tabular-nums" /></div></TableCell>
                  <TableCell><Select value={item.billing_cycle} onValueChange={(value) => updateSubscription(item.id, "billing_cycle", value)}><SelectTrigger aria-label={`${item.name} billing cycle`} className="w-full rounded-none bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="annual">Yearly</SelectItem></SelectContent></Select></TableCell>
                  <TableCell><Input aria-label={`${item.name} next renewal`} type="date" value={item.renewal_date} onChange={(event) => updateSubscription(item.id, "renewal_date", event.target.value)} className="rounded-none bg-white text-center" /><span className={`mt-2 block text-sm font-semibold ${renewal.tone}`}>{renewal.text}</span></TableCell>
                  <TableCell><Select value={item.decision} onValueChange={(value) => updateSubscription(item.id, "decision", value)}><SelectTrigger aria-label={`${item.name} decision`} className="w-full rounded-none bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="keep">Keep</SelectItem><SelectItem value="review">Review</SelectItem><SelectItem value="cancel">Cancel</SelectItem></SelectContent></Select></TableCell>
                  <TableCell><p className="font-serif text-xl">{formatMoney(monthlyCost(item), currency)}</p><p className="mt-1 text-sm text-muted-ink">{item.decision === "cancel" ? `${formatMoney(monthlyCost(item) * 12, currency)} saved / year` : "per month"}</p></TableCell>
                  <TableCell><Button variant="ghost" size="icon" className="size-11" onClick={() => void removeSubscription(item.id)} title={`Delete ${item.name}`}><Trash2 /></Button></TableCell>
                </TableRow>;
              })}
              {!subscriptions.length && <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-ink">No subscriptions yet. Add the first one below.</TableCell></TableRow>}
            </TableBody>
          </Table>
          <button type="button" onClick={addSubscription} className="action-row-button"><Plus className="size-4" /> Add another subscription</button>
        </section>
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-muted-ink">Marking an item “Cancel” calculates the saving but does not cancel it with the provider. After cancelling, put the freed monthly amount toward extra debt payments or a money goal.</p>
      </div>
    </main>
  );
}
