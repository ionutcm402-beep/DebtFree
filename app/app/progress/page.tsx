import { Metadata } from "next";
import { DebtProgress } from "@/components/DebtProgress";

export const metadata: Metadata = { title: "Debt progress" };

export default function ProgressPage() {
  return <DebtProgress />;
}
