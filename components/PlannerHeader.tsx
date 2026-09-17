"use client";

import { ReactNode } from "react";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { PlannerNav, PlannerSection } from "@/components/PlannerNav";
import { CurrencyCode } from "@/lib/currency";

export function PlannerHeader({
  demo,
  active,
  currency,
  onCurrencyChange,
  status,
  action,
}: {
  demo: boolean;
  active: PlannerSection;
  currency: CurrencyCode;
  onCurrencyChange: (currency: CurrencyCode) => void;
  status: string;
  action?: ReactNode;
}) {
  const home = demo ? "/preview/month" : "/app/month";
  const statusError = status.includes("Couldn’t") || status.includes("not updated");

  return (
    <header className="border-b border-rule bg-sheet">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 py-4 lg:px-8">
        <a href={home} target="_top" className="font-serif text-xl font-semibold tracking-[-.02em] text-ink">
          Debt Payoff Planner
        </a>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <CurrencyPicker value={currency} onChange={onCurrencyChange} />
          <span aria-live="polite" className={`min-w-32 text-sm ${statusError ? "font-semibold text-destructive" : "text-muted-ink"}`}>{status}</span>
          {action}
        </div>
      </div>
      <div className="border-t border-rule bg-paper/70">
        <PlannerNav demo={demo} active={active} />
      </div>
    </header>
  );
}
