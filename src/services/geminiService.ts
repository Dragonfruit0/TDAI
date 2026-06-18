import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { UIVariant, UsageMetadata, DesignSuggestion } from "../types.ts";

export interface GenerationResult<T> {
  data: T;
  usage: UsageMetadata;
}

function cleanJsonString(str: string): string {
  let cleaned = str.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  }
  return cleaned.trim();
}

async function callOpenRouter(systemInstruction: string, prompt: string, isJson: boolean): Promise<{ text: string, usage: UsageMetadata }> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    throw new Error("Both GEMINI_API_KEY and OPENROUTER_API_KEY fallback are missing.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openRouterKey}`,
      "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "",
      "X-Title": "TheDesignAI"
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ],
      temperature: isJson ? 0.7 : 0.2,
      response_format: isJson ? { type: "json_object" } : undefined
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  const usage: UsageMetadata = {
    promptTokenCount: data.usage?.prompt_tokens || 0,
    candidatesTokenCount: data.usage?.completion_tokens || 0,
    totalTokenCount: data.usage?.total_tokens || 0
  };

  return { text, usage };
}

export function getPreferredProvider(): "gemini" | "openrouter" {
  if (typeof window !== "undefined") {
    return (localStorage.getItem("preferred_api_provider") as "gemini" | "openrouter") || "gemini";
  }
  return "gemini";
}

export async function generateFollowUpQuestions(prompt: string): Promise<GenerationResult<string[]>> {
  const apiKey = process.env.GEMINI_API_KEY;
  const preferred = getPreferredProvider();
  const systemInstruction = `
    You are an expert product manager and UX researcher.
    The user wants to build a design (UI, poster, logo, etc.) based on their prompt.
    Your task is to ask exactly 5 clarifying questions to understand their requirements better.
    Questions should cover aspects like:
    - Target audience
    - Preferred color scheme or branding
    - Specific features, layout, or style needed
    - Typography preferences
    - Animations or interactions
    Return a JSON array of exactly 5 strings, where each string is a question.
  `.trim();

  const runGemini = async (): Promise<GenerationResult<string[]>> => {
    if (!apiKey) {
      throw new Error("API Key is missing. Please ensure GEMINI_API_KEY is configured.");
    }
    const ai = new GoogleGenAI({ apiKey });
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `User prompt: ${prompt}`,
      config: {
        systemInstruction,
        temperature: 0.7,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING
          }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) {
      throw new Error("The AI model returned an empty response.");
    }
    
    const usage: UsageMetadata = {
      promptTokenCount: response.usageMetadata?.promptTokenCount || 0,
      candidatesTokenCount: response.usageMetadata?.candidatesTokenCount || 0,
      totalTokenCount: response.usageMetadata?.totalTokenCount || 0
    };

    return {
      data: JSON.parse(jsonText.trim()),
      usage
    };
  };

  const runOpenRouter = async (): Promise<GenerationResult<string[]>> => {
    const { text, usage } = await callOpenRouter(systemInstruction, `User prompt: ${prompt}`, true);
    const cleaned = cleanJsonString(text);
    return {
      data: JSON.parse(cleaned),
      usage
    };
  };

  if (preferred === "openrouter") {
    try {
      return await runOpenRouter();
    } catch (error) {
      console.warn("Preferred OpenRouter API failed, attempting Gemini fallback...", error);
      return await runGemini();
    }
  } else {
    try {
      return await runGemini();
    } catch (error) {
      console.warn("Preferred Gemini API failed, attempting OpenRouter fallback...", error);
      return await runOpenRouter();
    }
  }
}

