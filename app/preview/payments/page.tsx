import { Metadata } from "next";
import { DebtPayments } from "@/components/DebtPayments";

export const metadata: Metadata = { title: "Debt payment tracker — preview" };

export default function PreviewPaymentsPage() {
  return <DebtPayments demo />;
}
