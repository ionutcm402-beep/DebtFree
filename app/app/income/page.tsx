import { Metadata } from "next";
import { IncomePlanner } from "@/components/IncomePlanner";
export const metadata: Metadata = { title: "Monthly income" };
export default function IncomePage() { return <IncomePlanner />; }
