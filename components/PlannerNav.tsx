export type PlannerSection = "month" | "forecast" | "review" | "plan" | "payments" | "progress" | "income" | "bills" | "subscriptions" | "spending" | "budget" | "goals" | "target" | "ledger";

export function PlannerNav({ demo, active }: { demo: boolean; active: PlannerSection }) {
  const base = demo ? "/preview" : "/app";
  const links = [
    { id: "month", label: "This month", href: `${base}/month`, group: "overview" },
    { id: "forecast", label: "Cash forecast", href: `${base}/forecast`, group: "overview" },
    { id: "review", label: "Review", href: `${base}/review`, group: "overview" },
    { id: "plan", label: "Debt plan", href: base, group: "debt" },
    { id: "payments", label: "Payments", href: `${base}/payments`, group: "debt" },
    { id: "progress", label: "Progress", href: `${base}/progress`, group: "debt" },
    { id: "target", label: "Payoff target", href: `${base}/target`, group: "debt" },
    { id: "income", label: "Income", href: `${base}/income`, group: "daily" },
    { id: "bills", label: "Bills", href: `${base}/bills`, group: "daily" },
    { id: "subscriptions", label: "Subscriptions", href: `${base}/subscriptions`, group: "daily" },
    { id: "spending", label: "Spending", href: `${base}/spending`, group: "daily" },
    { id: "budget", label: "Budget", href: `${base}/budget`, group: "daily" },
    { id: "goals", label: "Goals", href: `${base}/goals`, group: "future" },
    { id: "ledger", label: "Money ledger", href: `${base}/ledger`, group: "future" },
  ] as const;

  return (
    <nav aria-label="Planner sections" className="w-full overflow-x-auto [scrollbar-width:thin] lg:overflow-visible">
      <div className="mx-auto flex w-max min-w-full items-center justify-start gap-1 px-4 py-2 lg:w-full lg:flex-wrap lg:justify-center">
        {links.map((link, index) => (
          <a
            key={link.id}
            href={link.href}
            target="_top"
            aria-current={active === link.id ? "page" : undefined}
            className={`inline-flex h-11 items-center justify-center whitespace-nowrap border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${index > 0 && links[index - 1].group !== link.group ? "ml-3" : ""} ${active === link.id ? "border-ink bg-ink text-paper" : "border-transparent text-muted-ink hover:border-rule hover:bg-muted hover:text-ink"}`}
          >
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