export async function generateUIVariants(prompt: string, questions: string[] = [], answers: string[] = []): Promise<GenerationResult<UIVariant[]>> {
  const apiKey = process.env.GEMINI_API_KEY;
  const preferred = getPreferredProvider();
  const systemInstruction = `
    You are Flash UI, a master UI/UX designer and world-class frontend engineer. 
    Your mission is to generate THREE RADICAL CONCEPTUAL VARIATIONS for the user's prompt.
    The user might request a UI, a poster, a logo, or any other visual layout. Adapt your HTML/Tailwind output to perfectly suit the requested medium.

    **STRICT IP SAFEGUARD:**
    - Never use names of artists, movies, or brands.
    - Instead, describe the "Physicality" and "Material Logic" of the UI.

    **VISUAL EXECUTION RULES:**
    1. **Materiality**: Use physical metaphors to drive every CSS choice. (e.g., if "Risograph", use grain effects like \`feTurbulence\` in SVG filters and \`mix-blend-mode: multiply\` for ink layering; if "Prismatic", use glassmorphism, caustic refraction, and morphing fluid gradients).
    2. **Typography**: Use high-quality web fonts (Inter, Geist, or system-ui). Pair a bold sans-serif with a refined monospace for data/labels.
    3. **Motion**: Include subtle, high-performance CSS animations (hover transitions, entry reveals, smooth staggered animations).
    4. **Layout**: Be bold with negative space and hierarchy. **AVOID GENERIC CARDS.** Use asymmetrical grids, suspended kinetic mobile elements, or fluid rectilinear structures.
    5. **Tailwind Only**: Output clean, accessible Tailwind CSS. For posters/logos, use absolute positioning, CSS grid, or SVG elements inline within the HTML. Ensure components are responsive.

    **CREATIVE GUIDANCE (Use these metaphors as inspiration for the 3 variants):**
    - "Asymmetrical Rectilinear Blockwork": Heavy black strokes, grid-heavy, primary pigments, thick structural lines, Bauhaus-functionalism vibe.
    - "Grainy Risograph Layering": Tactile paper texture, overprinted translucent inks, dithered grain textures, monochromatic depth, raw paper substrate.
    - "Kinetic Wireframe Suspension": Floating silhouettes, delicate thin balancing lines, organic primary shapes, minimalist whitespace, suspended mobile logic.
    - "Volumetric Prismatic Diffusion": Generative morphing gradients, soft-focus diffusion, bioluminescent light sources, spectral chromatic aberration, glassmorphism.

    **OUTPUT FORMAT:**
    Return a JSON array of exactly 3 objects. 
    Each object must have:
    - 'label': A unique design persona name based on a NEW physical metaphor.
    - 'html': The raw HTML string with Tailwind classes.
    - 'description': A one-sentence explanation describing the material logic and design persona.
  `.trim();

  const contents: any[] = [`Generate 3 design variations for: ${prompt}`];
  if (answers.length > 0 && questions.length > 0) {
    contents.push(`\n\nUser's answers to clarifying questions:\n${questions.map((q, i) => `Q: ${q}\nA: ${answers[i]}`).join('\n\n')}`);
  }
  const promptContent = contents.join('\n');

  const runGemini = async (): Promise<GenerationResult<UIVariant[]>> => {
    if (!apiKey) {
      throw new Error("API Key is missing. Please ensure GEMINI_API_KEY is configured.");
    }
    const ai = new GoogleGenAI({ apiKey });
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [promptContent],
      config: {
        systemInstruction,
        temperature: 1.0,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              html: { type: Type.STRING },
              description: { type: Type.STRING }
            },
            required: ["label", "html", "description"]
          }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) {
      throw new Error("The AI model returned an empty response.");
    }
    
    const usage: UsageMetadata = {
      promptTokenCount: response.usageMetadata?.promptTokenCount || 0,
      candidatesTokenCount: response.usageMetadata?.candidatesTokenCount || 0,
      totalTokenCount: response.usageMetadata?.totalTokenCount || 0
    };

    const parsedData = JSON.parse(jsonText.trim());
    const variants = parsedData.map((v: any, i: number) => ({
      ...v,
      id: `variant-${Date.now()}-${i}`
    }));

    return {
      data: variants,
      usage
    };
  };

  const runOpenRouter = async (): Promise<GenerationResult<UIVariant[]>> => {
    const { text, usage } = await callOpenRouter(systemInstruction, promptContent, true);
    const cleaned = cleanJsonString(text);
    const parsedData = JSON.parse(cleaned);
    const rawVariants = Array.isArray(parsedData) ? parsedData : (parsedData.variants || parsedData.data || []);
    const variants = rawVariants.map((v: any, i: number) => ({
      ...v,
      id: `variant-${Date.now()}-${i}`
    }));

    return {
      data: variants,
      usage
    };
  };

  if (preferred === "openrouter") {
    try {
      return await runOpenRouter();
    } catch (error) {
      console.warn("Preferred OpenRouter API failed, attempting Gemini fallback...", error);
      return await runGemini();
    }
  } else {
    try {
      return await runGemini();
    } catch (error) {
      console.warn("Preferred Gemini API failed, attempting OpenRouter fallback...", error);
      return await runOpenRouter();
    }
  }
}

