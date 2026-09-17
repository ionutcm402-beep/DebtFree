import { Metadata } from "next";
import { MoneyGoals } from "@/components/MoneyGoals";

export const metadata: Metadata = { title: "Goals & money pots" };

export default function GoalsPage() {
  return <MoneyGoals />;
}
