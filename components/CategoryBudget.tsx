"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Gauge, Plus, Trash2 } from "lucide-react";
import { PlannerHeader } from "@/components/PlannerHeader";
import { PageIntro } from "@/components/PageIntro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CurrencyCode, currencyDetails, formatMoney, isCurrencyCode } from "@/lib/currency";
import { createId } from "@/lib/id";
import { loadPreviewState, PreviewCategoryBudget, PreviewExpense, savePreviewState } from "@/lib/preview-storage";
import { expenseCategories } from "@/lib/receipt";
import { createClient } from "@/lib/supabase/client";

type Budget = PreviewCategoryBudget;
const currentMonth = () => new Date().toISOString().slice(0, 7);

function daysRemaining(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return 0;
  const totalDays = new Date(year, monthNumber, 0).getDate();
  const now = new Date();
  const selected = year * 12 + monthNumber;
  const current = now.getFullYear() * 12 + now.getMonth() + 1;
  if (selected < current) return 0;
  if (selected > current) return totalDays;
  return Math.max(0, totalDays - now.getDate() + 1);
}

function monthName(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1, 12).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function CategoryBudget({ demo = false }: { demo?: boolean }) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const supabase = useMemo(() => demo || !configured ? null : createClient(), [configured, demo]);
  const [userId, setUserId] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("GBP");
  const [month, setMonth] = useState(currentMonth());
  const [expenses, setExpenses] = useState<PreviewExpense[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [newCategory, setNewCategory] = useState<string>(expenseCategories[0]);
  const [loaded, setLoaded] = useState(demo);
  const [status, setStatus] = useState(demo ? "Saved in this browser" : "All changes saved");
  const initial = useRef(true);

  useEffect(() => {
    if (demo) {
      const preview = loadPreviewState();
      queueMicrotask(() => {
        setExpenses(preview.expenses);
        setBudgets(preview.categoryBudgets);
        setCurrency(preview.currency);
        initial.current = false;
      });
      return;
    }
    if (!supabase) { window.location.replace("/preview/budget"); return; }
    let active = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.replace("/login"); return; }
      const [expenseResult, budgetResult, settingsResult] = await Promise.all([
        supabase.from("expenses").select("id,merchant,expense_date,amount,category,source").order("expense_date", { ascending: false }),
        supabase.from("category_budgets").select("id,category,monthly_limit").order("category"),
        supabase.from("user_settings").select("currency").maybeSingle(),
      ]);
      if (!active) return;
      setUserId(user.id);
      setCurrency(isCurrencyCode(settingsResult.data?.currency) ? settingsResult.data.currency : "GBP");
      if (expenseResult.error || budgetResult.error || settingsResult.error) {
        setStatus("Couldn’t load budgets — run the latest database schema");
      } else {
        setExpenses((expenseResult.data ?? []).map((expense) => ({ ...expense, amount: Number(expense.amount), source: expense.source as PreviewExpense["source"] })));
        setBudgets((budgetResult.data ?? []).map((budget) => ({ ...budget, monthly_limit: Number(budget.monthly_limit) })));
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
      const rows = budgets.map((budget) => ({ ...budget, user_id: userId }));
      const results = await Promise.all([
        rows.length ? supabase.from("category_budgets").upsert(rows, { onConflict: "id" }) : Promise.resolve({ error: null }),
        supabase.from("user_settings").upsert({ user_id: userId, currency }, { onConflict: "user_id" }),
      ]);
      setStatus(results.some((result) => result.error) ? "Couldn’t save changes" : "All changes saved");
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [budgets, currency, demo, loaded, supabase, userId]);

  function persist(next: Budget[]) {
    setBudgets(next);
    if (demo) savePreviewState({ categoryBudgets: next });
  }

  function updateBudget(id: string, value: string) {
    persist(budgets.map((budget) => budget.id === id ? { ...budget, monthly_limit: Math.max(0, Number(value)) } : budget));
  }

  function addBudget() {
    if (!selectedCategory || budgets.some((budget) => budget.category === selectedCategory)) return;
    persist([...budgets, { id: createId(), category: selectedCategory, monthly_limit: 0 }]);
  }

  async function removeBudget(id: string) {
    persist(budgets.filter((budget) => budget.id !== id));
    if (supabase && !demo) {
      const { error } = await supabase.from("category_budgets").delete().eq("id", id);
      if (error) setStatus("Couldn’t delete budget");
    }
  }

  const monthExpenses = useMemo(() => expenses.filter((expense) => expense.expense_date.startsWith(month)), [expenses, month]);
  const budgetRows = useMemo(() => budgets.map((budget) => {
    const spent = monthExpenses.filter((expense) => expense.category === budget.category).reduce((sum, expense) => sum + expense.amount, 0);
    const remaining = budget.monthly_limit - spent;
    const percentage = budget.monthly_limit > 0 ? spent / budget.monthly_limit * 100 : spent > 0 ? 100 : 0;
    return { ...budget, spent, remaining, percentage };
  }).sort((a, b) => b.percentage - a.percentage || a.category.localeCompare(b.category)), [budgets, monthExpenses]);
  const budgetedCategories = useMemo(() => new Set(budgets.map((budget) => budget.category)), [budgets]);
  const unusedCategories = expenseCategories.filter((category) => !budgetedCategories.has(category));
  const selectedCategory = unusedCategories.includes(newCategory as typeof expenseCategories[number]) ? newCategory : unusedCategories[0] ?? "";
  const totalLimit = budgets.reduce((sum, budget) => sum + budget.monthly_limit, 0);
  const budgetedSpend = budgetRows.reduce((sum, budget) => sum + budget.spent, 0);
  const totalSpend = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const unbudgetedSpend = monthExpenses.filter((expense) => !budgetedCategories.has(expense.category)).reduce((sum, expense) => sum + expense.amount, 0);
  const remaining = totalLimit - budgetedSpend;
  const remainingDays = daysRemaining(month);
  const safePerDay = remainingDays > 0 ? Math.max(0, remaining) / remainingDays : 0;
  const symbol = currencyDetails(currency).symbol;

  if (!loaded) return <main className="grid min-h-screen place-items-center bg-paper"><p className="font-serif text-2xl">Loading your budget…</p></main>;

  return (
    <main className="min-h-screen bg-paper pb-20 text-center text-ink">
      <PlannerHeader demo={demo} active="budget" currency={currency} onCurrencyChange={(next) => { setCurrency(next); if (demo) savePreviewState({ currency: next }); }} status={status} />
      <div className="planner-content">
        <PageIntro icon={Gauge} title="Monthly category budget" description="Set limits once, then see receipt and manual spending measured against them automatically." />

        <label className="mx-auto mt-7 block w-56"><span className="mb-2 block text-sm font-semibold text-muted-ink">Budget month</span><Input aria-label="Budget month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-none bg-white text-center" /></label>

        <section className="mt-9 grid border-y border-rule bg-sheet sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-rule">
          <div className="p-7"><p className="text-sm text-muted-ink">Total category limits</p><p className="mt-1 font-serif text-4xl">{formatMoney(totalLimit, currency)}</p><p className="mt-2 text-sm text-muted-ink">{monthName(month)}</p></div>
          <div className="border-t border-rule p-7 sm:border-l sm:border-t-0 lg:border-l-0"><p className="text-sm text-muted-ink">Spent in budgeted categories</p><p className="mt-1 font-serif text-4xl">{formatMoney(budgetedSpend, currency)}</p><p className="mt-2 text-sm text-muted-ink">{formatMoney(totalSpend, currency)} total spending</p></div>
          <div className="border-t border-rule p-7 lg:border-t-0"><p className="text-sm text-muted-ink">Budget remaining</p><p className={`mt-1 font-serif text-4xl ${remaining < 0 ? "text-avalanche" : "text-positive"}`}>{remaining < 0 ? "− " : ""}{formatMoney(Math.abs(remaining), currency)}</p><p className="mt-2 text-sm text-muted-ink">Across added categories</p></div>
          <div className="border-t border-rule p-7 sm:border-l lg:border-l-0 lg:border-t-0"><p className="text-sm text-muted-ink">Safe spending per day</p><p className="mt-1 font-serif text-4xl text-snowball">{formatMoney(safePerDay, currency)}</p><p className="mt-2 text-sm text-muted-ink">{remainingDays ? `${remainingDays} day${remainingDays === 1 ? "" : "s"} remaining` : "Month finished"}</p></div>
        </section>

        {unbudgetedSpend > 0 && <div className="mx-auto mt-7 max-w-3xl border-y border-avalanche bg-sheet px-5 py-4 text-avalanche"><p className="font-semibold">{formatMoney(unbudgetedSpend, currency)} was spent in categories without a budget. Add those categories below for a complete limit.</p></div>}

        <section className="mt-10 overflow-x-auto border-y border-rule bg-sheet">
          <Table className="min-w-[980px]"><TableHeader><TableRow className="hover:bg-transparent [&_th]:text-center"><TableHead>Category</TableHead><TableHead className="w-44">Monthly limit</TableHead><TableHead className="w-44">Spent</TableHead><TableHead className="w-52">Remaining</TableHead><TableHead className="w-80">Progress</TableHead><TableHead className="w-16"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>
            {budgetRows.map((budget) => {
              const over = budget.remaining < 0;
              return <TableRow key={budget.id}>
                <TableCell className="font-semibold">{budget.category}</TableCell>
                <TableCell><div className="flex items-center justify-center"><span className="mr-2 text-muted-ink">{symbol}</span><Input aria-label={`${budget.category} monthly limit`} type="number" min="0" step="0.01" value={budget.monthly_limit} onChange={(event) => updateBudget(budget.id, event.target.value)} className="rounded-none bg-white text-center tabular-nums" /></div></TableCell>
                <TableCell className="font-serif text-xl">{formatMoney(budget.spent, currency)}</TableCell>
                <TableCell><p className={`font-semibold ${over ? "text-avalanche" : "text-positive"}`}>{over ? `${formatMoney(Math.abs(budget.remaining), currency)} over` : `${formatMoney(budget.remaining, currency)} left`}</p></TableCell>
                <TableCell><div className="mb-2 flex justify-center gap-2 text-sm"><span className="font-semibold">{Math.round(budget.percentage)}%</span><span className="text-muted-ink">of limit</span></div><Progress value={Math.min(100, budget.percentage)} aria-label={`${budget.category}: ${Math.round(budget.percentage)}% of budget used`} className={`mx-auto max-w-64 rounded-none ${over ? "[&_[data-slot=progress-indicator]]:bg-avalanche" : "[&_[data-slot=progress-indicator]]:bg-snowball"}`} /></TableCell>
                <TableCell><Button variant="ghost" size="icon" className="size-11" onClick={() => void removeBudget(budget.id)} title={`Delete ${budget.category} budget`}><Trash2 /></Button></TableCell>
              </TableRow>;
            })}
            {!budgetRows.length && <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-ink">No category limits yet. Add the first one below.</TableCell></TableRow>}
          </TableBody></Table>
          <div className="flex min-h-16 flex-wrap items-center justify-center gap-3 border-t border-rule px-5 py-3">
            <Select value={selectedCategory} onValueChange={setNewCategory} disabled={!unusedCategories.length}><SelectTrigger aria-label="Category to add" className="h-11 w-56 rounded-none bg-white"><SelectValue placeholder="All categories added" /></SelectTrigger><SelectContent>{unusedCategories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select>
            <Button onClick={addBudget} disabled={!unusedCategories.length} className="h-11 w-56"><Plus /> Add category budget</Button>
          </div>
        </section>
        <p className="mx-auto mt-5 max-w-3xl text-sm leading-6 text-muted-ink">Budget progress uses purchases recorded on the Spending page, including receipt scans. Changing a limit does not change your cash-flow forecast or debt payments.</p>
      </div>
    </main>
  );
}
