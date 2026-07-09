import type { Metadata } from "next";
import { EvaluationView } from "@/components/evaluation-view";

export const metadata: Metadata = { title: "Evaluation" };
export default function EvaluationPage() { return <EvaluationView />; }
