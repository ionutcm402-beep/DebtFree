import { Metadata } from "next";
import { Planner } from "@/components/Planner";

export const metadata: Metadata = { title: "Working preview" };
export default function PreviewPage() { return <Planner demo />; }
