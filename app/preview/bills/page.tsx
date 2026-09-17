import { Metadata } from "next";
import { BillCalendar } from "@/components/BillCalendar";

export const metadata: Metadata = { title: "Bill calendar — preview" };

export default function PreviewBillsPage() {
  return <BillCalendar demo />;
}