export const modifyUI = async (currentHtml: string, prompt: string): Promise<GenerationResult<string>> => {
  const apiKey = process.env.GEMINI_API_KEY;
  const preferred = getPreferredProvider();
  const sysInstruction = `You are an expert UI/UX developer and design master.`;
  const promptContent = `CURRENT HTML (Inner content of <body>):
${currentHtml}

USER REQUEST:
${prompt}

Task: Update the HTML based on the user request while maintaining high-fidelity design standards.
Rules:
1. Return ONLY the updated inner HTML that should go inside the <body> tag. 
2. Do NOT include <html>, <head>, or <body> tags.
3. Use Tailwind CSS classes for all styling.
4. **IP SAFEGUARD**: Do not use brand or artist names.
5. **Material Logic**: Maintain the physical metaphors (e.g., grain, layering, grids, gradients) already present in the design or requested.
6. Return the raw HTML string only without markdown fences.`;

  const runGemini = async (): Promise<GenerationResult<string>> => {
    if (!apiKey) {
      throw new Error("API Key is missing. Please ensure GEMINI_API_KEY is configured.");
    }
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `${sysInstruction}\n\n${promptContent}`,
      config: {
        temperature: 0.2,
      }
    });
    
    let html = response.text || '';
    html = html.replace(/```html\n?/g, '').replace(/```\n?/g, '');
    const usage: UsageMetadata = {
      promptTokenCount: response.usageMetadata?.promptTokenCount || 0,
      candidatesTokenCount: response.usageMetadata?.candidatesTokenCount || 0,
      totalTokenCount: response.usageMetadata?.totalTokenCount || 0
    };
    return {
      data: html,
      usage
    };
  };

  const runOpenRouter = async (): Promise<GenerationResult<string>> => {
    const { text, usage } = await callOpenRouter(sysInstruction, promptContent, false);
    let html = text || '';
    html = html.replace(/```html\n?/g, '').replace(/```\n?/g, '');
    return {
      data: html,
      usage
    };
  };

  if (preferred === "openrouter") {
    try {
      return await runOpenRouter();
    } catch (error) {
      console.warn("Preferred OpenRouter API failed, attempting Gemini fallback...", error);
      return await runGemini();
    }
  } else {
    try {
      return await runGemini();
    } catch (error) {
      console.warn("Preferred Gemini API failed, attempting OpenRouter fallback...", error);
      return await runOpenRouter();
    }
  }
};

export async function generateDesignSuggestions(currentHtml: string): Promise<GenerationResult<DesignSuggestion[]>> {
  const apiKey = process.env.GEMINI_API_KEY;
  const preferred = getPreferredProvider();
  const systemInstruction = `
    You are an expert design critic and UI/UX consultant.
    Your task is to analyze the provided HTML/Tailwind CSS code and suggest 3-4 specific improvements.
    
    Suggestions should focus on:
    - Visual hierarchy and layout
    - Color harmony and accessibility (contrast)
    - Typography and readability
    - Interaction design and affordances
    - Consistency and polish
    - Mobile responsiveness

    For each suggestion, provide:
    1. A short, catchy 'title'.
    2. A 'description' explaining the "why" behind the suggestion.
    3. An 'action': A specific natural language command that can be fed back into an AI redesigner to implement the change (e.g., "Add more whitespace between the cards and increase the font size of the headings").
    
    Return a JSON array of objects.
  `.trim();

  const runGemini = async (): Promise<GenerationResult<DesignSuggestion[]>> => {
    if (!apiKey) {
      throw new Error("API Key is missing. Please ensure GEMINI_API_KEY is configured.");
    }
    const ai = new GoogleGenAI({ apiKey });
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Current HTML code:\n\n${currentHtml}`,
      config: {
        systemInstruction,
        temperature: 0.7,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              action: { type: Type.STRING }
            },
            required: ["title", "description", "action"]
          }
        }
      }
    });

    const jsonText = response.text;
    if (jsonText) {
      const usage: UsageMetadata = {
        promptTokenCount: response.usageMetadata?.promptTokenCount || 0,
        candidatesTokenCount: response.usageMetadata?.candidatesTokenCount || 0,
        totalTokenCount: response.usageMetadata?.totalTokenCount || 0
      };
      const parsedData = JSON.parse(jsonText.trim());
      const suggestions = parsedData.map((s: any, i: number) => ({
        ...s,
        id: `suggestion-${Date.now()}-${i}`
      }));

      return {
        data: suggestions,
        usage
      };
    }
    throw new Error("The AI model returned an empty response.");
  };

  const runOpenRouter = async (): Promise<GenerationResult<DesignSuggestion[]>> => {
    const { text, usage } = await callOpenRouter(systemInstruction, `Current HTML code:\n\n${currentHtml}`, true);
    const cleaned = cleanJsonString(text);
    const parsedData = JSON.parse(cleaned);
    const rawSuggestions = Array.isArray(parsedData) ? parsedData : (parsedData.suggestions || parsedData.data || []);
    const suggestions = rawSuggestions.map((s: any, i: number) => ({
      ...s,
      id: `suggestion-${Date.now()}-${i}`
    }));

    return {
      data: suggestions,
      usage
    };
  };

  if (preferred === "openrouter") {
    try {
      return await runOpenRouter();
    } catch (error) {
      console.warn("Preferred OpenRouter API failed, attempting Gemini fallback...", error);
      return await runGemini();
    }
  } else {
    try {
      return await runGemini();
    } catch (error) {
      console.warn("Preferred Gemini API failed, attempting OpenRouter fallback...", error);
      return await runOpenRouter();
    }
  }
}
