import { Metadata } from "next";
import { MonthlyDashboard } from "@/components/MonthlyDashboard";

export const metadata: Metadata = { title: "This month — preview" };

export default function PreviewMonthPage() {
  return <MonthlyDashboard demo />;
}
