import { Metadata } from "next";
import { TargetPlanner } from "@/components/TargetPlanner";
export const metadata: Metadata = { title: "Payoff target preview" };
export default function PreviewTargetPage() { return <TargetPlanner demo />; }
