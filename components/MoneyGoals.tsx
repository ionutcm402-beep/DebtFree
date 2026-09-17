"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Flag, Plus, Trash2 } from "lucide-react";
import { PlannerHeader } from "@/components/PlannerHeader";
import { PageIntro } from "@/components/PageIntro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyCode, currencyDetails, formatMoney, isCurrencyCode } from "@/lib/currency";
import { createId } from "@/lib/id";
import { loadPreviewState, PreviewMoneyGoal, savePreviewState } from "@/lib/preview-storage";
import { createClient } from "@/lib/supabase/client";

type MoneyGoal = PreviewMoneyGoal;
const goalTypes = ["Emergency fund", "Holiday", "Home repairs", "Christmas", "Deposit", "Education", "Car", "Custom"];

function oneYearFromNow() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

function monthsUntil(targetDate: string) {
  const target = new Date(`${targetDate}T12:00:00`);
  if (Number.isNaN(target.getTime())) return 1;
  const now = new Date();
  const months = (target.getFullYear() - now.getFullYear()) * 12 + target.getMonth() - now.getMonth();
  return Math.max(0, months + (target.getDate() >= now.getDate() ? 1 : 0));
}

export function MoneyGoals({ demo = false }: { demo?: boolean }) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const supabase = useMemo(() => demo || !configured ? null : createClient(), [configured, demo]);
  const [userId, setUserId] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("GBP");
  const [goals, setGoals] = useState<MoneyGoal[]>([]);
  const [loaded, setLoaded] = useState(demo);
  const [status, setStatus] = useState(demo ? "Saved in this browser" : "All changes saved");
  const initial = useRef(true);

  useEffect(() => {
    if (demo) {
      const preview = loadPreviewState();
      queueMicrotask(() => {
        setGoals(preview.goals);
        setCurrency(preview.currency);
        initial.current = false;
      });
      return;
    }
    if (!supabase) { window.location.replace("/preview/goals"); return; }
    let active = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.replace("/login"); return; }
      const [goalResult, settingsResult] = await Promise.all([
        supabase.from("money_goals").select("id,name,goal_type,target_amount,current_amount,target_date").order("target_date"),
        supabase.from("user_settings").select("currency").maybeSingle(),
      ]);
      if (!active) return;
      setUserId(user.id);
      setCurrency(isCurrencyCode(settingsResult.data?.currency) ? settingsResult.data.currency : "GBP");
      if (goalResult.error || settingsResult.error) {
        setStatus("Couldn’t load goals — run the latest database schema");
      } else {
        setGoals((goalResult.data ?? []).map((goal) => ({ ...goal, target_amount: Number(goal.target_amount), current_amount: Number(goal.current_amount) })));
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
      const rows = goals.map((goal) => ({ ...goal, user_id: userId }));
      const results = await Promise.all([
        rows.length ? supabase.from("money_goals").upsert(rows, { onConflict: "id" }) : Promise.resolve({ error: null }),
        supabase.from("user_settings").upsert({ user_id: userId, currency }, { onConflict: "user_id" }),
      ]);
      setStatus(results.some((result) => result.error) ? "Couldn’t save changes" : "All changes saved");
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [currency, demo, goals, loaded, supabase, userId]);

  function persist(next: MoneyGoal[]) {
    setGoals(next);
    if (demo) savePreviewState({ goals: next });
  }

  function addGoal() {
    persist([...goals, { id: createId(), name: "New goal", goal_type: "Emergency fund", target_amount: 1000, current_amount: 0, target_date: oneYearFromNow() }]);
  }

  function updateGoal(id: string, field: keyof MoneyGoal, value: string) {
    persist(goals.map((goal) => {
      if (goal.id !== id) return goal;
      if (field === "target_amount" || field === "current_amount") return { ...goal, [field]: Math.max(0, Number(value)) };
      return { ...goal, [field]: value };
    }));
  }

  async function removeGoal(id: string) {
    persist(goals.filter((goal) => goal.id !== id));
    if (supabase && !demo) {
      const { error } = await supabase.from("money_goals").delete().eq("id", id);
      if (error) setStatus("Couldn’t delete goal");
    }
  }

  const totals = useMemo(() => goals.reduce((summary, goal) => ({
    target: summary.target + goal.target_amount,
    current: summary.current + Math.min(goal.current_amount, goal.target_amount),
  }), { target: 0, current: 0 }), [goals]);
  const symbol = currencyDetails(currency).symbol;

  if (!loaded) return <main className="grid min-h-screen place-items-center bg-paper"><p className="font-serif text-2xl">Loading your goals…</p></main>;

  return (
    <main className="min-h-screen bg-paper pb-20 text-center text-ink">
      <PlannerHeader demo={demo} active="goals" currency={currency} onCurrencyChange={(next) => { setCurrency(next); if (demo) savePreviewState({ currency: next }); }} status={status} />
      <div className="planner-content">
        <PageIntro icon={Flag} title="Goals & money pots" description="Give saved money a purpose, choose a finish date, and see the monthly amount needed to get there." tone="text-positive" />

        <section className="mt-9 grid border-y border-rule bg-sheet md:grid-cols-3 md:divide-x md:divide-rule">
          <div className="p-7"><p className="text-sm text-muted-ink">Total target</p><p className="mt-1 font-serif text-4xl">{formatMoney(totals.target, currency)}</p></div>
          <div className="border-t border-rule p-7 md:border-t-0"><p className="text-sm text-muted-ink">Already set aside</p><p className="mt-1 font-serif text-4xl text-positive">{formatMoney(totals.current, currency)}</p></div>
          <div className="border-t border-rule p-7 md:border-t-0"><p className="text-sm text-muted-ink">Still needed</p><p className="mt-1 font-serif text-4xl text-avalanche">{formatMoney(Math.max(0, totals.target - totals.current), currency)}</p></div>
        </section>

        <section className="mt-10 border-y border-rule bg-sheet">
          <div className="grid gap-3 border-b border-rule px-5 py-3 text-sm font-semibold text-muted-ink lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_1.2fr_3rem]">
            <span>Goal name</span><span>Type</span><span>Target</span><span>Saved so far</span><span>Finish date</span><span>Progress &amp; monthly need</span><span className="sr-only">Actions</span>
          </div>
          {goals.map((goal) => {
            const remaining = Math.max(0, goal.target_amount - goal.current_amount);
            const months = monthsUntil(goal.target_date);
            const percent = goal.target_amount > 0 ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100)) : 0;
            const completed = remaining === 0 && goal.target_amount > 0;
            return <div key={goal.id} className="grid items-center gap-3 border-b border-rule px-5 py-5 last:border-b-0 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_1.2fr_3rem]">
              <Input aria-label="Goal name" value={goal.name} onChange={(event) => updateGoal(goal.id, "name", event.target.value)} className="rounded-none bg-white text-center" />
              <Select value={goal.goal_type} onValueChange={(value) => updateGoal(goal.id, "goal_type", value)}><SelectTrigger aria-label={`${goal.name} type`} className="w-full rounded-none bg-white"><SelectValue /></SelectTrigger><SelectContent>{goalTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select>
              <div className="flex items-center justify-center"><span className="mr-2 text-muted-ink">{symbol}</span><Input aria-label={`${goal.name} target amount`} type="number" min="0" step="0.01" value={goal.target_amount} onChange={(event) => updateGoal(goal.id, "target_amount", event.target.value)} className="rounded-none bg-white text-center tabular-nums" /></div>
              <div className="flex items-center justify-center"><span className="mr-2 text-muted-ink">{symbol}</span><Input aria-label={`${goal.name} saved so far`} type="number" min="0" step="0.01" value={goal.current_amount} onChange={(event) => updateGoal(goal.id, "current_amount", event.target.value)} className="rounded-none bg-white text-center tabular-nums" /></div>
              <Input aria-label={`${goal.name} finish date`} type="date" value={goal.target_date} onChange={(event) => updateGoal(goal.id, "target_date", event.target.value)} className="rounded-none bg-white text-center" />
              <div className="min-w-0">
                <div className="mb-2 flex items-center justify-center gap-2 text-sm"><span className="font-semibold">{percent}%</span><span className="text-muted-ink">{formatMoney(remaining, currency)} left</span></div>
                <Progress value={percent} aria-label={`${goal.name} progress: ${percent}%`} className="mx-auto max-w-52 rounded-none" />
                <p className={`mt-2 text-sm font-semibold ${completed ? "text-positive" : months === 0 ? "text-avalanche" : "text-snowball"}`}>{completed ? "Goal reached" : months === 0 ? `${formatMoney(remaining, currency)} needed now` : `${formatMoney(remaining / months, currency)} / month for ${months} month${months === 1 ? "" : "s"}`}</p>
              </div>
              <Button variant="ghost" size="icon" className="mx-auto size-11" onClick={() => void removeGoal(goal.id)} title={`Delete ${goal.name}`}><Trash2 /></Button>
            </div>;
          })}
          {!goals.length && <p className="px-5 py-12 text-muted-ink">No goals yet. Add your first money pot below.</p>}
          <button type="button" onClick={addGoal} className="action-row-button"><Plus className="size-4" /> Add another goal</button>
        </section>
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-muted-ink">A money pot is a plan, not another bank account. Update “Saved so far” when you move money aside; this page does not alter your Money ledger balance.</p>
      </div>
    </main>
  );
}
