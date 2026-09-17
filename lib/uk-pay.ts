export type NiCategory = "A" | "B" | "C" | "D" | "E" | "F" | "H" | "I" | "J" | "K" | "L" | "M" | "N" | "S" | "V" | "Z";

export type WorkIncomeSettings = {
  hourly_rate: number;
  tax_code: string;
  ni_category: NiCategory;
  pension_percent: number;
  holiday_allowance_days: number;
  holiday_day_hours: number;
  payroll_cutoff_days: number;
  payroll_payday_weekday: number;
  payroll_week_start: number;
};

export type WorkShift = {
  id: string;
  work_date: string;
  entry_type: "work" | "holiday";
  start_time: string;
  finish_time: string;
  break_minutes: number;
  holiday_days: number;
  hours: number;
  direct_tips: number;
  payroll_gratuity: number;
  other_income: number;
  note: string;
};

export type UkPayEstimate = {
  hours: number;
  holidayHours: number;
  holidayPay: number;
  wages: number;
  directTips: number;
  payrollTips: number;
  otherIncome: number;
  payrollExtras: number;
  gross: number;
  pension: number;
  incomeTax: number;
  nationalInsurance: number;
  takeHome: number;
  annualEquivalent: number;
};

export type PayPeriod = {
  start: string;
  cutoff: string;
  payday: string;
  weeks: number;
  label: string;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function dateFromKey(value: string) {
  return new Date(`${value}T12:00:00`);
}

function keyFromDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function lastWeekday(year: number, monthIndex: number, weekday: number) {
  const date = new Date(year, monthIndex + 1, 0, 12);
  while (date.getDay() !== weekday) date.setDate(date.getDate() - 1);
  return date;
}

function previousWeekday(value: Date, weekday: number) {
  const date = addDays(value, -1);
  while (date.getDay() !== weekday) date.setDate(date.getDate() - 1);
  return date;
}

export function calculateWorkedHours(startTime: string, finishTime: string, breakMinutes: number) {
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(finishTime)) return 0;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [finishHour, finishMinute] = finishTime.split(":").map(Number);
  let minutes = finishHour * 60 + finishMinute - (startHour * 60 + startMinute);
  if (minutes <= 0) minutes += 24 * 60;
  return money(Math.max(0, minutes - Math.max(0, breakMinutes)) / 60);
}

export function financialYearBounds(dateValue: string) {
  const date = dateFromKey(dateValue);
  const aprilSix = new Date(date.getFullYear(), 3, 6, 12);
  const startYear = date >= aprilSix ? date.getFullYear() : date.getFullYear() - 1;
  return { startYear, start: `${startYear}-04-06`, end: `${startYear + 1}-04-05`, label: `${startYear}/${String(startYear + 1).slice(-2)}` };
}

export function payPeriodForMonth(year: number, monthIndex: number, paydayWeekday = 5, weekStart = 5): PayPeriod {
  const safePayday = Math.min(6, Math.max(0, Math.round(paydayWeekday)));
  const safeWeekStart = Math.min(6, Math.max(0, Math.round(weekStart)));
  const weekEnd = (safeWeekStart + 6) % 7;
  const payday = lastWeekday(year, monthIndex, safePayday);
  const previousMonth = new Date(year, monthIndex - 1, 1, 12);
  const previousPayday = lastWeekday(previousMonth.getFullYear(), previousMonth.getMonth(), safePayday);
  const cutoff = previousWeekday(addDays(payday, -7), weekEnd);
  const previousCutoff = previousWeekday(addDays(previousPayday, -7), weekEnd);
  const start = addDays(previousCutoff, 1);
  const days = Math.round((cutoff.getTime() - start.getTime()) / 86_400_000) + 1;
  return {
    start: keyFromDate(start),
    cutoff: keyFromDate(cutoff),
    payday: keyFromDate(payday),
    weeks: Math.round(days / 7),
    label: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(payday),
  };
}

export function financialYearPayPeriods(startYear: number, paydayWeekday = 5, weekStart = 5) {
  return Array.from({ length: 12 }, (_, index) => payPeriodForMonth(startYear + Math.floor((index + 3) / 12), (index + 3) % 12, paydayWeekday, weekStart));
}

export function datesInPeriod(period: PayPeriod) {
  const dates: string[] = [];
  let date = dateFromKey(period.start);
  const end = dateFromKey(period.cutoff);
  while (date <= end) {
    dates.push(keyFromDate(date));
    date = addDays(date, 1);
  }
  return dates;
}

export function shiftsInPeriod(shifts: WorkShift[], period: PayPeriod) {
  return shifts.filter((shift) => shift.work_date >= period.start && shift.work_date <= period.cutoff);
}

