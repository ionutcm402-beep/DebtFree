"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Check, LoaderCircle, PiggyBank, Plus, ReceiptText, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlannerHeader } from "@/components/PlannerHeader";
import { PageIntro } from "@/components/PageIntro";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CurrencyCode, currencyDetails, formatMoney, isCurrencyCode } from "@/lib/currency";
import { createId } from "@/lib/id";
import { loadPreviewState, PreviewExpense, PreviewSavingEntry, PreviewWasteEntry, savePreviewState } from "@/lib/preview-storage";
import { expenseCategories, parseReceiptText, ReceiptResult } from "@/lib/receipt";
import { createClient } from "@/lib/supabase/client";

type Expense = PreviewExpense;
type WasteEntry = PreviewWasteEntry;
type SavingEntry = PreviewSavingEntry;
type DebtChoice = { id: string; name: string };
type ScanMode = "private" | "ai";

const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => today().slice(0, 7);
const emptyDraft = (): Omit<Expense, "id" | "source"> => ({ merchant: "", expense_date: today(), amount: 0, category: "Other" });
const wasteReasons = ["Spoiled or expired", "Bought too much", "Not used", "Damaged", "Duplicate purchase", "Other"];
const emptyWasteDraft = (): Omit<WasteEntry, "id"> => ({ name: "", waste_date: today(), amount: 0, reason: wasteReasons[0], category: "Groceries" });
const savingReasons = ["Walked or cycled", "Reduced a tip", "Used a discount or coupon", "Chose a cheaper option", "Avoided a purchase", "Made it at home", "Cancelled a service", "Other"];
const emptySavingDraft = (): Omit<SavingEntry, "id"> => ({ name: "", saving_date: today(), amount: 0, reason: savingReasons[0], category: "Other", allocation_type: "unassigned", allocation_target: "", allocation_label: "", allocation_complete: false });
const normalizeSavingEntry = (entry: PreviewSavingEntry): SavingEntry => ({
  ...entry,
  allocation_type: entry.allocation_type ?? "unassigned",
  allocation_target: entry.allocation_target ?? "",
  allocation_label: entry.allocation_label ?? "",
  allocation_complete: entry.allocation_complete ?? false,
});

async function imageDataUrl(file: File) {
  const source = URL.createObjectURL(file);
  try {
    const image = document.createElement("img");
    image.src = source;
    await image.decode();
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(source);
  }
}

async function scanPrivately(image: string, onProgress: (message: string) => void) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", undefined, { logger: (message) => {
    if (message.status === "recognizing text") onProgress(`Reading receipt… ${Math.round(message.progress * 100)}%`);
  } });
  try {
    const result = await worker.recognize(image);
    return parseReceiptText(result.data.text, result.data.confidence);
  } finally {
    await worker.terminate();
  }
}

