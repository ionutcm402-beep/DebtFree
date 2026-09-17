export type ForecastCashflow = { id: string; kind: "income" | "essential"; name: string; amount: number; pay_day: number };
export type ForecastBill = { id: string; name: string; amount: number; due_day: number };
export type ForecastSubscription = { id: string; name: string; amount: number; billing_cycle: "monthly" | "annual"; renewal_date: string; decision: "keep" | "review" | "cancel" };
export type ForecastDebt = { id: string; name: string; min_payment: number; extra_payment?: number };
export type ForecastSettings = { starting_balance: number; horizon: 30 | 60 | 90; debt_payment_day: number };
export type ForecastEvent = { id: string; date: string; name: string; kind: "income" | "bill" | "subscription" | "debt"; amount: number };
export type ForecastPoint = { date: string; label: string; balance: number };

const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function occursOnDay(date: Date, day: number) {
  return date.getDate() === Math.min(Math.max(1, day), daysInMonth(date.getFullYear(), date.getMonth()));
}

const money = (value: number) => Math.round(value * 100) / 100;

export function buildCashflowForecast(input: {
  cashflow: ForecastCashflow[];
  bills: ForecastBill[];
  subscriptions: ForecastSubscription[];
  debts: ForecastDebt[];
  settings: ForecastSettings;
  today?: Date;
}) {
  const { cashflow, bills, subscriptions, debts, settings } = input;
  const todaySource = input.today ?? new Date();
  const today = new Date(todaySource.getFullYear(), todaySource.getMonth(), todaySource.getDate(), 12);
  const incomes = cashflow.filter((entry) => entry.kind === "income");
  const essentialTotal = cashflow.filter((entry) => entry.kind === "essential").reduce((sum, entry) => sum + entry.amount, 0);
  const monthlyBills = bills.reduce((sum, bill) => sum + bill.amount, 0);
  const monthlySubscriptions = subscriptions.filter((item) => item.decision !== "cancel").reduce((sum, item) => sum + (item.billing_cycle === "annual" ? item.amount / 12 : item.amount), 0);
  const dailyReserve = Math.max(0, essentialTotal - monthlyBills - monthlySubscriptions) / 30.4375;
  const debtPayment = debts.reduce((sum, debt) => sum + debt.min_payment + (debt.extra_payment ?? 0), 0);
  const events: ForecastEvent[] = [];
  const points: ForecastPoint[] = [];
  let balance = settings.starting_balance;

  for (let offset = 0; offset <= settings.horizon; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const key = dateKey(date);
    const dayEvents: ForecastEvent[] = [];

    for (const income of incomes) {
      if (occursOnDay(date, income.pay_day)) dayEvents.push({ id: `${key}-income-${income.id}`, date: key, name: income.name, kind: "income", amount: income.amount });
    }
    for (const bill of bills) {
      if (occursOnDay(date, bill.due_day)) dayEvents.push({ id: `${key}-bill-${bill.id}`, date: key, name: bill.name, kind: "bill", amount: -bill.amount });
    }
    if (debtPayment > 0 && occursOnDay(date, settings.debt_payment_day)) {
      dayEvents.push({ id: `${key}-debt`, date: key, name: "Debt payments", kind: "debt", amount: -debtPayment });
    }
    for (const item of subscriptions) {
      if (item.decision === "cancel") continue;
      const firstRenewal = new Date(`${item.renewal_date}T12:00:00`);
      if (Number.isNaN(firstRenewal.getTime()) || date < firstRenewal) continue;
      const monthlyMatch = item.billing_cycle === "monthly" && occursOnDay(date, firstRenewal.getDate());
      const annualMatch = item.billing_cycle === "annual" && date.getMonth() === firstRenewal.getMonth() && occursOnDay(date, firstRenewal.getDate());
      if (monthlyMatch || annualMatch) dayEvents.push({ id: `${key}-subscription-${item.id}`, date: key, name: item.name, kind: "subscription", amount: -item.amount });
    }

    for (const event of dayEvents) balance += event.amount;
    balance -= dailyReserve;
    events.push(...dayEvents);
    points.push({ date: key, label: date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), balance: money(balance) });
  }

  const nextIncome = events.find((event) => event.kind === "income");
  const nextIncomeDate = nextIncome ? new Date(`${nextIncome.date}T12:00:00`) : null;
  const daysToIncome = nextIncomeDate ? Math.max(0, Math.round((nextIncomeDate.getTime() - today.getTime()) / 86_400_000)) : settings.horizon;
  const outBeforeIncome = events
    .filter((event) => event.amount < 0 && (!nextIncome || event.date <= nextIncome.date))
    .reduce((sum, event) => sum + Math.abs(event.amount), 0) + dailyReserve * (daysToIncome + 1);
  const safeUntilPayday = Math.max(0, money(settings.starting_balance - outBeforeIncome));
  const weeksToIncome = Math.max(1, Math.ceil((daysToIncome + 1) / 7));
  const lowestPoint = points.reduce((lowest, point) => point.balance < lowest.balance ? point : lowest, points[0] ?? { date: dateKey(today), label: "Today", balance: settings.starting_balance });
  const firstNegative = points.find((point) => point.balance < 0) ?? null;

  return {
    points,
    events: events.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount),
    dailyReserve: money(dailyReserve),
    safeUntilPayday,
    safePerWeek: money(safeUntilPayday / weeksToIncome),
    nextIncome,
    lowestPoint,
    firstNegative,
  };
}
