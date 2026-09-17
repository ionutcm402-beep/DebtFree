"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Camera, CheckCircle2, Flag, Trash2, TrendingDown } from "lucide-react";
import { PlannerHeader } from "@/components/PlannerHeader";
import { PageIntro } from "@/components/PageIntro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CurrencyCode, currencyDetails, formatMoney, isCurrencyCode } from "@/lib/currency";
import { createId } from "@/lib/id";
import { loadPreviewState, PreviewDebtSnapshot, savePreviewState } from "@/lib/preview-storage";
import { DebtInput } from "@/lib/simulate";
import { createClient } from "@/lib/supabase/client";

type DebtSnapshot = PreviewDebtSnapshot;
const milestones = [10, 25, 50, 75, 100];

function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function displayDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function DebtProgress({ demo = false }: { demo?: boolean }) {
  const supabase = useMemo(() => demo ? null : createClient(), [demo]);
  const [userId, setUserId] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("GBP");
  const [debts, setDebts] = useState<DebtInput[]>([]);
  const [snapshots, setSnapshots] = useState<DebtSnapshot[]>([]);
  const [snapshotDate, setSnapshotDate] = useState(today);
  const [snapshotBalance, setSnapshotBalance] = useState(0);
  const [loaded, setLoaded] = useState(demo);
  const [status, setStatus] = useState(demo ? "Saved in this browser" : "All changes saved");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (demo) {
      const preview = loadPreviewState();
      const balance = preview.debts.reduce((sum, debt) => sum + debt.balance, 0);
      queueMicrotask(() => {
        setDebts(preview.debts);
        setSnapshots(preview.debtSnapshots);
        setCurrency(preview.currency);
        setSnapshotBalance(balance);
      });
      return;
    }
    if (!supabase) { window.location.replace("/preview/progress"); return; }
    let active = true;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { window.location.replace("/login"); return; }
      const [debtResult, snapshotResult, settingsResult] = await Promise.all([
        supabase.from("debts").select("id,name,balance,apr,min_payment,extra_payment,start_date,account_type").order("created_at"),
        supabase.from("debt_snapshots").select("id,snapshot_date,total_balance").order("snapshot_date"),
        supabase.from("user_settings").select("currency").maybeSingle(),
      ]);
      if (!active) return;
      setUserId(user.id);
      setCurrency(isCurrencyCode(settingsResult.data?.currency) ? settingsResult.data.currency : "GBP");
      if (debtResult.error || snapshotResult.error || settingsResult.error) {
        setStatus("Couldn’t load progress — run the latest database schema");
      } else {
        const loadedDebts = (debtResult.data ?? []).map((debt) => ({
          ...debt,
          balance: Number(debt.balance),
          apr: Number(debt.apr),
          min_payment: Number(debt.min_payment),
          extra_payment: Number(debt.extra_payment),
        }));
        setDebts(loadedDebts);
        setSnapshots((snapshotResult.data ?? []).map((snapshot) => ({ ...snapshot, total_balance: Number(snapshot.total_balance) })));
        setSnapshotBalance(loadedDebts.reduce((sum, debt) => sum + debt.balance, 0));
      }
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [demo, supabase]);

  const currentBalance = debts.reduce((sum, debt) => sum + debt.balance, 0);
  const ordered = useMemo(() => [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)), [snapshots]);
  const startingBalance = ordered[0]?.total_balance ?? currentBalance;
  const paidDown = Math.max(0, startingBalance - currentBalance);
  const progress = startingBalance > 0 ? Math.min(100, paidDown / startingBalance * 100) : 100;
  const nextMilestone = milestones.find((milestone) => milestone > progress);
  const amountToNext = nextMilestone === undefined ? 0 : Math.max(0, currentBalance - startingBalance * (1 - nextMilestone / 100));
  const lastSaved = ordered.at(-1);
  const changeSinceLast = lastSaved ? lastSaved.total_balance - currentBalance : 0;
  const chartData = useMemo(() => {
    const points = ordered.map((snapshot) => ({ date: snapshot.snapshot_date, label: displayDate(snapshot.snapshot_date), balance: snapshot.total_balance, live: false }));
    const existingToday = points.findIndex((point) => point.date === today());
    const livePoint = { date: today(), label: "Today", balance: currentBalance, live: true };
    if (existingToday >= 0) points[existingToday] = livePoint;
    else points.push(livePoint);
    return points.sort((a, b) => a.date.localeCompare(b.date));
  }, [currentBalance, ordered]);

  async function changeCurrency(next: CurrencyCode) {
    setCurrency(next);
    if (demo) { savePreviewState({ currency: next }); return; }
    if (!supabase || !userId) return;
    const { error } = await supabase.from("user_settings").upsert({ user_id: userId, currency: next }, { onConflict: "user_id" });
    setStatus(error ? "Couldn’t save currency" : "All changes saved");
  }

  async function saveSnapshot() {
    setMessage("");
    if (!snapshotDate || snapshotBalance < 0) {
      setMessage("Choose a date and enter a balance of zero or more.");
      return;
    }
    const existing = snapshots.find((snapshot) => snapshot.snapshot_date === snapshotDate);
    const snapshot: DebtSnapshot = {
      id: existing?.id ?? createId(),
      snapshot_date: snapshotDate,
      total_balance: Math.round(snapshotBalance * 100) / 100,
    };
    const next = existing
      ? snapshots.map((item) => item.id === existing.id ? snapshot : item)
      : [...snapshots, snapshot];

    if (demo) {
      setSnapshots(next);
      savePreviewState({ debtSnapshots: next });
      setMessage(existing ? "Snapshot updated." : "Snapshot saved.");
      return;
    }
    if (!supabase || !userId) return;
    setStatus("Saving…");
    const { error } = await supabase.from("debt_snapshots").upsert({ ...snapshot, user_id: userId }, { onConflict: "user_id,snapshot_date" });
    if (error) {
      setStatus("Couldn’t save snapshot");
      setMessage("Run the latest database schema and try again.");
      return;
    }
    setSnapshots(next);
    setStatus("All changes saved");
    setMessage(existing ? "Snapshot updated." : "Snapshot saved.");
  }

  async function removeSnapshot(id: string) {
    const next = snapshots.filter((snapshot) => snapshot.id !== id);
    setSnapshots(next);
    if (demo) { savePreviewState({ debtSnapshots: next }); return; }
    if (!supabase) return;
    setStatus("Saving…");
    const { error } = await supabase.from("debt_snapshots").delete().eq("id", id);
    setStatus(error ? "Couldn’t delete snapshot" : "All changes saved");
  }

  if (!loaded) return <main className="grid min-h-screen place-items-center bg-paper"><p className="font-serif text-2xl">Loading your progress…</p></main>;

  return (
    <main className="min-h-screen bg-paper pb-20 text-center text-ink">
      <PlannerHeader demo={demo} active="progress" currency={currency} onCurrencyChange={(next) => void changeCurrency(next)} status={status} />

      <div className="planner-content">
        <PageIntro icon={TrendingDown} title="Debt progress" description="Save a balance snapshot each month to see the real direction of your debt and celebrate every milestone." tone="text-positive" />

        <section className="mt-9 grid border-y border-rule bg-sheet sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-rule">
          <div className="p-7"><p className="text-sm text-muted-ink">Starting snapshot</p><p className="mt-1 font-serif text-4xl">{formatMoney(startingBalance, currency)}</p></div>
          <div className="border-t border-rule p-7 sm:border-l sm:border-t-0"><p className="text-sm text-muted-ink">Current balance</p><p className="mt-1 font-serif text-4xl">{formatMoney(currentBalance, currency)}</p></div>
          <div className="border-t border-rule p-7 lg:border-t-0"><p className="text-sm text-muted-ink">Paid down</p><p className="mt-1 font-serif text-4xl text-positive">{formatMoney(paidDown, currency)}</p></div>
          <div className="border-t border-rule p-7 sm:border-l lg:border-t-0"><p className="text-sm text-muted-ink">Journey complete</p><p className="mt-1 font-serif text-4xl text-avalanche">{progress.toFixed(1)}%</p></div>
        </section>

        <section className="mt-9 border-y border-rule bg-sheet px-6 py-8">
          <Flag className="mx-auto size-6 text-avalanche" />
          <h2 className="mt-3 font-serif text-3xl">{nextMilestone ? `Next milestone: ${nextMilestone}% paid` : "Debt-free milestone reached"}</h2>
          <p className="mt-2 text-muted-ink">{nextMilestone ? `${formatMoney(amountToNext, currency)} more to clear before this milestone.` : "Your current balance is zero. Brilliant work."}</p>
          <div className="mx-auto mt-6 max-w-4xl">
            <div className="h-4 overflow-hidden bg-muted"><div className="h-full bg-avalanche transition-all" style={{ width: `${progress}%` }} /></div>
            <div className="mt-3 flex justify-between text-xs font-semibold text-muted-ink">{milestones.map((milestone) => <span key={milestone} className={progress >= milestone ? "text-positive" : ""}>{milestone}%</span>)}</div>
          </div>
          {progress >= 10 && <p className="mt-5 inline-flex items-center gap-2 font-semibold text-positive"><CheckCircle2 className="size-5" /> You have cleared at least 10% of your starting debt.</p>}
        </section>

        <section className="mt-9 border-y border-rule bg-sheet p-6 md:p-8">
          <Camera className="mx-auto size-6 text-snowball" />
          <h2 className="mt-3 font-serif text-3xl">Save a balance snapshot</h2>
          <p className="mt-2 text-sm text-muted-ink">The amount starts with the total balance currently shown on your Debt plan. You can also add an older statement balance.</p>
          <div className="mx-auto mt-6 grid max-w-2xl items-end gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Snapshot date<Input type="date" value={snapshotDate} onChange={(event) => setSnapshotDate(event.target.value)} className="mt-2 h-11 rounded-none bg-white text-center" /></label>
            <label className="text-sm font-semibold">Total debt balance<div className="mt-2 flex h-11 items-center border border-input bg-white px-3"><span className="mr-2 text-muted-ink">{currencyDetails(currency).symbol}</span><Input aria-label="Snapshot total debt balance" type="number" min="0" step="0.01" value={snapshotBalance} onChange={(event) => setSnapshotBalance(Math.max(0, Number(event.target.value)))} className="h-9 border-0 bg-transparent text-center tabular-nums shadow-none focus-visible:ring-0" /></div></label>
          </div>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Button variant="outline" onClick={() => setSnapshotBalance(currentBalance)} className="h-11 min-w-48 rounded-none">Use current balance</Button>
            <Button onClick={() => void saveSnapshot()} className="h-11 min-w-48 rounded-none">Save snapshot</Button>
          </div>
          {message && <p role="status" className="mt-4 text-sm font-semibold text-muted-ink">{message}</p>}
        </section>

        <section className="mt-10 border-t border-rule py-10">
          <h2 className="font-serif text-3xl">Your real balance history</h2>
          <p className="mt-2 text-sm text-muted-ink">{lastSaved ? changeSinceLast >= 0 ? `Current debt is ${formatMoney(changeSinceLast, currency)} lower than your last saved snapshot.` : `Current debt is ${formatMoney(Math.abs(changeSinceLast), currency)} higher than your last saved snapshot.` : "Save your first snapshot to begin the history."}</p>
          <div className="mt-6 h-[360px] min-w-0 border-y border-rule bg-sheet px-2 py-6 sm:px-6">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 312 }}>
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid stroke="#dbe0dc" vertical={false} />
                <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={45} tickLine={false} axisLine={false} tick={{ fill: "#66706b", fontSize: 12 }} />
                <YAxis tickFormatter={(value) => `${currencyDetails(currency).symbol}${Math.round(Number(value) / 1000)}k`} tickLine={false} axisLine={false} width={58} tick={{ fill: "#66706b", fontSize: 12 }} />
                <Tooltip formatter={(value) => formatMoney(Number(value), currency)} labelFormatter={(_, payload) => payload?.[0]?.payload?.date ? displayDate(payload[0].payload.date) : ""} contentStyle={{ borderRadius: 0, borderColor: "#cfd7d1", background: "#fbfbf7" }} />
                {startingBalance > 0 && <ReferenceLine y={startingBalance * 0.5} stroke="#d86532" strokeDasharray="7 6" label={{ value: "50% balance", fill: "#9b4b28", fontSize: 12 }} />}
                <Line type="monotone" dataKey="balance" name="Actual debt balance" stroke="#287da8" strokeWidth={4} dot={{ r: 4, fill: "#287da8", strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="mt-2 overflow-x-auto border-y border-rule bg-sheet">
          <div className="px-6 pt-7"><h2 className="font-serif text-3xl">Saved snapshots</h2><p className="mt-2 text-sm text-muted-ink">One snapshot per date. Saving the same date updates its balance.</p></div>
          <Table className="mt-5 min-w-[650px]">
            <TableHeader><TableRow className="hover:bg-transparent [&_th]:text-center"><TableHead>Date</TableHead><TableHead>Total balance</TableHead><TableHead>Change from previous</TableHead><TableHead className="w-20"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {[...ordered].reverse().map((snapshot) => {
                const index = ordered.findIndex((item) => item.id === snapshot.id);
                const previous = index > 0 ? ordered[index - 1] : null;
                const change = previous ? previous.total_balance - snapshot.total_balance : null;
                return <TableRow key={snapshot.id}>
                  <TableCell className="font-semibold">{displayDate(snapshot.snapshot_date)}</TableCell>
                  <TableCell className="font-semibold tabular-nums">{formatMoney(snapshot.total_balance, currency)}</TableCell>
                  <TableCell className={`font-semibold tabular-nums ${change === null ? "text-muted-ink" : change >= 0 ? "text-positive" : "text-avalanche"}`}>{change === null ? "Starting point" : `${change >= 0 ? "−" : "+"}${formatMoney(Math.abs(change), currency)}`}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" className="size-11" onClick={() => void removeSnapshot(snapshot.id)} title="Delete snapshot"><Trash2 /></Button></TableCell>
                </TableRow>;
              })}
              {!ordered.length && <TableRow><TableCell colSpan={4} className="py-10 text-muted-ink">No snapshots saved yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </section>
      </div>
    </main>
  );
}
