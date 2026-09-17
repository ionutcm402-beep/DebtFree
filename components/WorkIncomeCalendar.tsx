"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, ChevronLeft, ChevronRight, Clock3, Coins, Info, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { createId } from "@/lib/id";
import { loadPreviewState, savePreviewState } from "@/lib/preview-storage";
import { createClient } from "@/lib/supabase/client";
import { estimateUkMonthlyPay, NiCategory, UkPayEstimate, WorkIncomeSettings, WorkShift } from "@/lib/uk-pay";
import { formatMoney } from "@/lib/currency";

const defaultSettings: WorkIncomeSettings = { hourly_rate: 0, tax_code: "1257L", ni_category: "A", pension_percent: 0 };
const emptyDraft = (date: string): WorkShift => ({ id: createId(), work_date: date, hours: 0, direct_tips: 0, payroll_gratuity: 0, other_income: 0, note: "" });
const niCategories: NiCategory[] = ["A", "B", "C", "D", "E", "F", "H", "I", "J", "K", "L", "M", "N", "S", "V", "Z"];

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthBounds(key: string) {
  const [year, month] = key.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${key}-01`, end: `${key}-${String(lastDay).padStart(2, "0")}` };
}

type Props = {
  demo: boolean;
  onForecastChange: (estimate: UkPayEstimate) => void;
  onStatusChange: (status: string) => void;
};

export function WorkIncomeCalendar({ demo, onForecastChange, onStatusChange }: Props) {
  const supabase = useMemo(() => demo ? null : createClient(), [demo]);
  const [userId, setUserId] = useState("");
  const [shownMonth, setShownMonth] = useState(monthKey());
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [settings, setSettings] = useState<WorkIncomeSettings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<WorkShift>(() => emptyDraft(`${monthKey()}-01`));
  const settingsReady = useRef(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoaded(false);
      if (demo) {
        const preview = loadPreviewState();
        if (!active) return;
        setShifts(preview.workShifts.filter((shift) => shift.work_date.startsWith(shownMonth)));
        setSettings(preview.workIncomeSettings);
        setLoaded(true);
        queueMicrotask(() => { settingsReady.current = true; });
        return;
      }
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.replace("/login"); return; }
      const bounds = monthBounds(shownMonth);
      const [shiftResult, settingsResult] = await Promise.all([
        supabase.from("work_shifts").select("id,work_date,hours,direct_tips,payroll_gratuity,other_income,note").gte("work_date", bounds.start).lte("work_date", bounds.end).order("work_date"),
        supabase.from("user_settings").select("hourly_rate,tax_code,ni_category,pension_percent").maybeSingle(),
      ]);
      if (!active) return;
      if (shiftResult.error || settingsResult.error) {
        onStatusChange("Couldn’t load work calendar");
        setLoaded(true);
        return;
      }
      setUserId(user.id);
      setShifts((shiftResult.data ?? []).map((shift) => ({
        ...shift,
        hours: Number(shift.hours),
        direct_tips: Number(shift.direct_tips),
        payroll_gratuity: Number(shift.payroll_gratuity),
        other_income: Number(shift.other_income),
        note: shift.note ?? "",
      })));
      const saved = settingsResult.data;
      setSettings({
        hourly_rate: Number(saved?.hourly_rate ?? 0),
        tax_code: String(saved?.tax_code ?? "1257L"),
        ni_category: niCategories.includes(saved?.ni_category as NiCategory) ? saved.ni_category as NiCategory : "A",
        pension_percent: Number(saved?.pension_percent ?? 0),
      });
      setLoaded(true);
      queueMicrotask(() => { settingsReady.current = true; });
    };
    void load();
    return () => { active = false; };
  }, [demo, onStatusChange, shownMonth, supabase]);

  useEffect(() => {
    if (!loaded || !settingsReady.current) return;
    onStatusChange("Saving…");
    const timeout = window.setTimeout(async () => {
      if (demo) {
        savePreviewState({ workIncomeSettings: settings });
        onStatusChange("Saved in this browser");
        return;
      }
      if (!supabase || !userId) return;
      const { error } = await supabase.from("user_settings").upsert({ user_id: userId, ...settings }, { onConflict: "user_id" });
      onStatusChange(error ? "Couldn’t save pay settings" : "All changes saved");
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [demo, loaded, onStatusChange, settings, supabase, userId]);

  const estimate = useMemo(() => estimateUkMonthlyPay(shifts, settings), [settings, shifts]);
  useEffect(() => { onForecastChange(estimate); }, [estimate, onForecastChange]);

  const [year, monthNumber] = shownMonth.split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const leadingBlanks = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(year, monthIndex, 1));
  const today = dateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const shiftsByDate = new Map(shifts.map((shift) => [shift.work_date, shift]));

  function changeMonth(amount: number) {
    settingsReady.current = false;
    setShownMonth(monthKey(new Date(year, monthIndex + amount, 1)));
  }

  function openDay(day: number) {
    const key = dateKey(year, monthIndex, day);
    setDraft(shiftsByDate.get(key) ?? emptyDraft(key));
    setDialogOpen(true);
  }

  function updateDraft(field: keyof WorkShift, value: string) {
    const number = Math.max(0, Number(value));
    setDraft((current) => ({ ...current, [field]: field === "hours" ? Math.min(24, number) : ["direct_tips", "payroll_gratuity", "other_income"].includes(field) ? number : value }));
  }

  async function saveDay() {
    const next = [...shifts.filter((shift) => shift.work_date !== draft.work_date), draft].sort((a, b) => a.work_date.localeCompare(b.work_date));
    setShifts(next);
    setDialogOpen(false);
    onStatusChange("Saving…");
    if (demo) {
      const preview = loadPreviewState();
      savePreviewState({ workShifts: [...preview.workShifts.filter((shift) => shift.work_date !== draft.work_date), draft] });
      onStatusChange("Saved in this browser");
      return;
    }
    if (!supabase || !userId) return;
    const { error } = await supabase.from("work_shifts").upsert({ ...draft, user_id: userId }, { onConflict: "id" });
    onStatusChange(error ? "Couldn’t save this shift" : "All changes saved");
  }

  async function clearDay() {
    const existing = shiftsByDate.get(draft.work_date);
    const next = shifts.filter((shift) => shift.work_date !== draft.work_date);
    setShifts(next);
    setDialogOpen(false);
    if (demo) {
      const preview = loadPreviewState();
      savePreviewState({ workShifts: preview.workShifts.filter((shift) => shift.work_date !== draft.work_date) });
      onStatusChange("Saved in this browser");
      return;
    }
    if (existing && supabase) {
      const { error } = await supabase.from("work_shifts").delete().eq("id", existing.id);
      onStatusChange(error ? "Couldn’t clear this shift" : "All changes saved");
    }
  }

  return (
    <section className="border-y border-rule bg-sheet text-center">
      <div className="border-b border-rule px-4 py-7 sm:px-7">
        <div className="mx-auto flex max-w-3xl flex-wrap items-end justify-center gap-4">
          <label className="min-w-40 flex-1 text-sm font-semibold">Hourly rate
            <span className="mt-2 flex items-center justify-center"><span className="mr-2 text-muted-ink">£</span><Input aria-label="Hourly rate in pounds" type="number" min="0" step="0.01" value={settings.hourly_rate} onChange={(event) => setSettings((current) => ({ ...current, hourly_rate: Math.max(0, Number(event.target.value)) }))} className="h-11 max-w-40 rounded-none bg-white text-center tabular-nums" /></span>
          </label>
          <label className="min-w-40 flex-1 text-sm font-semibold">Tax code
            <Input aria-label="Tax code" value={settings.tax_code} onChange={(event) => setSettings((current) => ({ ...current, tax_code: event.target.value.toUpperCase().slice(0, 8) }))} className="mx-auto mt-2 h-11 max-w-40 rounded-none bg-white text-center uppercase" />
          </label>
          <label className="min-w-40 flex-1 text-sm font-semibold">NI category
            <NativeSelect aria-label="National Insurance category" value={settings.ni_category} onChange={(event) => setSettings((current) => ({ ...current, ni_category: event.target.value as NiCategory }))} className="mx-auto mt-2 h-11 max-w-40 rounded-none bg-white text-center">
              {niCategories.map((category) => <NativeSelectOption key={category} value={category}>{category}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          <label className="min-w-40 flex-1 text-sm font-semibold">Pension %
            <Input aria-label="Pension salary sacrifice percentage" type="number" min="0" max="100" step="0.1" value={settings.pension_percent} onChange={(event) => setSettings((current) => ({ ...current, pension_percent: Math.min(100, Math.max(0, Number(event.target.value))) }))} className="mx-auto mt-2 h-11 max-w-40 rounded-none bg-white text-center tabular-nums" />
          </label>
        </div>
        <p className="mx-auto mt-5 max-w-3xl text-sm leading-6 text-muted-ink"><Info className="mr-1 inline size-4" /> Use the category letter from your payslip—not your National Insurance number. Your NI number is not stored.</p>
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-rule px-3 py-4 sm:px-6">
        <Button variant="outline" size="icon" className="size-11 rounded-none" onClick={() => changeMonth(-1)} aria-label="Previous month"><ChevronLeft /></Button>
        <div><h2 className="font-serif text-2xl sm:text-3xl">{monthLabel}</h2><p className="mt-1 text-sm text-muted-ink">Tap a day to add your hours and extras</p></div>
        <Button variant="outline" size="icon" className="size-11 rounded-none" onClick={() => changeMonth(1)} aria-label="Next month"><ChevronRight /></Button>
      </div>

      <div className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-rule bg-muted/60 text-xs font-semibold text-muted-ink sm:text-sm">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="py-3">{day}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: leadingBlanks }).map((_, index) => <div key={`blank-${index}`} className="min-h-20 border-b border-r border-rule bg-paper/50 sm:min-h-28" />)}
          {Array.from({ length: daysInMonth }).map((_, index) => {
            const day = index + 1;
            const key = dateKey(year, monthIndex, day);
            const shift = shiftsByDate.get(key);
            const dayGross = shift ? shift.hours * settings.hourly_rate + shift.direct_tips + shift.payroll_gratuity + shift.other_income : 0;
            return <button key={key} type="button" onClick={() => openDay(day)} className={`min-h-20 border-b border-r border-rule p-1.5 transition-colors hover:bg-muted focus-visible:z-10 sm:min-h-28 sm:p-3 ${key === today ? "bg-snowball/10" : "bg-sheet"}`} aria-label={`${key}${shift ? `, ${shift.hours} hours worked` : ", add work"}`}>
              <span className={`mx-auto grid size-7 place-items-center text-sm font-semibold ${key === today ? "bg-ink text-paper" : ""}`}>{day}</span>
              {shift ? <><span className="mt-1 block text-xs font-semibold text-ink sm:text-sm">{shift.hours}h</span><span className="mt-0.5 block text-[11px] text-muted-ink sm:text-xs">{formatMoney(dayGross, "GBP")}</span></> : <Plus className="mx-auto mt-2 size-4 text-rule" />}
            </button>;
          })}
        </div>
      </div>

      {!loaded ? <p className="px-5 py-8 text-muted-ink">Loading this month…</p> : <div className="grid divide-y divide-rule border-t border-rule sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        <div className="p-5"><Clock3 className="mx-auto size-5 text-snowball" /><p className="mt-2 text-sm text-muted-ink">Hours</p><p className="font-serif text-3xl">{estimate.hours}</p></div>
        <div className="p-5"><Banknote className="mx-auto size-5 text-snowball" /><p className="mt-2 text-sm text-muted-ink">Gross forecast</p><p className="font-serif text-3xl">{formatMoney(estimate.gross, "GBP")}</p></div>
        <div className="p-5"><Coins className="mx-auto size-5 text-avalanche" /><p className="mt-2 text-sm text-muted-ink">Tax + NI + pension</p><p className="font-serif text-3xl">{formatMoney(estimate.incomeTax + estimate.nationalInsurance + estimate.pension, "GBP")}</p></div>
        <div className="bg-ink p-5 text-paper"><p className="text-sm text-paper/70">Estimated take-home</p><p className="mt-1 font-serif text-4xl">{formatMoney(estimate.takeHome, "GBP")}</p></div>
      </div>}

      <div className="grid border-t border-rule text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="p-4"><span className="text-muted-ink">Wages</span><strong className="ml-2">{formatMoney(estimate.wages, "GBP")}</strong></div>
        <div className="border-t border-rule p-4 sm:border-l sm:border-t-0"><span className="text-muted-ink">Direct tips</span><strong className="ml-2">{formatMoney(estimate.directTips, "GBP")}</strong></div>
        <div className="border-t border-rule p-4 lg:border-l lg:border-t-0"><span className="text-muted-ink">Income tax</span><strong className="ml-2">− {formatMoney(estimate.incomeTax, "GBP")}</strong></div>
        <div className="border-t border-rule p-4 sm:border-l lg:border-t-0"><span className="text-muted-ink">Employee NI</span><strong className="ml-2">− {formatMoney(estimate.nationalInsurance, "GBP")}</strong></div>
      </div>
      <p className="border-t border-rule px-5 py-4 text-xs leading-5 text-muted-ink">UK 2026/27 estimate for England, Wales and Northern Ireland. Actual PAYE can differ because of cumulative pay, tax-code adjustments, pension method, student loans and how your workplace handles tips.</p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none sm:max-w-xl">
          <DialogHeader><DialogTitle className="font-serif text-2xl">Work on {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${draft.work_date}T12:00:00`))}</DialogTitle><DialogDescription>Enter the total for this day. Leave unused fields at zero.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Hours worked<Input aria-label="Hours worked" type="number" min="0" step="0.25" value={draft.hours} onChange={(event) => updateDraft("hours", event.target.value)} className="mt-2 h-11 rounded-none bg-white tabular-nums" /></label>
            <label className="text-sm font-semibold">Direct cash/card tips<Input aria-label="Direct tips" type="number" min="0" step="0.01" value={draft.direct_tips} onChange={(event) => updateDraft("direct_tips", event.target.value)} className="mt-2 h-11 rounded-none bg-white tabular-nums" /></label>
            <label className="text-sm font-semibold">Payrolled tips or gratuity<Input aria-label="Payrolled tips or gratuity" type="number" min="0" step="0.01" value={draft.payroll_gratuity} onChange={(event) => updateDraft("payroll_gratuity", event.target.value)} className="mt-2 h-11 rounded-none bg-white tabular-nums" /></label>
            <label className="text-sm font-semibold">Other taxable pay<Input aria-label="Other taxable pay" type="number" min="0" step="0.01" value={draft.other_income} onChange={(event) => updateDraft("other_income", event.target.value)} className="mt-2 h-11 rounded-none bg-white tabular-nums" /></label>
          </div>
          <label className="text-sm font-semibold">Note (optional)<Input aria-label="Work note" value={draft.note} onChange={(event) => updateDraft("note", event.target.value)} placeholder="Late shift, event, bank holiday…" className="mt-2 h-11 rounded-none bg-white" /></label>
          <div className="border-y border-rule py-3 text-sm"><span className="text-muted-ink">Estimated gross for the day</span><strong className="ml-2">{formatMoney(draft.hours * settings.hourly_rate + draft.direct_tips + draft.payroll_gratuity + draft.other_income, "GBP")}</strong></div>
          <DialogFooter><Button variant="outline" className="h-11 min-w-32 rounded-none" onClick={() => void clearDay()}>Clear day</Button><Button className="h-11 min-w-32 rounded-none" onClick={() => void saveDay()}>Save day</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
