import { Metadata } from "next";
import { SpendingTracker } from "@/components/SpendingTracker";

export const metadata: Metadata = { title: "Spending tracker" };

export default function SpendingPage() {
  return <SpendingTracker />;
}