export function SpendingTracker({ demo = false }: { demo?: boolean }) {
  const supabase = useMemo(() => demo ? null : createClient(), [demo]);
  const [userId, setUserId] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("GBP");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [wasteEntries, setWasteEntries] = useState<WasteEntry[]>([]);
  const [savingEntries, setSavingEntries] = useState<SavingEntry[]>([]);
  const [debts, setDebts] = useState<DebtChoice[]>([]);
  const [loaded, setLoaded] = useState(demo);
  const [status, setStatus] = useState(demo ? "Saved in this browser" : "All changes saved");
  const [month, setMonth] = useState(currentMonth());
  const [scanMode, setScanMode] = useState<ScanMode>("private");
  const [scanStatus, setScanStatus] = useState("");
  const [scanning, setScanning] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [draftSource, setDraftSource] = useState<Expense["source"]>("manual");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [wasteDraft, setWasteDraft] = useState(emptyWasteDraft);
  const [wasteStatus, setWasteStatus] = useState("");
  const [savingDraft, setSavingDraft] = useState(emptySavingDraft);
  const [savingStatus, setSavingStatus] = useState("");
  const initial = useRef(true);

  useEffect(() => {
    if (demo) {
      const preview = loadPreviewState();
      queueMicrotask(() => {
        setExpenses(preview.expenses);
        setWasteEntries(preview.wasteEntries);
        setSavingEntries(preview.savingEntries.map(normalizeSavingEntry));
        setDebts(preview.debts.map((debt) => ({ id: debt.id, name: debt.name })));
        setCurrency(preview.currency);
        initial.current = false;
      });
      return;
    }
    if (!supabase) { window.location.replace("/preview/spending"); return; }
    let active = true;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { window.location.replace("/login"); return; }
      const [expenseResult, wasteResult, savingResult, settingsResult, debtResult] = await Promise.all([
        supabase.from("expenses").select("id,merchant,expense_date,amount,category,source").order("expense_date", { ascending: false }),
        supabase.from("waste_entries").select("id,name,waste_date,amount,reason,category").order("waste_date", { ascending: false }),
        supabase.from("saving_entries").select("id,name,saving_date,amount,reason,category,allocation_type,allocation_target,allocation_label,allocation_complete").order("saving_date", { ascending: false }),
        supabase.from("user_settings").select("currency").maybeSingle(),
        supabase.from("debts").select("id,name").order("created_at"),
      ]);
      if (!active) return;
      if (expenseResult.error || wasteResult.error || savingResult.error || settingsResult.error || debtResult.error) { setStatus("Couldn’t load spending"); setLoaded(true); return; }
      setUserId(user.id);
      setExpenses((expenseResult.data ?? []).map((expense) => ({ ...expense, amount: Number(expense.amount), source: expense.source as Expense["source"] })));
      setWasteEntries((wasteResult.data ?? []).map((entry) => ({ ...entry, amount: Number(entry.amount) })));
      setSavingEntries((savingResult.data ?? []).map((entry) => normalizeSavingEntry({ ...entry, amount: Number(entry.amount), allocation_type: entry.allocation_type as SavingEntry["allocation_type"] })));
      setDebts((debtResult.data ?? []).map((debt) => ({ id: debt.id, name: debt.name })));
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
      const rows = expenses.map((expense) => ({ ...expense, user_id: userId }));
      const wasteRows = wasteEntries.map((entry) => ({ ...entry, user_id: userId }));
      const savingRows = savingEntries.map((entry) => ({ ...entry, user_id: userId }));
      const results = await Promise.all([
        rows.length ? supabase.from("expenses").upsert(rows, { onConflict: "id" }) : Promise.resolve({ error: null }),
        wasteRows.length ? supabase.from("waste_entries").upsert(wasteRows, { onConflict: "id" }) : Promise.resolve({ error: null }),
        savingRows.length ? supabase.from("saving_entries").upsert(savingRows, { onConflict: "id" }) : Promise.resolve({ error: null }),
        supabase.from("user_settings").upsert({ user_id: userId, currency }, { onConflict: "user_id" }),
      ]);
      setStatus(results.some((result) => result.error) ? "Couldn’t save changes" : "All changes saved");
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [currency, demo, expenses, loaded, savingEntries, supabase, userId, wasteEntries]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const monthExpenses = useMemo(() => expenses.filter((expense) => expense.expense_date.startsWith(month)), [expenses, month]);
  const monthTotal = useMemo(() => monthExpenses.reduce((sum, expense) => sum + expense.amount, 0), [monthExpenses]);
  const categoryTotals = useMemo(() => expenseCategories.map((category) => ({
    category,
    total: monthExpenses.filter((expense) => expense.category === category).reduce((sum, expense) => sum + expense.amount, 0),
  })).filter((item) => item.total > 0).sort((a, b) => b.total - a.total), [monthExpenses]);
  const largestCategory = Math.max(1, ...categoryTotals.map((item) => item.total));
  const monthWaste = useMemo(() => wasteEntries.filter((entry) => entry.waste_date.startsWith(month)), [month, wasteEntries]);
  const monthWasteTotal = useMemo(() => monthWaste.reduce((sum, entry) => sum + entry.amount, 0), [monthWaste]);
  const wasteRate = monthTotal > 0 ? monthWasteTotal / monthTotal * 100 : 0;
  const monthSavings = useMemo(() => savingEntries.filter((entry) => entry.saving_date.startsWith(month)), [month, savingEntries]);
  const monthSavingsTotal = useMemo(() => monthSavings.reduce((sum, entry) => sum + entry.amount, 0), [monthSavings]);
  const monthUnassignedTotal = useMemo(() => monthSavings.filter((entry) => entry.allocation_type === "unassigned").reduce((sum, entry) => sum + entry.amount, 0), [monthSavings]);
  const monthPlannedTotal = useMemo(() => monthSavings.filter((entry) => entry.allocation_type !== "unassigned" && !entry.allocation_complete).reduce((sum, entry) => sum + entry.amount, 0), [monthSavings]);
  const monthMovedTotal = useMemo(() => monthSavings.filter((entry) => entry.allocation_complete).reduce((sum, entry) => sum + entry.amount, 0), [monthSavings]);
  const everydayNet = monthSavingsTotal - monthWasteTotal;

  function persist(next: Expense[]) {
    setExpenses(next);
    if (demo) savePreviewState({ expenses: next });
  }

  function persistWaste(next: WasteEntry[]) {
    setWasteEntries(next);
    if (demo) savePreviewState({ wasteEntries: next });
  }

  function persistSavings(next: SavingEntry[]) {
    setSavingEntries(next);
    if (demo) savePreviewState({ savingEntries: next });
  }

  function updateExpense(id: string, field: keyof Expense, value: string) {
    persist(expenses.map((expense) => expense.id === id ? { ...expense, [field]: field === "amount" ? Math.max(0, Number(value)) : value } : expense));
  }

  async function removeExpense(id: string) {
    persist(expenses.filter((expense) => expense.id !== id));
    if (supabase && !demo) {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) setStatus("Couldn’t delete expense");
    }
  }

  function addWasteEntry() {
    if (!wasteDraft.name.trim() || wasteDraft.amount <= 0) {
      setWasteStatus("Add the wasted item and the amount it cost.");
      return;
    }
    persistWaste([{ id: createId(), ...wasteDraft, name: wasteDraft.name.trim() }, ...wasteEntries]);
    setWasteDraft(emptyWasteDraft());
    setWasteStatus("Wasted item added. It is not counted twice as new spending.");
  }

  function updateWasteEntry(id: string, field: keyof WasteEntry, value: string) {
    persistWaste(wasteEntries.map((entry) => entry.id === id ? { ...entry, [field]: field === "amount" ? Math.max(0, Number(value)) : value } : entry));
  }

  async function removeWasteEntry(id: string) {
    persistWaste(wasteEntries.filter((entry) => entry.id !== id));
    if (supabase && !demo) {
      const { error } = await supabase.from("waste_entries").delete().eq("id", id);
      if (error) setStatus("Couldn’t delete wasted item");
    }
  }

  function addSavingEntry() {
    if (!savingDraft.name.trim() || savingDraft.amount <= 0) {
      setSavingStatus("Add what you did and how much money it saved.");
      return;
    }
    persistSavings([{ id: createId(), ...savingDraft, name: savingDraft.name.trim() }, ...savingEntries]);
    setSavingDraft(emptySavingDraft());
    setSavingStatus("Everyday saving added. This does not change your bank-account balance.");
  }

  function updateSavingEntry(id: string, field: keyof SavingEntry, value: string) {
    persistSavings(savingEntries.map((entry) => entry.id === id ? { ...entry, [field]: field === "amount" ? Math.max(0, Number(value)) : value } : entry));
  }

  function updateSavingDestination(id: string, value: string) {
    persistSavings(savingEntries.map((entry) => {
      if (entry.id !== id) return entry;
      if (value.startsWith("debt:")) {
        const debtId = value.slice(5);
        const debt = debts.find((item) => item.id === debtId);
        return { ...entry, allocation_type: "debt", allocation_target: debtId, allocation_label: debt?.name ?? "Debt payment", allocation_complete: false };
      }
      const type = value as SavingEntry["allocation_type"];
      const label = type === "emergency" ? "Emergency fund" : type === "available" ? "Available money" : "";
      return { ...entry, allocation_type: type, allocation_target: "", allocation_label: label, allocation_complete: false };
    }));
  }

  function toggleSavingMoved(id: string) {
    persistSavings(savingEntries.map((entry) => entry.id === id ? { ...entry, allocation_complete: !entry.allocation_complete } : entry));
  }

  async function removeSavingEntry(id: string) {
    persistSavings(savingEntries.filter((entry) => entry.id !== id));
    if (supabase && !demo) {
      const { error } = await supabase.from("saving_entries").delete().eq("id", id);
      if (error) setStatus("Couldn’t delete saved-money entry");
    }
  }

  function addExpense() {
    if (!draft.merchant.trim() || draft.amount <= 0) {
      setScanStatus("Add a merchant and an amount above zero.");
      return;
    }
    persist([{ id: createId(), ...draft, merchant: draft.merchant.trim(), source: draftSource }, ...expenses]);
    setDraft(emptyDraft());
    setDraftSource("manual");
    setConfidence(null);
    setScanStatus("Expense added to this month.");
    setPreviewUrl("");
  }

  function applyResult(result: ReceiptResult, source: Expense["source"]) {
    setDraft({ merchant: result.merchant || "Receipt purchase", expense_date: result.expense_date || today(), amount: result.amount, category: result.category });
    setDraftSource(source);
    setConfidence(result.confidence);
    setScanStatus("Receipt read. Check the details, then add the expense.");
  }

  async function scanReceipt(file: File) {
    if (!file.type.startsWith("image/") || file.size > 12_000_000) {
      setScanStatus("Choose a receipt image smaller than 12 MB.");
      return;
    }
    setScanning(true);
    setConfidence(null);
    setScanStatus(scanMode === "private" ? "Preparing private scan…" : "Preparing AI scan…");
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    try {
      const image = await imageDataUrl(file);
      if (scanMode === "private") {
        applyResult(await scanPrivately(image, setScanStatus), "receipt_private");
      } else {
        try {
          const response = await fetch("/api/receipt-scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
          const result = await response.json() as { receipt?: ReceiptResult; error?: string };
          if (!response.ok || !result.receipt) throw new Error(result.error || "The AI scan failed.");
          applyResult(result.receipt, "receipt_ai");
        } catch {
          setScanStatus("AI scan unavailable. Reading this receipt privately on your phone…");
          const privateResult = await scanPrivately(image, setScanStatus);
          applyResult(privateResult, "receipt_private");
          setScanStatus("Receipt read privately. Check the details, then add the expense.");
        }
      }
    } catch (error) {
      setScanStatus(error instanceof Error ? error.message : "The receipt could not be read. Enter it manually below.");
    } finally {
      setScanning(false);
    }
  }

  if (!loaded) return <main className="grid min-h-screen place-items-center bg-paper"><p className="font-serif text-2xl">Loading your spending…</p></main>;

  return (
    <main className="min-h-screen bg-paper pb-20 text-center text-ink">
      <PlannerHeader demo={demo} active="spending" currency={currency} onCurrencyChange={(next) => { setCurrency(next); if (demo) savePreviewState({ currency: next }); }} status={status} />

      <div className="planner-content">
        <PageIntro icon={ReceiptText} title="Spending tracker" description="Take a receipt photo, check the result, and add it to your monthly spending. The category is chosen automatically." tone="text-avalanche" />

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_.85fr]">
          <section className="border-y border-rule bg-sheet p-5 sm:p-7">
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setScanMode("private")} className={`min-h-24 border p-4 text-center ${scanMode === "private" ? "border-ink bg-muted" : "border-rule bg-white"}`}><ShieldCheck className="mx-auto size-6 text-positive" /><span className="mt-2 block font-semibold">Private scan</span><span className="mt-1 block text-sm text-muted-ink">Receipt stays on this device</span></button>
              <button type="button" onClick={() => setScanMode("ai")} className={`min-h-24 border p-4 text-center ${scanMode === "ai" ? "border-ink bg-muted" : "border-rule bg-white"}`}><Sparkles className="mx-auto size-6 text-snowball" /><span className="mt-2 block font-semibold">AI scan</span><span className="mt-1 block text-sm text-muted-ink">Higher accuracy; image is sent securely</span></button>
            </div>

            <label className={`mt-4 flex h-14 w-full cursor-pointer items-center justify-center gap-2 bg-ink px-5 font-semibold text-paper ${scanning ? "pointer-events-none opacity-60" : "hover:opacity-90"}`}>
              {scanning ? <LoaderCircle className="size-5 animate-spin" /> : <Camera className="size-5" />}
              {scanning ? "Reading receipt…" : "Take photo or choose receipt"}
              <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={scanning} onChange={(event) => { const file = event.target.files?.[0]; if (file) void scanReceipt(file); event.target.value = ""; }} />
            </label>

            {previewUrl && <Image src={previewUrl} alt="Receipt being reviewed" width={700} height={700} unoptimized className="mx-auto mt-5 max-h-64 w-auto max-w-full border border-rule object-contain" />}
            {scanStatus && <p role="status" className="mt-4 text-sm leading-6 text-muted-ink">{scanStatus}</p>}

            <div className="mt-6 grid gap-4 border-t border-rule pt-6 sm:grid-cols-2">
              <label className="text-sm font-semibold">Merchant<Input value={draft.merchant} onChange={(event) => setDraft({ ...draft, merchant: event.target.value })} placeholder="Shop or business" className="mt-2 rounded-none bg-white text-center" /></label>
              <label className="text-sm font-semibold">Date<Input type="date" value={draft.expense_date} onChange={(event) => setDraft({ ...draft, expense_date: event.target.value })} className="mt-2 rounded-none bg-white text-center" /></label>
              <label className="text-sm font-semibold">Amount<div className="mt-2 flex items-center"><span className="mr-2 text-muted-ink">{currencyDetails(currency).symbol}</span><Input type="number" min="0" step="0.01" value={draft.amount || ""} onChange={(event) => setDraft({ ...draft, amount: Math.max(0, Number(event.target.value)) })} placeholder="0.00" className="rounded-none bg-white text-center tabular-nums" /></div></label>
              <label className="text-sm font-semibold">Category<Select value={draft.category} onValueChange={(value) => setDraft({ ...draft, category: value })}><SelectTrigger className="mt-2 w-full rounded-none bg-white"><SelectValue /></SelectTrigger><SelectContent>{expenseCategories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></label>
            </div>
            {confidence !== null && <p className="mt-4 text-sm text-muted-ink">Scan confidence: {Math.round(confidence * 100)}%. Please check the amount before saving.</p>}
            <Button onClick={addExpense} className="mt-5 h-11 w-full rounded-none"><Plus /> Add expense</Button>
            <p className="mt-3 text-xs leading-5 text-muted-ink">The photo is used only for scanning and is not saved with the expense.</p>
          </section>

          <aside className="lg:sticky lg:top-8 lg:self-start">
            <div className="border-y border-avalanche bg-sheet p-6">
              <label className="text-sm font-semibold">Month<Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mx-auto mt-2 max-w-52 rounded-none bg-white text-center" /></label>
              <p className="mt-6 text-sm text-muted-ink">Total tracked spending</p>
              <p className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">{formatMoney(monthTotal, currency)}</p>
              <p className="mt-2 text-sm text-muted-ink">{monthExpenses.length} expense{monthExpenses.length === 1 ? "" : "s"}</p>
              <div className="mt-6 border-y border-rule py-4">
                <p className="text-sm text-muted-ink">Everyday money saved</p>
                <p className="mt-1 font-serif text-3xl text-positive">{formatMoney(monthSavingsTotal, currency)}</p>
                <p className="mt-1 text-xs text-muted-ink">{monthSavings.length} smart choice{monthSavings.length === 1 ? "" : "s"}</p>
              </div>
              <div className="border-b border-rule py-4">
                <p className="text-sm text-muted-ink">Money wasted</p>
                <p className="mt-1 font-serif text-3xl text-destructive">{formatMoney(monthWasteTotal, currency)}</p>
                <p className="mt-1 text-xs text-muted-ink">{monthWaste.length} item{monthWaste.length === 1 ? "" : "s"} · {wasteRate.toFixed(1)}% of tracked spending</p>
              </div>
              <div className={`border-b border-rule py-4 ${everydayNet >= 0 ? "text-positive" : "text-destructive"}`}>
                <p className="text-sm">Saved minus wasted</p>
                <p className="mt-1 font-serif text-3xl">{everydayNet < 0 ? "−" : "+"}{formatMoney(Math.abs(everydayNet), currency)}</p>
              </div>
              <div className="mt-7 space-y-4 border-t border-rule pt-5">
                {categoryTotals.length ? categoryTotals.map((item) => <div key={item.category}><div className="flex justify-between gap-4 text-sm"><span>{item.category}</span><span className="font-semibold tabular-nums">{formatMoney(item.total, currency)}</span></div><div className="mt-2 h-2 bg-muted"><div className="h-full bg-avalanche" style={{ width: `${Math.max(5, item.total / largestCategory * 100)}%` }} /></div></div>) : <p className="text-sm text-muted-ink">Add a receipt to see where your money goes.</p>}
              </div>
            </div>
          </aside>
        </div>

        <section className="mt-12">
          <h2 className="font-serif text-3xl">Expenses</h2>
          <p className="mt-2 text-sm text-muted-ink">Edit any result if the receipt was unclear.</p>
          <div className="mt-5 overflow-x-auto border-y border-rule bg-sheet">
            <Table className={expenses.length ? "min-w-[850px]" : "min-w-full"}><TableHeader className={expenses.length ? "" : "hidden"}><TableRow className="hover:bg-transparent [&_th]:text-center"><TableHead>Date</TableHead><TableHead>Merchant</TableHead><TableHead>Category</TableHead><TableHead>Amount</TableHead><TableHead>Added by</TableHead><TableHead className="w-16"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>
              {expenses.length ? expenses.map((expense) => <TableRow key={expense.id}><TableCell><Input type="date" value={expense.expense_date} onChange={(event) => updateExpense(expense.id, "expense_date", event.target.value)} className="rounded-none bg-white text-center" /></TableCell><TableCell><Input value={expense.merchant} onChange={(event) => updateExpense(expense.id, "merchant", event.target.value)} className="rounded-none bg-white text-center" /></TableCell><TableCell><Select value={expense.category} onValueChange={(value) => updateExpense(expense.id, "category", value)}><SelectTrigger className="w-full min-w-40 rounded-none bg-white"><SelectValue /></SelectTrigger><SelectContent>{expenseCategories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></TableCell><TableCell><div className="flex items-center"><span className="mr-2 text-muted-ink">{currencyDetails(currency).symbol}</span><Input type="number" min="0" step="0.01" value={expense.amount} onChange={(event) => updateExpense(expense.id, "amount", event.target.value)} className="rounded-none bg-white text-center tabular-nums" /></div></TableCell><TableCell className="text-sm text-muted-ink">{expense.source === "receipt_ai" ? "AI scan" : expense.source === "receipt_private" ? "Private scan" : "Manual"}</TableCell><TableCell><Button variant="ghost" size="icon-sm" onClick={() => void removeExpense(expense.id)} title={`Delete ${expense.merchant}`}><Trash2 /></Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-ink">No expenses yet.</TableCell></TableRow>}
            </TableBody></Table>
          </div>
          {expenses.length > 0 && <p className="mt-4 inline-flex items-center gap-2 text-sm text-positive"><Check className="size-4" /> Spending is saved automatically.</p>}
        </section>

        <section className="mt-16 border-t border-rule pt-12">
          <PiggyBank className="mx-auto size-8 text-positive" />
          <h2 className="mt-3 planner-section-title">Everyday money saved</h2>
          <p className="mx-auto mt-3 max-w-2xl text-[17px] leading-7 text-muted-ink">Record money you avoided spending—for example, walking instead of taking the bus, reducing a tip from £5 to £3, using a discount, or choosing a cheaper option. This is progress, but it is not added to your bank-account balance.</p>

          <div className="mt-8 border-y border-rule bg-sheet p-5 sm:p-7">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="text-sm font-semibold">What saved money?<Input value={savingDraft.name} onChange={(event) => setSavingDraft({ ...savingDraft, name: event.target.value })} placeholder="For example, walked to town" className="mt-2 rounded-none bg-white text-center" /></label>
              <label className="text-sm font-semibold">Date<Input type="date" value={savingDraft.saving_date} onChange={(event) => setSavingDraft({ ...savingDraft, saving_date: event.target.value })} className="mt-2 rounded-none bg-white text-center" /></label>
              <label className="text-sm font-semibold">Amount saved<div className="mt-2 flex items-center"><span className="mr-2 text-muted-ink">{currencyDetails(currency).symbol}</span><Input type="number" min="0" step="0.01" value={savingDraft.amount || ""} onChange={(event) => setSavingDraft({ ...savingDraft, amount: Math.max(0, Number(event.target.value)) })} placeholder="0.00" className="rounded-none bg-white text-center tabular-nums" /></div></label>
              <label className="text-sm font-semibold">Related category<Select value={savingDraft.category} onValueChange={(value) => setSavingDraft({ ...savingDraft, category: value })}><SelectTrigger className="mt-2 w-full rounded-none bg-white"><SelectValue /></SelectTrigger><SelectContent>{expenseCategories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></label>
              <label className="text-sm font-semibold">How you saved<Select value={savingDraft.reason} onValueChange={(value) => setSavingDraft({ ...savingDraft, reason: value })}><SelectTrigger className="mt-2 w-full rounded-none bg-white"><SelectValue /></SelectTrigger><SelectContent>{savingReasons.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}</SelectContent></Select></label>
            </div>
            <Button onClick={addSavingEntry} className="mt-5 h-11 w-full rounded-none"><Plus /> Add money saved</Button>
            {savingStatus && <p role="status" className="mt-3 text-sm text-muted-ink">{savingStatus}</p>}
          </div>

          <div className="mt-6 overflow-x-auto border-y border-rule bg-sheet">
            <div className="grid border-b border-rule md:grid-cols-3 md:divide-x md:divide-rule"><div className="p-5"><p className="text-sm text-muted-ink">Ready to assign</p><p className="mt-1 font-serif text-3xl">{formatMoney(monthUnassignedTotal, currency)}</p></div><div className="border-t border-rule p-5 md:border-t-0"><p className="text-sm text-muted-ink">Planned destination</p><p className="mt-1 font-serif text-3xl text-snowball">{formatMoney(monthPlannedTotal, currency)}</p></div><div className="border-t border-rule p-5 md:border-t-0"><p className="text-sm text-muted-ink">Marked as moved</p><p className="mt-1 font-serif text-3xl text-positive">{formatMoney(monthMovedTotal, currency)}</p></div></div>
            <Table className={savingEntries.length ? "min-w-[1250px]" : "min-w-full"}><TableHeader className={savingEntries.length ? "" : "hidden"}><TableRow className="hover:bg-transparent [&_th]:text-center"><TableHead>Date</TableHead><TableHead>Smart choice</TableHead><TableHead>Related category</TableHead><TableHead>How you saved</TableHead><TableHead>Amount saved</TableHead><TableHead>Use this money</TableHead><TableHead>Action</TableHead><TableHead className="w-16"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>
              {savingEntries.length ? savingEntries.map((entry) => {
                const currentDestination = entry.allocation_type === "debt" ? `debt:${entry.allocation_target}` : entry.allocation_type;
                const debtStillExists = entry.allocation_type !== "debt" || debts.some((debt) => debt.id === entry.allocation_target);
                return <TableRow key={entry.id}><TableCell><Input type="date" value={entry.saving_date} onChange={(event) => updateSavingEntry(entry.id, "saving_date", event.target.value)} className="rounded-none bg-white text-center" /></TableCell><TableCell><Input value={entry.name} onChange={(event) => updateSavingEntry(entry.id, "name", event.target.value)} className="rounded-none bg-white text-center" /></TableCell><TableCell><Select value={entry.category} onValueChange={(value) => updateSavingEntry(entry.id, "category", value)}><SelectTrigger className="w-full min-w-40 rounded-none bg-white"><SelectValue /></SelectTrigger><SelectContent>{expenseCategories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></TableCell><TableCell><Select value={entry.reason} onValueChange={(value) => updateSavingEntry(entry.id, "reason", value)}><SelectTrigger className="w-full min-w-48 rounded-none bg-white"><SelectValue /></SelectTrigger><SelectContent>{savingReasons.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}</SelectContent></Select></TableCell><TableCell><div className="flex items-center"><span className="mr-2 text-muted-ink">{currencyDetails(currency).symbol}</span><Input type="number" min="0" step="0.01" value={entry.amount} onChange={(event) => updateSavingEntry(entry.id, "amount", event.target.value)} className="rounded-none bg-white text-center tabular-nums" /></div></TableCell><TableCell><Select value={currentDestination} onValueChange={(value) => updateSavingDestination(entry.id, value)}><SelectTrigger className="w-full min-w-52 rounded-none bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Not decided</SelectItem><SelectItem value="available">Keep available</SelectItem><SelectItem value="emergency">Emergency fund</SelectItem>{!debtStillExists && <SelectItem value={currentDestination}>{entry.allocation_label} (removed debt)</SelectItem>}{debts.map((debt) => <SelectItem key={debt.id} value={`debt:${debt.id}`}>Debt: {debt.name}</SelectItem>)}</SelectContent></Select></TableCell><TableCell><Button variant={entry.allocation_complete ? "outline" : "default"} className="h-11 w-32" disabled={entry.allocation_type === "unassigned"} onClick={() => toggleSavingMoved(entry.id)}>{entry.allocation_complete ? <><Check /> Moved</> : "Mark moved"}</Button></TableCell><TableCell><Button variant="ghost" size="icon" className="size-11" onClick={() => void removeSavingEntry(entry.id)} title={`Delete ${entry.name}`}><Trash2 /></Button></TableCell></TableRow>;
              }) : <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-ink">No everyday savings recorded yet.</TableCell></TableRow>}
            </TableBody></Table>
          </div>
          <p className="mx-auto mt-5 max-w-3xl text-sm leading-6 text-muted-ink">Choose where the saving should go, then select “Mark moved” only after you make the real payment or transfer. The planner never changes a debt balance or bank balance automatically.</p>
        </section>

        <section className="mt-16 border-t border-rule pt-12">
          <Trash2 className="mx-auto size-8 text-destructive" />
          <h2 className="mt-3 planner-section-title">Waste log</h2>
          <p className="mx-auto mt-3 max-w-2xl text-[17px] leading-7 text-muted-ink">Waste is not a spending category. Record the part of a purchase that was thrown away, expired, damaged, or never used. It will show as money lost without counting the purchase twice.</p>

          <div className="mt-8 border-y border-rule bg-sheet p-5 sm:p-7">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="text-sm font-semibold">Wasted item<Input value={wasteDraft.name} onChange={(event) => setWasteDraft({ ...wasteDraft, name: event.target.value })} placeholder="For example, unused food" className="mt-2 rounded-none bg-white text-center" /></label>
              <label className="text-sm font-semibold">Date<Input type="date" value={wasteDraft.waste_date} onChange={(event) => setWasteDraft({ ...wasteDraft, waste_date: event.target.value })} className="mt-2 rounded-none bg-white text-center" /></label>
              <label className="text-sm font-semibold">Value lost<div className="mt-2 flex items-center"><span className="mr-2 text-muted-ink">{currencyDetails(currency).symbol}</span><Input type="number" min="0" step="0.01" value={wasteDraft.amount || ""} onChange={(event) => setWasteDraft({ ...wasteDraft, amount: Math.max(0, Number(event.target.value)) })} placeholder="0.00" className="rounded-none bg-white text-center tabular-nums" /></div></label>
              <label className="text-sm font-semibold">Original category<Select value={wasteDraft.category} onValueChange={(value) => setWasteDraft({ ...wasteDraft, category: value })}><SelectTrigger className="mt-2 w-full rounded-none bg-white"><SelectValue /></SelectTrigger><SelectContent>{expenseCategories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></label>
              <label className="text-sm font-semibold">Why it was wasted<Select value={wasteDraft.reason} onValueChange={(value) => setWasteDraft({ ...wasteDraft, reason: value })}><SelectTrigger className="mt-2 w-full rounded-none bg-white"><SelectValue /></SelectTrigger><SelectContent>{wasteReasons.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}</SelectContent></Select></label>
            </div>
            <Button onClick={addWasteEntry} className="mt-5 h-11 w-full rounded-none"><Plus /> Add wasted item</Button>
            {wasteStatus && <p role="status" className="mt-3 text-sm text-muted-ink">{wasteStatus}</p>}
          </div>

          <div className="mt-6 overflow-x-auto border-y border-rule bg-sheet">
            <Table className={wasteEntries.length ? "min-w-[850px]" : "min-w-full"}><TableHeader className={wasteEntries.length ? "" : "hidden"}><TableRow className="hover:bg-transparent [&_th]:text-center"><TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Original category</TableHead><TableHead>Reason</TableHead><TableHead>Value lost</TableHead><TableHead className="w-16"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>
              {wasteEntries.length ? wasteEntries.map((entry) => <TableRow key={entry.id}><TableCell><Input type="date" value={entry.waste_date} onChange={(event) => updateWasteEntry(entry.id, "waste_date", event.target.value)} className="rounded-none bg-white text-center" /></TableCell><TableCell><Input value={entry.name} onChange={(event) => updateWasteEntry(entry.id, "name", event.target.value)} className="rounded-none bg-white text-center" /></TableCell><TableCell><Select value={entry.category} onValueChange={(value) => updateWasteEntry(entry.id, "category", value)}><SelectTrigger className="w-full min-w-40 rounded-none bg-white"><SelectValue /></SelectTrigger><SelectContent>{expenseCategories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></TableCell><TableCell><Select value={entry.reason} onValueChange={(value) => updateWasteEntry(entry.id, "reason", value)}><SelectTrigger className="w-full min-w-44 rounded-none bg-white"><SelectValue /></SelectTrigger><SelectContent>{wasteReasons.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}</SelectContent></Select></TableCell><TableCell><div className="flex items-center"><span className="mr-2 text-muted-ink">{currencyDetails(currency).symbol}</span><Input type="number" min="0" step="0.01" value={entry.amount} onChange={(event) => updateWasteEntry(entry.id, "amount", event.target.value)} className="rounded-none bg-white text-center tabular-nums" /></div></TableCell><TableCell><Button variant="ghost" size="icon-sm" onClick={() => void removeWasteEntry(entry.id)} title={`Delete ${entry.name}`}><Trash2 /></Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-ink">Nothing recorded as wasted.</TableCell></TableRow>}
            </TableBody></Table>
          </div>
        </section>
      </div>
    </main>
  );
}
