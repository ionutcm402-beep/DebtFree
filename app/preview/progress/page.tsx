import { Metadata } from "next";
import { DebtProgress } from "@/components/DebtProgress";

export const metadata: Metadata = { title: "Debt progress — preview" };

export default function PreviewProgressPage() {
  return <DebtProgress demo />;
}
