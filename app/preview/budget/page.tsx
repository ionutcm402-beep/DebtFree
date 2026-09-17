import { Metadata } from "next";
import { CategoryBudget } from "@/components/CategoryBudget";

export const metadata: Metadata = { title: "Monthly category budget — preview" };

export default function PreviewBudgetPage() {
  return <CategoryBudget demo />;
}
