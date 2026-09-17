import { Metadata } from "next";
import { CashflowForecast } from "@/components/CashflowForecast";

export const metadata: Metadata = { title: "Payday cash-flow forecast — preview" };

export default function PreviewForecastPage() {
  return <CashflowForecast demo />;
}
