import { Metadata } from "next";
import { MonthlyDashboard } from "@/components/MonthlyDashboard";

export const metadata: Metadata = { title: "This month" };

export default function MonthPage() {
  return <MonthlyDashboard />;
}
