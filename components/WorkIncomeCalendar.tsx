"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, CalendarDays, ChevronLeft, ChevronRight, Clock3, Gift, Info, Palmtree, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { formatMoney } from "@/lib/currency";
import { createId } from "@/lib/id";
import { loadPreviewState, savePreviewState } from "@/lib/preview-storage";
import { createClient } from "@/lib/supabase/client";
import { calculateWorkedHours, datesInPeriod, estimateUkMonthlyPay, financialYearBounds, financialYearPayPeriods, NiCategory, payPeriodForMonth, shiftsInPeriod, UkPayEstimate, WorkIncomeSettings, WorkShift } from "@/lib/uk-pay";

const defaultSettings: WorkIncomeSettings = { hourly_rate: 0, tax_code: "1257L", ni_category: "A", pension_percent: 0, holiday_allowance_days: 28, holiday_day_hours: 8, payroll_cutoff_days: 7, payroll_payday_weekday: 5, payroll_week_start: 5 };
const emptyDraft = (date: string): WorkShift => ({ id: createId(), work_date: date, entry_type: "work", start_time: "", finish_time: "", break_minutes: 0, holiday_days: 0, hours: 0, direct_tips: 0, payroll_gratuity: 0, other_income: 0, note: "" });
const niCategories: NiCategory[] = ["A", "B", "C", "D", "E", "F", "H", "I", "J", "K", "L", "M", "N", "S", "V", "Z"];
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function dateKey(year: number, month: number, day: number) { return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; }
function displayDate(value: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) { return new Intl.DateTimeFormat("en-GB", options).format(new Date(`${value}T12:00:00`)); }
function normaliseShift(shift: Record<string, unknown>): WorkShift {
  return { id: String(shift.id), work_date: String(shift.work_date), entry_type: shift.entry_type === "holiday" ? "holiday" : "work", start_time: String(shift.start_time ?? ""), finish_time: String(shift.finish_time ?? ""), break_minutes: Number(shift.break_minutes ?? 0), holiday_days: Number(shift.holiday_days ?? 0), hours: Number(shift.hours ?? 0), direct_tips: Number(shift.direct_tips ?? 0), payroll_gratuity: Number(shift.payroll_gratuity ?? 0), other_income: Number(shift.other_income ?? 0), note: String(shift.note ?? "") };
}

