import { Metadata } from "next";
import { DebtPayments } from "@/components/DebtPayments";

export const metadata: Metadata = { title: "Debt payment tracker" };

export default function PaymentsPage() {
  return <DebtPayments />;
}
