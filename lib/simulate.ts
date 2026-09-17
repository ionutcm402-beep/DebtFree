export type DebtInput = {
  id: string;
  name: string;
  balance: number;
  apr: number;
  min_payment: number;
  extra_payment?: number;
  start_date?: string;
  account_type?: string;
};

export type PayoffMethod = "avalanche" | "snowball";
export type SimulationPoint = { month: number; balance: number };
export type SimulationResult = {
  method: PayoffMethod;
  months: number;
  totalInterest: number;
  balances: SimulationPoint[];
  completed: boolean;
  warningDebtIds: string[];
  payoffMonthByDebt: Record<string, number>;
};

export type TargetPaymentResult = {
  method: PayoffMethod;
  targetMonths: number;
  totalMonthlyPayment: number;
  extraPayment: number;
  totalInterest: number;
  completed: boolean;
};

const cents = (value: number) => Math.max(0, Math.round(value * 100) / 100);

export function simulatePayoff(sourceDebts: DebtInput[], extraPayment: number, method: PayoffMethod, maxMonths = 600): SimulationResult {
  const debts = sourceDebts.filter((debt) => debt.balance > 0).map((debt) => ({ ...debt, remaining: cents(debt.balance) }));
  const monthlyBudget = debts.reduce((sum, debt) => sum + Math.max(0, debt.min_payment) + Math.max(0, debt.extra_payment ?? 0), 0) + Math.max(0, extraPayment);
  const warningDebtIds = debts.filter((debt) => debt.min_payment <= debt.balance * (debt.apr / 100 / 12) && debt.apr > 0).map((debt) => debt.id);
  const balances: SimulationPoint[] = [{ month: 0, balance: cents(debts.reduce((sum, debt) => sum + debt.remaining, 0)) }];
  const payoffMonthByDebt: Record<string, number> = {};
  let totalInterest = 0;
  let month = 0;

  while (debts.some((debt) => debt.remaining > 0) && month < maxMonths) {
    month += 1;
    let budget = monthlyBudget;
    for (const debt of debts) {
      if (debt.remaining <= 0) continue;
      const interest = debt.remaining * (debt.apr / 100 / 12);
      debt.remaining = cents(debt.remaining + interest);
      totalInterest += interest;
    }
    for (const debt of debts) {
      if (debt.remaining <= 0 || budget <= 0) continue;
      const payment = Math.min(debt.remaining, Math.max(0, debt.min_payment), budget);
      debt.remaining = cents(debt.remaining - payment);
      budget = cents(budget - payment);
      if (debt.remaining <= 0) payoffMonthByDebt[debt.id] = month;
    }
    const priority = [...debts].sort((a, b) => method === "avalanche" ? b.apr - a.apr || a.remaining - b.remaining : a.remaining - b.remaining || b.apr - a.apr);
    for (const debt of priority) {
      if (debt.remaining <= 0 || budget <= 0) continue;
      const payment = Math.min(debt.remaining, budget);
      debt.remaining = cents(debt.remaining - payment);
      budget = cents(budget - payment);
      if (debt.remaining <= 0) payoffMonthByDebt[debt.id] = month;
    }
    balances.push({ month, balance: cents(debts.reduce((sum, debt) => sum + debt.remaining, 0)) });
  }

  return { method, months: month, totalInterest: cents(totalInterest), balances, completed: !debts.some((debt) => debt.remaining > 0), warningDebtIds, payoffMonthByDebt };
}

export function paymentForTarget(sourceDebts: DebtInput[], targetMonths: number, method: PayoffMethod): TargetPaymentResult {
  const debts = sourceDebts.filter((debt) => debt.balance > 0);
  const minimumTotal = debts.reduce((sum, debt) => sum + Math.max(0, debt.min_payment) + Math.max(0, debt.extra_payment ?? 0), 0);
  if (!debts.length) return { method, targetMonths, totalMonthlyPayment: 0, extraPayment: 0, totalInterest: 0, completed: true };

  const current = simulatePayoff(debts, 0, method, targetMonths);
  if (current.completed) {
    return { method, targetMonths, totalMonthlyPayment: cents(minimumTotal), extraPayment: 0, totalInterest: current.totalInterest, completed: true };
  }

  let low = 0;
  let high = Math.max(100, debts.reduce((sum, debt) => sum + debt.balance, 0));
  while (!simulatePayoff(debts, high, method, targetMonths).completed && high < 1_000_000_000) high *= 2;
  if (high >= 1_000_000_000) return { method, targetMonths, totalMonthlyPayment: high, extraPayment: high, totalInterest: 0, completed: false };

  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    if (simulatePayoff(debts, mid, method, targetMonths).completed) high = mid;
    else low = mid;
  }
  const extraPayment = Math.ceil(high * 100) / 100;
  const result = simulatePayoff(debts, extraPayment, method, targetMonths);
  return {
    method,
    targetMonths,
    totalMonthlyPayment: cents(minimumTotal + extraPayment),
    extraPayment,
    totalInterest: result.totalInterest,
    completed: result.completed,
  };
}

export function estimateApr(balance: number, payment: number, months: number): number | null {
  if (balance <= 0 || payment <= 0 || months <= 0 || payment * months < balance) return null;
  if (Math.abs(payment * months - balance) < 0.000001) return 0;
  const presentValue = (rate: number) => payment * (1 - Math.pow(1 + rate, -months)) / rate;
  let low = 0;
  let high = 1;
  if (presentValue(high) > balance) return null;
  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2;
    if (presentValue(mid) > balance) low = mid;
    else high = mid;
  }
  return ((low + high) / 2) * 12 * 100;
}

export function debtFreeDate(months: number, completed: boolean): string {
  if (!completed) return "Beyond 50 years";
  if (months === 0) return "You’re debt-free";
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(date);
}
