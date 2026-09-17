import { Metadata } from "next";
import { SpendingTracker } from "@/components/SpendingTracker";

export const metadata: Metadata = { title: "Spending preview" };

export default function PreviewSpendingPage() {
  return <SpendingTracker demo />;
}
