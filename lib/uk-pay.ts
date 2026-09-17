export type NiCategory = "A" | "B" | "C" | "D" | "E" | "F" | "H" | "I" | "J" | "K" | "L" | "M" | "N" | "S" | "V" | "Z";

export type WorkIncomeSettings = {
  hourly_rate: number;
  tax_code: string;
  ni_category: NiCategory;
  pension_percent: number;
};

export type WorkShift = {
  id: string;
  work_date: string;
  hours: number;
  direct_tips: number;
  payroll_gratuity: number;
  other_income: number;
  note: string;
};

export type UkPayEstimate = {
  hours: number;
  wages: number;
  directTips: number;
  payrollExtras: number;
  gross: number;
  pension: number;
  incomeTax: number;
  nationalInsurance: number;
  takeHome: number;
  annualEquivalent: number;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

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
  const directTips = shifts.reduce((sum, shift) => sum + Math.max(0, Number(shift.direct_tips)), 0);
  const payrollExtras = shifts.reduce((sum, shift) => sum + Math.max(0, Number(shift.payroll_gratuity)) + Math.max(0, Number(shift.other_income)), 0);
  const gross = wages + directTips + payrollExtras;
  const niPayBeforePension = wages + payrollExtras;
  const pension = niPayBeforePension * Math.min(100, Math.max(0, Number(settings.pension_percent))) / 100;
  const taxableAfterPension = Math.max(0, gross - pension);
  const niPayAfterPension = Math.max(0, niPayBeforePension - pension);
  const incomeTax = estimateIncomeTax(taxableAfterPension, settings.tax_code);
  const nationalInsurance = estimateNationalInsurance(niPayAfterPension, settings.ni_category);

  return {
    hours: money(hours),
    wages: money(wages),
    directTips: money(directTips),
    payrollExtras: money(payrollExtras),
    gross: money(gross),
    pension: money(pension),
    incomeTax,
    nationalInsurance,
    takeHome: money(Math.max(0, gross - pension - incomeTax - nationalInsurance)),
    annualEquivalent: money(gross * 12),
  };
}