function taxCodeAllowance(taxCode: string): number {
  const code = taxCode.toUpperCase().replace(/\s/g, "");
  if (code === "NT") return Number.POSITIVE_INFINITY;
  if (["BR", "D0", "D1", "0T"].includes(code)) return 0;
  const match = code.match(/^(?:S|C)?(\d{1,4})[A-Z]$/);
  return match ? Number(match[1]) * 10 : 12_570;
}

function estimateIncomeTax(monthlyIncome: number, taxCode: string): number {
  const code = taxCode.toUpperCase().replace(/\s/g, "");
  const annualIncome = Math.max(0, monthlyIncome) * 12;
  if (code === "NT") return 0;
  if (code === "BR") return money(annualIncome * 0.2 / 12);
  if (code === "D0") return money(annualIncome * 0.4 / 12);
  if (code === "D1") return money(annualIncome * 0.45 / 12);

  const codedAllowance = taxCodeAllowance(code);
  const taperedAllowance = Number.isFinite(codedAllowance)
    ? Math.max(0, codedAllowance - Math.max(0, annualIncome - 100_000) / 2)
    : codedAllowance;
  const taxable = Math.max(0, annualIncome - taperedAllowance);
  const basic = Math.min(taxable, 37_700) * 0.2;
  const higher = Math.min(Math.max(0, taxable - 37_700), 74_870) * 0.4;
  const additional = Math.max(0, taxable - 112_570) * 0.45;
  return money((basic + higher + additional) / 12);
}

function estimateNationalInsurance(monthlyNiPay: number, category: NiCategory): number {
  const pay = Math.max(0, monthlyNiPay);
  const rates: Record<NiCategory, [number, number]> = {
    A: [0.08, 0.02], B: [0.0185, 0.02], C: [0, 0], D: [0.02, 0.02], E: [0.0185, 0.02],
    F: [0.08, 0.02], H: [0.08, 0.02], I: [0.0185, 0.02], J: [0.02, 0.02], K: [0, 0],
    L: [0.02, 0.02], M: [0.08, 0.02], N: [0.08, 0.02], S: [0, 0], V: [0.08, 0.02], Z: [0.02, 0.02],
  };
  const [mainRate, upperRate] = rates[category] ?? rates.A;
  const main = Math.max(0, Math.min(pay, 4_189) - 1_048) * mainRate;
  const upper = Math.max(0, pay - 4_189) * upperRate;
  return money(main + upper);
}

export function estimateUkMonthlyPay(shifts: WorkShift[], settings: WorkIncomeSettings): UkPayEstimate {
  const hours = shifts.reduce((sum, shift) => sum + Math.max(0, Number(shift.hours)), 0);
  const wages = hours * Math.max(0, Number(settings.hourly_rate));
  const holidayHours = shifts.filter((shift) => shift.entry_type === "holiday").reduce((sum, shift) => sum + Math.max(0, Number(shift.hours)), 0);
  const holidayPay = holidayHours * Math.max(0, Number(settings.hourly_rate));
  const directTips = shifts.reduce((sum, shift) => sum + Math.max(0, Number(shift.direct_tips)), 0);
  const payrollTips = shifts.reduce((sum, shift) => sum + Math.max(0, Number(shift.payroll_gratuity)), 0);
  const otherIncome = shifts.reduce((sum, shift) => sum + Math.max(0, Number(shift.other_income)), 0);
  const payrollExtras = payrollTips + otherIncome;
  const gross = wages + directTips + payrollExtras;
  const niPayBeforePension = wages + payrollExtras;
  const pension = niPayBeforePension * Math.min(100, Math.max(0, Number(settings.pension_percent))) / 100;
  const taxableAfterPension = Math.max(0, gross - pension);
  const niPayAfterPension = Math.max(0, niPayBeforePension - pension);
  const incomeTax = estimateIncomeTax(taxableAfterPension, settings.tax_code);
  const nationalInsurance = estimateNationalInsurance(niPayAfterPension, settings.ni_category);

  return {
    hours: money(hours),
    holidayHours: money(holidayHours),
    holidayPay: money(holidayPay),
    wages: money(wages),
    directTips: money(directTips),
    payrollTips: money(payrollTips),
    otherIncome: money(otherIncome),
    payrollExtras: money(payrollExtras),
    gross: money(gross),
    pension: money(pension),
    incomeTax,
    nationalInsurance,
    takeHome: money(Math.max(0, gross - pension - incomeTax - nationalInsurance)),
    annualEquivalent: money(gross * 12),
  };
}
