import { Metadata } from "next";
import { CashflowForecast } from "@/components/CashflowForecast";

export const metadata: Metadata = { title: "Payday cash-flow forecast" };

export default function ForecastPage() {
  return <CashflowForecast />;
}
