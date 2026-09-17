import { Metadata } from "next";
import { CategoryBudget } from "@/components/CategoryBudget";

export const metadata: Metadata = { title: "Monthly category budget" };

export default function BudgetPage() {
  return <CategoryBudget />;
}