type Props = { demo: boolean; onForecastChange: (estimate: UkPayEstimate) => void; onStatusChange: (status: string) => void };

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
  const [year, monthNumber] = shownMonth.split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const financialYear = financialYearBounds(`${shownMonth}-15`);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoaded(false);
      if (demo) {
        const preview = loadPreviewState();
        if (!active) return;
        setShifts(preview.workShifts.map((shift) => normaliseShift(shift as unknown as Record<string, unknown>)));
        setSettings({ ...defaultSettings, ...preview.workIncomeSettings });
        setLoaded(true);
        queueMicrotask(() => { settingsReady.current = true; });
        return;
      }
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.replace("/login"); return; }
      const [shiftResult, settingsResult] = await Promise.all([
        supabase.from("work_shifts").select("id,work_date,entry_type,start_time,finish_time,break_minutes,holiday_days,hours,direct_tips,payroll_gratuity,other_income,note").gte("work_date", `${financialYear.startYear}-03-01`).lte("work_date", financialYear.end).order("work_date"),
        supabase.from("user_settings").select("hourly_rate,tax_code,ni_category,pension_percent,holiday_allowance_days,holiday_day_hours,payroll_cutoff_days,payroll_payday_weekday,payroll_week_start").maybeSingle(),
      ]);
      if (!active) return;
      if (shiftResult.error || settingsResult.error) { onStatusChange("Couldn’t load work calendar"); setLoaded(true); return; }
      setUserId(user.id);
      setShifts((shiftResult.data ?? []).map((shift) => normaliseShift(shift)));
      const saved = settingsResult.data;
      setSettings({ hourly_rate: Number(saved?.hourly_rate ?? 0), tax_code: String(saved?.tax_code ?? "1257L"), ni_category: niCategories.includes(saved?.ni_category as NiCategory) ? saved?.ni_category as NiCategory : "A", pension_percent: Number(saved?.pension_percent ?? 0), holiday_allowance_days: Number(saved?.holiday_allowance_days ?? 28), holiday_day_hours: Number(saved?.holiday_day_hours ?? 8), payroll_cutoff_days: Number(saved?.payroll_cutoff_days ?? 7), payroll_payday_weekday: Number(saved?.payroll_payday_weekday ?? 5), payroll_week_start: Number(saved?.payroll_week_start ?? 5) });
      setLoaded(true);
      queueMicrotask(() => { settingsReady.current = true; });
    };
    void load();
    return () => { active = false; };
  }, [demo, financialYear.end, financialYear.startYear, onStatusChange, shownMonth, supabase]);

  useEffect(() => {
    if (!loaded || !settingsReady.current) return;
    onStatusChange("Saving…");
    const timeout = window.setTimeout(async () => {
      if (demo) { savePreviewState({ workIncomeSettings: settings }); onStatusChange("Saved in this browser"); return; }
      if (!supabase || !userId) return;
      const { error } = await supabase.from("user_settings").upsert({ user_id: userId, ...settings }, { onConflict: "user_id" });
      onStatusChange(error ? "Couldn’t save pay settings" : "All changes saved");
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [demo, loaded, onStatusChange, settings, supabase, userId]);

  const currentPeriod = useMemo(() => payPeriodForMonth(year, monthIndex, settings.payroll_payday_weekday, settings.payroll_week_start), [monthIndex, settings.payroll_payday_weekday, settings.payroll_week_start, year]);
  const periodShifts = useMemo(() => shiftsInPeriod(shifts, currentPeriod), [currentPeriod, shifts]);
  const estimate = useMemo(() => estimateUkMonthlyPay(periodShifts, settings), [periodShifts, settings]);
  useEffect(() => { onForecastChange(estimate); }, [estimate, onForecastChange]);
  const periods = useMemo(() => financialYearPayPeriods(financialYear.startYear, settings.payroll_payday_weekday, settings.payroll_week_start), [financialYear.startYear, settings.payroll_payday_weekday, settings.payroll_week_start]);
  const periodSummaries = useMemo(() => periods.map((period) => ({ period, estimate: estimateUkMonthlyPay(shiftsInPeriod(shifts, period), settings) })), [periods, settings, shifts]);
  const yearTotals = useMemo(() => periodSummaries.reduce((total, item) => ({ gross: total.gross + item.estimate.gross, takeHome: total.takeHome + item.estimate.takeHome, tips: total.tips + item.estimate.payrollTips + item.estimate.directTips, hours: total.hours + item.estimate.hours }), { gross: 0, takeHome: 0, tips: 0, hours: 0 }), [periodSummaries]);
  const holidayUsed = shifts.filter((shift) => shift.entry_type === "holiday" && shift.work_date >= financialYear.start && shift.work_date <= financialYear.end).reduce((sum, shift) => sum + shift.holiday_days, 0);
  const holidayRemaining = Math.max(0, settings.holiday_allowance_days - holidayUsed);
  const periodDates = useMemo(() => datesInPeriod(currentPeriod), [currentPeriod]);
  const weekdayHeadings = useMemo(() => Array.from({ length: 7 }, (_, index) => weekdays[(settings.payroll_week_start + index) % 7]), [settings.payroll_week_start]);
  const today = dateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const shiftsByDate = new Map(shifts.map((shift) => [shift.work_date, shift]));
  const draftHolidayDays = Math.min(1, Math.max(0.25, draft.holiday_days || 1));
  const draftHours = draft.entry_type === "holiday"
    ? settings.holiday_day_hours * draftHolidayDays
    : draft.start_time && draft.finish_time
      ? calculateWorkedHours(draft.start_time, draft.finish_time, draft.break_minutes)
      : draft.hours;

  function changeMonth(amount: number) { settingsReady.current = false; setShownMonth(monthKey(new Date(year, monthIndex + amount, 1))); }
  function openDay(key: string) { setDraft(shiftsByDate.get(key) ?? emptyDraft(key)); setDialogOpen(true); }
  function updateDraft(field: keyof WorkShift, value: string) { const number = Math.max(0, Number(value)); const numericFields: Array<keyof WorkShift> = ["break_minutes", "holiday_days", "direct_tips", "payroll_gratuity", "other_income"]; setDraft((current) => ({ ...current, [field]: numericFields.includes(field) ? number : value })); }

  async function saveDay() {
    const savedDraft = { ...draft, hours: Math.min(24, Math.max(0, draftHours)), holiday_days: draft.entry_type === "holiday" ? draftHolidayDays : 0 };
    setShifts((current) => [...current.filter((shift) => shift.work_date !== savedDraft.work_date), savedDraft].sort((a, b) => a.work_date.localeCompare(b.work_date)));
    setDialogOpen(false); onStatusChange("Saving…");
    if (demo) { const preview = loadPreviewState(); savePreviewState({ workShifts: [...preview.workShifts.filter((shift) => shift.work_date !== savedDraft.work_date), savedDraft] }); onStatusChange("Saved in this browser"); return; }
    if (!supabase || !userId) return;
    const { error } = await supabase.from("work_shifts").upsert({ ...savedDraft, user_id: userId }, { onConflict: "id" });
    onStatusChange(error ? "Couldn’t save this shift" : "All changes saved");
  }

  async function clearDay() {
    const existing = shiftsByDate.get(draft.work_date);
    setShifts((current) => current.filter((shift) => shift.work_date !== draft.work_date)); setDialogOpen(false);
    if (demo) { const preview = loadPreviewState(); savePreviewState({ workShifts: preview.workShifts.filter((shift) => shift.work_date !== draft.work_date) }); onStatusChange("Saved in this browser"); return; }
    if (existing && supabase) { const { error } = await supabase.from("work_shifts").delete().eq("id", existing.id); onStatusChange(error ? "Couldn’t clear this day" : "All changes saved"); }
  }

  return <section className="border-y border-rule bg-sheet text-center">
    <div className="border-b border-rule px-4 py-7 sm:px-7">
      <h2 className="font-serif text-3xl">Pay settings</h2>
      <div className="mx-auto mt-6 grid max-w-5xl grid-cols-2 gap-4 sm:grid-cols-4">
        <label className="text-sm font-semibold">Hourly rate<span className="mt-2 flex items-center justify-center"><span className="mr-2 text-muted-ink">£</span><Input aria-label="Hourly rate in pounds" type="number" min="0" step="0.01" value={settings.hourly_rate} onChange={(event) => setSettings((current) => ({ ...current, hourly_rate: Math.max(0, Number(event.target.value)) }))} className="h-11 rounded-none bg-white tabular-nums" /></span></label>
        <label className="text-sm font-semibold">Tax code<Input aria-label="Tax code" value={settings.tax_code} onChange={(event) => setSettings((current) => ({ ...current, tax_code: event.target.value.toUpperCase().slice(0, 8) }))} className="mt-2 h-11 rounded-none bg-white uppercase" /></label>
        <label className="text-sm font-semibold">NI category<NativeSelect aria-label="National Insurance category" value={settings.ni_category} onChange={(event) => setSettings((current) => ({ ...current, ni_category: event.target.value as NiCategory }))} className="mt-2 h-11 w-full rounded-none bg-white text-center">{niCategories.map((category) => <NativeSelectOption key={category} value={category}>{category}</NativeSelectOption>)}</NativeSelect></label>
        <label className="text-sm font-semibold">Pension %<Input aria-label="Pension salary sacrifice percentage" type="number" min="0" max="100" step="0.1" value={settings.pension_percent} onChange={(event) => setSettings((current) => ({ ...current, pension_percent: Math.min(100, Math.max(0, Number(event.target.value))) }))} className="mt-2 h-11 rounded-none bg-white tabular-nums" /></label>
        <label className="text-sm font-semibold">Holiday allowance<Input aria-label="Holiday allowance days" type="number" min="0" step="0.5" value={settings.holiday_allowance_days} onChange={(event) => setSettings((current) => ({ ...current, holiday_allowance_days: Math.max(0, Number(event.target.value)) }))} className="mt-2 h-11 rounded-none bg-white tabular-nums" /></label>
        <label className="text-sm font-semibold">Hours per holiday day<Input aria-label="Hours per holiday day" type="number" min="0" max="24" step="0.25" value={settings.holiday_day_hours} onChange={(event) => setSettings((current) => ({ ...current, holiday_day_hours: Math.min(24, Math.max(0, Number(event.target.value))) }))} className="mt-2 h-11 rounded-none bg-white tabular-nums" /></label>
        <label className="text-sm font-semibold">Payday<NativeSelect aria-label="Payday weekday" value={String(settings.payroll_payday_weekday)} onChange={(event) => setSettings((current) => ({ ...current, payroll_payday_weekday: Number(event.target.value) }))} className="mt-2 h-11 w-full rounded-none bg-white text-center">{weekdays.map((day, index) => <NativeSelectOption key={day} value={String(index)}>Last {day}</NativeSelectOption>)}</NativeSelect></label>
        <label className="text-sm font-semibold">Work week starts<NativeSelect aria-label="Work week start day" value={String(settings.payroll_week_start)} onChange={(event) => setSettings((current) => ({ ...current, payroll_week_start: Number(event.target.value) }))} className="mt-2 h-11 w-full rounded-none bg-white text-center">{weekdays.map((day, index) => <NativeSelectOption key={day} value={String(index)}>{day}</NativeSelectOption>)}</NativeSelect></label>
      </div>
      <p className="mx-auto mt-5 max-w-3xl text-sm leading-6 text-muted-ink"><Info className="mr-1 inline size-4" /> Your pay period follows complete work weeks. It starts on {weekdays[settings.payroll_week_start]} and ends on {weekdays[(settings.payroll_week_start + 6) % 7]} one week before the last {weekdays[settings.payroll_payday_weekday]} payday. Your NI number is not stored.</p>
    </div>

    <div className="grid border-b border-rule md:grid-cols-[1fr_auto_1fr]">
      <div className="p-5"><p className="text-sm text-muted-ink">Pay period</p><p className="mt-1 font-semibold">{displayDate(currentPeriod.start)} – {displayDate(currentPeriod.cutoff, { day: "numeric", month: "short", year: "numeric" })}</p><p className="mt-1 text-sm text-muted-ink">{currentPeriod.weeks} weeks</p></div>
      <div className="border-y border-rule p-5 md:border-x md:border-y-0"><p className="text-sm text-muted-ink">Cut-off</p><p className="mt-1 font-serif text-2xl">{displayDate(currentPeriod.cutoff, { day: "numeric", month: "long" })}</p></div>
      <div className="p-5"><p className="text-sm text-muted-ink">Payday</p><p className="mt-1 font-serif text-2xl">{displayDate(currentPeriod.payday, { weekday: "short", day: "numeric", month: "long" })}</p></div>
    </div>

    <div className="flex items-center justify-between gap-3 border-b border-rule px-3 py-4 sm:px-6"><Button variant="outline" size="icon" className="size-11 rounded-none" onClick={() => changeMonth(-1)} aria-label="Previous pay period"><ChevronLeft /></Button><div><h2 className="font-serif text-2xl sm:text-3xl">{currentPeriod.label} pay period</h2><p className="mt-1 text-sm text-muted-ink">{displayDate(currentPeriod.start)}–{displayDate(currentPeriod.cutoff)} · tap a day to add a shift or holiday</p></div><Button variant="outline" size="icon" className="size-11 rounded-none" onClick={() => changeMonth(1)} aria-label="Next pay period"><ChevronRight /></Button></div>
    <div className="overflow-hidden"><div className="grid grid-cols-7 border-b border-rule bg-muted/60 text-xs font-semibold text-muted-ink sm:text-sm">{weekdayHeadings.map((day) => <div key={day} className="py-3">{day.slice(0, 3)}</div>)}</div><div className="grid grid-cols-7">
      {periodDates.map((key) => { const shift = shiftsByDate.get(key); const dayGross = shift ? shift.hours * settings.hourly_rate + shift.direct_tips + shift.payroll_gratuity + shift.other_income : 0; return <button key={key} type="button" onClick={() => openDay(key)} className={`min-h-20 border-b border-r border-rule p-1.5 transition-colors hover:bg-muted focus-visible:z-10 sm:min-h-28 sm:p-3 ${key === today ? "bg-snowball/10" : "bg-sheet"}`} aria-label={`${key}${shift ? shift.entry_type === "holiday" ? ", paid holiday" : `, ${shift.hours} hours worked` : ", add work"}`}><span className={`mx-auto grid min-w-11 place-items-center text-xs font-semibold sm:text-sm ${key === today ? "bg-ink px-1 text-paper" : ""}`}>{displayDate(key, { day: "numeric", month: "short" })}</span>{shift ? <>{shift.entry_type === "holiday" ? <Palmtree className="mx-auto mt-1 size-4 text-positive" /> : <span className="mt-1 block text-xs font-semibold sm:text-sm">{shift.hours}h</span>}<span className="mt-0.5 block text-[11px] text-muted-ink sm:text-xs">{formatMoney(dayGross, "GBP")}</span></> : <Plus className="mx-auto mt-2 size-4 text-rule" />}</button>; })}
    </div></div>

    {!loaded ? <p className="px-5 py-8 text-muted-ink">Loading your pay year…</p> : <><div className="grid divide-y divide-rule border-t border-rule sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4"><div className="p-5"><Clock3 className="mx-auto size-5 text-snowball" /><p className="mt-2 text-sm text-muted-ink">Paid hours</p><p className="font-serif text-3xl">{estimate.hours}</p></div><div className="p-5"><Gift className="mx-auto size-5 text-avalanche" /><p className="mt-2 text-sm text-muted-ink">Payroll tips</p><p className="font-serif text-3xl">{formatMoney(estimate.payrollTips, "GBP")}</p></div><div className="p-5"><Banknote className="mx-auto size-5 text-snowball" /><p className="mt-2 text-sm text-muted-ink">Gross this pay period</p><p className="font-serif text-3xl">{formatMoney(estimate.gross, "GBP")}</p></div><div className="bg-ink p-5 text-paper"><p className="text-sm text-paper/70">Estimated take-home</p><p className="mt-1 font-serif text-4xl">{formatMoney(estimate.takeHome, "GBP")}</p></div></div>
      <div className="grid border-t border-rule text-sm sm:grid-cols-3 lg:grid-cols-6"><div className="p-4"><span className="text-muted-ink">Holiday pay</span><strong className="ml-2">{formatMoney(estimate.holidayPay, "GBP")}</strong></div><div className="border-t border-rule p-4 sm:border-l sm:border-t-0"><span className="text-muted-ink">Direct tips</span><strong className="ml-2">{formatMoney(estimate.directTips, "GBP")}</strong></div><div className="border-t border-rule p-4 sm:border-l sm:border-t-0"><span className="text-muted-ink">Other pay</span><strong className="ml-2">{formatMoney(estimate.otherIncome, "GBP")}</strong></div><div className="border-t border-rule p-4 lg:border-l lg:border-t-0"><span className="text-muted-ink">Tax</span><strong className="ml-2">− {formatMoney(estimate.incomeTax, "GBP")}</strong></div><div className="border-t border-rule p-4 sm:border-l"><span className="text-muted-ink">NI</span><strong className="ml-2">− {formatMoney(estimate.nationalInsurance, "GBP")}</strong></div><div className="border-t border-rule p-4 sm:border-l"><span className="text-muted-ink">Pension</span><strong className="ml-2">− {formatMoney(estimate.pension, "GBP")}</strong></div></div></>}

    <div className="grid border-t border-rule md:grid-cols-[.7fr_1.3fr]"><div className="p-7 md:border-r md:border-rule"><Palmtree className="mx-auto size-6 text-positive" /><h3 className="mt-3 font-serif text-2xl">Holiday {financialYear.label}</h3><p className="mt-3 font-serif text-4xl">{holidayRemaining}<span className="ml-2 text-lg text-muted-ink">days left</span></p><p className="mt-2 text-sm text-muted-ink">{holidayUsed} used from {settings.holiday_allowance_days} days</p></div><div className="border-t border-rule p-7 md:border-t-0"><CalendarDays className="mx-auto size-6 text-snowball" /><h3 className="mt-3 font-serif text-2xl">Financial year {financialYear.label}</h3><div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4"><div><p className="text-sm text-muted-ink">Hours</p><strong>{Math.round(yearTotals.hours * 100) / 100}</strong></div><div><p className="text-sm text-muted-ink">Tips</p><strong>{formatMoney(yearTotals.tips, "GBP")}</strong></div><div><p className="text-sm text-muted-ink">Gross</p><strong>{formatMoney(yearTotals.gross, "GBP")}</strong></div><div><p className="text-sm text-muted-ink">Take-home</p><strong>{formatMoney(yearTotals.takeHome, "GBP")}</strong></div></div></div></div>
    <div className="border-t border-rule"><div className="px-5 py-6"><h3 className="font-serif text-3xl">All pay periods</h3><p className="mt-2 text-sm text-muted-ink">Every payday in the {financialYear.label} financial year</p></div><div className="divide-y divide-rule border-t border-rule">{periodSummaries.map(({ period, estimate: summary }) => <div key={period.payday} className={`grid gap-3 px-4 py-4 text-sm sm:grid-cols-[1.2fr_.8fr_.7fr_.7fr_.8fr] sm:items-center ${period.payday === currentPeriod.payday ? "bg-snowball/10" : ""}`}><div><strong className="block">{period.label}</strong><span className="text-muted-ink">{displayDate(period.start)}–{displayDate(period.cutoff)} · {period.weeks} weeks</span></div><div><span className="text-muted-ink sm:block">Payday </span><strong>{displayDate(period.payday)}</strong></div><div><span className="text-muted-ink sm:block">Hours </span><strong>{summary.hours}</strong></div><div><span className="text-muted-ink sm:block">Payroll tips </span><strong>{formatMoney(summary.payrollTips, "GBP")}</strong></div><div><span className="text-muted-ink sm:block">Take-home </span><strong>{formatMoney(summary.takeHome, "GBP")}</strong></div></div>)}</div></div>
    <p className="border-t border-rule px-5 py-4 text-xs leading-5 text-muted-ink">UK 2026/27 estimate for England, Wales and Northern Ireland. Actual PAYE and holiday pay can differ because of cumulative pay, average-pay rules, tax-code adjustments, pension method, student loans and how your employer handles tips.</p>

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-none sm:max-w-xl"><DialogHeader><DialogTitle className="font-serif text-2xl">{displayDate(draft.work_date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</DialogTitle><DialogDescription>Add a shift or record paid holiday for this date.</DialogDescription></DialogHeader>
      <label className="text-sm font-semibold">Day type<NativeSelect aria-label="Day type" value={draft.entry_type} onChange={(event) => updateDraft("entry_type", event.target.value)} className="mt-2 h-11 w-full rounded-none bg-white text-center"><NativeSelectOption value="work">Worked shift</NativeSelectOption><NativeSelectOption value="holiday">Paid holiday</NativeSelectOption></NativeSelect></label>
      {draft.entry_type === "work" ? <><div className="grid grid-cols-2 gap-4"><label className="text-sm font-semibold">Start time<Input aria-label="Shift start time" type="time" value={draft.start_time} onChange={(event) => updateDraft("start_time", event.target.value)} className="mt-2 h-11 rounded-none bg-white" /></label><label className="text-sm font-semibold">Finish time<Input aria-label="Shift finish time" type="time" value={draft.finish_time} onChange={(event) => updateDraft("finish_time", event.target.value)} className="mt-2 h-11 rounded-none bg-white" /></label></div><label className="text-sm font-semibold">Unpaid break (minutes)<Input aria-label="Unpaid break minutes" type="number" min="0" max="720" step="5" value={draft.break_minutes} onChange={(event) => updateDraft("break_minutes", event.target.value)} className="mx-auto mt-2 h-11 max-w-48 rounded-none bg-white tabular-nums" /></label><div className="border-y border-rule py-3"><span className="text-sm text-muted-ink">Calculated paid hours</span><strong className="ml-2 text-lg">{draftHours}</strong></div></> : <div className="grid grid-cols-2 gap-4"><label className="text-sm font-semibold">Holiday days<Input aria-label="Holiday days used" type="number" min="0.25" max="1" step="0.25" value={draft.holiday_days || 1} onChange={(event) => updateDraft("holiday_days", event.target.value)} className="mt-2 h-11 rounded-none bg-white tabular-nums" /></label><div className="border border-rule bg-muted p-3"><p className="text-sm text-muted-ink">Paid hours</p><strong className="text-xl">{draftHours}</strong></div></div>}
      <div className="grid gap-4 sm:grid-cols-3"><label className="text-sm font-semibold">Direct tips<Input aria-label="Direct tips" type="number" min="0" step="0.01" value={draft.direct_tips} onChange={(event) => updateDraft("direct_tips", event.target.value)} className="mt-2 h-11 rounded-none bg-white tabular-nums" /></label><label className="text-sm font-semibold">Payroll tips<Input aria-label="Payroll tips or gratuity" type="number" min="0" step="0.01" value={draft.payroll_gratuity} onChange={(event) => updateDraft("payroll_gratuity", event.target.value)} className="mt-2 h-11 rounded-none bg-white tabular-nums" /></label><label className="text-sm font-semibold">Other pay<Input aria-label="Other taxable pay" type="number" min="0" step="0.01" value={draft.other_income} onChange={(event) => updateDraft("other_income", event.target.value)} className="mt-2 h-11 rounded-none bg-white tabular-nums" /></label></div>
      <label className="text-sm font-semibold">Note (optional)<Input aria-label="Work note" value={draft.note} onChange={(event) => updateDraft("note", event.target.value)} placeholder="Late shift, event, bank holiday…" className="mt-2 h-11 rounded-none bg-white" /></label><div className="border-y border-rule py-3 text-sm"><span className="text-muted-ink">Estimated gross for the day</span><strong className="ml-2">{formatMoney(draftHours * settings.hourly_rate + draft.direct_tips + draft.payroll_gratuity + draft.other_income, "GBP")}</strong></div><DialogFooter><Button variant="outline" className="h-11 min-w-32 rounded-none" onClick={() => void clearDay()}>Clear day</Button><Button className="h-11 min-w-32 rounded-none" onClick={() => void saveDay()}>Save day</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}
