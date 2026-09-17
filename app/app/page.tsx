import { Metadata } from "next";
import { Planner } from "@/components/Planner";

export const metadata: Metadata = { title: "My plan" };
export default function PlannerPage() { return <Planner />; }
