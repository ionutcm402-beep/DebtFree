import { Metadata } from "next";
import { MoneyGoals } from "@/components/MoneyGoals";

export const metadata: Metadata = { title: "Goals & money pots — preview" };

export default function PreviewGoalsPage() {
  return <MoneyGoals demo />;
}
