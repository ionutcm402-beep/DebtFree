import { Metadata } from "next";
import { IncomePlanner } from "@/components/IncomePlanner";
export const metadata: Metadata = { title: "Income preview" };
export default function PreviewIncomePage() { return <IncomePlanner demo />; }
