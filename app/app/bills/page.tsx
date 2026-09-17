import { Metadata } from "next";
import { BillCalendar } from "@/components/BillCalendar";

export const metadata: Metadata = { title: "Bill calendar" };

export default function BillsPage() {
  return <BillCalendar />;
}
