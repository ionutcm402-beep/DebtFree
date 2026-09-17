import { Metadata } from "next";
import { MonthlyReview } from "@/components/MonthlyReview";

export const metadata: Metadata = { title: "Monthly review — preview" };

export default function PreviewReviewPage() {
  return <MonthlyReview demo />;
}
