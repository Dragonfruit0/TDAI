import { UIVariant, UsageMetadata, DesignSuggestion } from "../types.ts";
import { apiFetch } from "./api.ts";

export interface GenerationResult<T> {
  data: T;
  usage: UsageMetadata;
}

export function getPreferredProvider(): "gemini" | "openrouter" {
  return "gemini";
}

export async function generateFollowUpQuestions(prompt: string): Promise<GenerationResult<string[]>> {
  const preferred = getPreferredProvider();
  const response = await apiFetch("/api/ai/follow-up", {
    method: "POST",
    body: JSON.stringify({ prompt, preferred }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to generate clarifying questions: ${response.statusText}`);
  }

  return response.json();
}

export async function generateUIVariants(
  prompt: string,
  questions: string[] = [],
  answers: string[] = []
): Promise<GenerationResult<UIVariant[]>> {
  const preferred = getPreferredProvider();
  const response = await apiFetch("/api/ai/ui-variants", {
    method: "POST",
    body: JSON.stringify({ prompt, questions, answers, preferred }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to generate UI variants: ${response.statusText}`);
  }

  return response.json();
}

export async function modifyUI(currentHtml: string, prompt: string): Promise<GenerationResult<string>> {
  const preferred = getPreferredProvider();
  const response = await apiFetch("/api/ai/modify-ui", {
    method: "POST",
    body: JSON.stringify({ currentHtml, prompt, preferred }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to modify UI: ${response.statusText}`);
  }

  return response.json();
}

export async function generateDesignSuggestions(currentHtml: string): Promise<GenerationResult<DesignSuggestion[]>> {
  const preferred = getPreferredProvider();
  const response = await apiFetch("/api/ai/suggestions", {
    method: "POST",
    body: JSON.stringify({ currentHtml, preferred }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to generate design suggestions: ${response.statusText}`);
  }

  return response.json();
}

