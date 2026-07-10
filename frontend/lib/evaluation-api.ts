import { authorizationHeaders } from "@/lib/auth-token";
import type { EvaluationSummary } from "@/lib/types";

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders = await authorizationHeaders();
  const response = await fetch(`${apiUrl}${path}`, {
    credentials: "include",
    ...init,
    headers: { ...authHeaders, ...init?.headers },
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function getEvaluationResults(): Promise<EvaluationSummary> {
  return apiFetch<EvaluationSummary>("/v1/evaluation/results");
}

export async function runEvaluation(): Promise<EvaluationSummary> {
  return apiFetch<EvaluationSummary>("/v1/evaluation/run", { method: "POST" });
}
