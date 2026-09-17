import { Metadata } from "next";
import { MonthlyReview } from "@/components/MonthlyReview";

export const metadata: Metadata = { title: "Monthly review" };

export default function ReviewPage() {
  return <MonthlyReview />;
}
