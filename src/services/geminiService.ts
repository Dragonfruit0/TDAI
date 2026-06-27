import { UIVariant, UsageMetadata, DesignSuggestion, ColorPalette } from "../types.ts";
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
  answers: string[] = [],
  referenceImage?: { base64: string; mimeType: string } | null
): Promise<GenerationResult<UIVariant[]>> {
  const preferred = getPreferredProvider();
  const response = await apiFetch("/api/ai/ui-variants", {
    method: "POST",
    body: JSON.stringify({ prompt, questions, answers, preferred, referenceImage }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to generate UI variants: ${response.statusText}`);
  }

  return response.json();
}

export async function generateSingleUIVariant(
  prompt: string,
  questions: string[] = [],
  answers: string[] = [],
  variantIndex: number,
  referenceImage?: { base64: string; mimeType: string } | null
): Promise<GenerationResult<UIVariant>> {
  const preferred = getPreferredProvider();
  const response = await apiFetch("/api/ai/ui-variant-single", {
    method: "POST",
    body: JSON.stringify({ prompt, questions, answers, variantIndex, preferred, referenceImage }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to generate single UI variant: ${response.statusText}`);
  }

  return response.json();
}

export async function generatePalette(currentHtml: string): Promise<GenerationResult<ColorPalette[]>> {
  const response = await apiFetch("/api/ai/generate-palette", {
    method: "POST",
    body: JSON.stringify({ currentHtml }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to generate palette: ${response.statusText}`);
  }

  return response.json();
}


export async function modifyUI(
  currentHtml: string,
  prompt: string,
  onChunk?: (chunk: string) => void
): Promise<GenerationResult<string>> {
  const preferred = getPreferredProvider();
  const response = await apiFetch("/api/ai/modify-ui", {
    method: "POST",
    body: JSON.stringify({ currentHtml, prompt, preferred, stream: !!onChunk }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to modify UI: ${response.statusText}`);
  }

  if (onChunk && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedHtml = "";
    let usage: UsageMetadata = { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const dataStr = trimmed.slice(6).trim();

          if (dataStr === "[DONE]") {
            continue;
          }

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.chunk !== undefined) {
              accumulatedHtml += parsed.chunk;
              onChunk(parsed.chunk);
            }
            if (parsed.usage) {
              usage = parsed.usage;
            }
          } catch (e) {
            console.warn("Failed to parse SSE data line:", trimmed, e);
          }
        }
      }
    } catch (streamError) {
      console.error("Stream reading error:", streamError);
    }

    return {
      data: accumulatedHtml,
      usage,
    };
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

