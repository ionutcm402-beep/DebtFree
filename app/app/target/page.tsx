import { Metadata } from "next";
import { TargetPlanner } from "@/components/TargetPlanner";
export const metadata: Metadata = { title: "Payoff target" };
export default function TargetPage() { return <TargetPlanner />; }
