import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { UIVariant, UsageMetadata, DesignSuggestion, ColorPalette } from "../src/types.ts";

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
    throw new Error("OPENROUTER_API_KEY is not configured on the server.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openRouterKey}`,
      "X-Title": "TheDesignAI"
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
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

export async function generateFollowUpQuestionsServer(prompt: string, preferred: "gemini" | "openrouter"): Promise<{ data: string[]; usage: UsageMetadata }> {
  const apiKey = process.env.GEMINI_API_KEY;
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

  const runGemini = async () => {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }
    const ai = new GoogleGenAI({ 
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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
      data: JSON.parse(jsonText.trim()) as string[],
      usage
    };
  };

  try {
    return await runGemini();
  } catch (error) {
    console.error("Gemini API error in generateFollowUpQuestionsServer:", error);
    throw error;
  }
}

export async function generateUIVariantsServer(
  prompt: string,
  questions: string[],
  answers: string[],
  preferred: "gemini" | "openrouter",
  referenceImage?: { base64: string; mimeType: string } | null
): Promise<{ data: UIVariant[]; usage: UsageMetadata }> {
  const apiKey = process.env.GEMINI_API_KEY;
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

  const textParts: string[] = [`Generate 3 design variations for: ${prompt}`];
  if (answers.length > 0 && questions.length > 0) {
    textParts.push(`\n\nUser's answers to clarifying questions:\n${questions.map((q, i) => `Q: ${q}\nA: ${answers[i]}`).join('\n\n')}`);
  }
  const promptContent = textParts.join('\n');

  const contents: any[] = [promptContent];
  if (referenceImage) {
    contents.push({
      inlineData: {
        data: referenceImage.base64,
        mimeType: referenceImage.mimeType
      }
    });
  }

  const runGemini = async () => {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }
    const ai = new GoogleGenAI({ 
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
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
      data: variants as UIVariant[],
      usage
    };
  };

  try {
    return await runGemini();
  } catch (error) {
    console.error("Gemini API error in generateUIVariantsServer:", error);
    throw error;
  }
}

export async function modifyUIServer(
  currentHtml: string,
  prompt: string,
  preferred: "gemini" | "openrouter"
): Promise<{ data: string; usage: UsageMetadata }> {
  const apiKey = process.env.GEMINI_API_KEY;
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

  const runGemini = async () => {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }
    const ai = new GoogleGenAI({ 
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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

  try {
    return await runGemini();
  } catch (error) {
    console.error("Gemini API error in modifyUIServer:", error);
    throw error;
  }
}

export async function modifyUIServerStream(
  currentHtml: string,
  prompt: string,
  preferred: "gemini" | "openrouter",
  onChunk: (chunk: string, usage?: UsageMetadata) => void
): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
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

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }

  const ai = new GoogleGenAI({ 
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  const responseStream = await ai.models.generateContentStream({
    model: "gemini-3.5-flash",
    contents: `${sysInstruction}\n\n${promptContent}`,
    config: {
      temperature: 0.2,
    }
  });

  let isFirstChunk = true;

  for await (const chunk of responseStream) {
    let text = chunk.text || "";
    
    if (isFirstChunk) {
      text = text.trimStart();
      if (text.startsWith("```html")) {
        text = text.slice(7).trimStart();
      } else if (text.startsWith("```")) {
        text = text.slice(3).trimStart();
      }
      if (text.length > 0) {
        isFirstChunk = false;
      }
    }

    if (text.includes("```")) {
      text = text.replace(/```html/g, "").replace(/```/g, "").trimEnd();
    }

    if (text) {
      onChunk(text);
    }

    if (chunk.usageMetadata) {
      const usage: UsageMetadata = {
        promptTokenCount: chunk.usageMetadata.promptTokenCount || 0,
        candidatesTokenCount: chunk.usageMetadata.candidatesTokenCount || 0,
        totalTokenCount: chunk.usageMetadata.totalTokenCount || 0
      };
      onChunk("", usage);
    }
  }
}

export async function generateDesignSuggestionsServer(
  currentHtml: string,
  preferred: "gemini" | "openrouter"
): Promise<{ data: DesignSuggestion[]; usage: UsageMetadata }> {
  const apiKey = process.env.GEMINI_API_KEY;
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

  const runGemini = async () => {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }
    const ai = new GoogleGenAI({ 
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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
        data: suggestions as DesignSuggestion[],
        usage
      };
    }
    throw new Error("The AI model returned an empty response.");
  };

  try {
    return await runGemini();
  } catch (error) {
    console.error("Gemini API error in generateDesignSuggestionsServer:", error);
    throw error;
  }
}

export async function generateSingleUIVariantServer(
  prompt: string,
  questions: string[],
  answers: string[],
  preferred: "gemini" | "openrouter",
  variantIndex: number,
  referenceImage?: { base64: string; mimeType: string } | null
): Promise<{ data: UIVariant; usage: UsageMetadata }> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  const styles = [
    {
      name: "Asymmetrical Rectilinear Blockwork",
      desc: "Heavy black strokes, grid-heavy, primary pigments, thick structural lines, Bauhaus-functionalism vibe."
    },
    {
      name: "Grainy Risograph Layering",
      desc: "Tactile paper texture, overprinted translucent inks, dithered grain textures, monochromatic depth, raw paper substrate."
    },
    {
      name: "Volumetric Prismatic Diffusion",
      desc: "Generative morphing gradients, soft-focus diffusion, bioluminescent light sources, spectral chromatic aberration, glassmorphism."
    }
  ];
  
  const selectedStyle = styles[variantIndex] || styles[0];
  
  const systemInstruction = `
    You are Flash UI, a master UI/UX designer and world-class frontend engineer. 
    Your mission is to generate ONE RADICAL CONCEPTUAL VARIATION for the user's prompt, strictly adhering to the specified design persona: "${selectedStyle.name}".
    Description of persona: ${selectedStyle.desc}

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

    **OUTPUT FORMAT:**
    Return a JSON object with:
    - 'label': A unique design persona name based on the style "${selectedStyle.name}" and a NEW physical metaphor.
    - 'html': The raw HTML string with Tailwind classes.
    - 'description': A one-sentence explanation describing the material logic and design persona.
  `.trim();

  const textParts: string[] = [`Generate a single design variation strictly in the style "${selectedStyle.name}" for: ${prompt}`];
  if (answers.length > 0 && questions.length > 0) {
    textParts.push(`\n\nUser's answers to clarifying questions:\n${questions.map((q, i) => `Q: ${q}\nA: ${answers[i]}`).join('\n\n')}`);
  }
  const promptContent = textParts.join('\n');

  const contents: any[] = [promptContent];
  if (referenceImage) {
    contents.push({
      inlineData: {
        data: referenceImage.base64,
        mimeType: referenceImage.mimeType
      }
    });
  }

  const runGemini = async () => {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }
    const ai = new GoogleGenAI({ 
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction,
        temperature: 1.0,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING },
            html: { type: Type.STRING },
            description: { type: Type.STRING }
          },
          required: ["label", "html", "description"]
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

    const variant = JSON.parse(jsonText.trim());
    variant.id = `variant-${Date.now()}-${variantIndex}`;

    return {
      data: variant as UIVariant,
      usage
    };
  };

  try {
    return await runGemini();
  } catch (error) {
    console.error("Gemini API error in generateSingleUIVariantServer:", error);
    throw error;
  }
}

export async function generatePaletteServer(currentHtml: string): Promise<{ data: ColorPalette[]; usage: UsageMetadata }> {
  const apiKey = process.env.GEMINI_API_KEY;
  const systemInstruction = `
    You are an expert color theorist and design system architect.
    Your task is to analyze the provided HTML/Tailwind code, assess its current mood/theme, and propose exactly 3 curated, beautiful color palette options that would elevate or redefine the design.
    
    Each of the 3 palette options must consist of:
    - 'name': A creative name for the palette (e.g., "Neo-Retro Acid", "Muted Linen", "Nordic Slate").
    - 'colors': An array of exactly 5 colors matching these roles:
      1. 'primary': The main dominant color (usually brand/focal color).
      2. 'accent': A vibrant accent color (for key active elements, badges, highlights).
      3. 'background': The main canvas color (dark, light, or textured).
      4. 'surface': The background of cards/panels (slightly lighter/darker than background).
      5. 'text': The body/heading text color for high-contrast legibility.

    For each color, provide:
    - 'role': One of: "primary", "accent", "background", "surface", "text"
    - 'hex': The precise CSS color hex code (e.g., "#101012").

    Ensure color contrast standards are met between background/surface and text/primary.
    Return a JSON array containing exactly 3 palette objects.
  `.trim();

  const runGemini = async () => {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }
    const ai = new GoogleGenAI({ 
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Current UI HTML:\n\n${currentHtml}`,
      config: {
        systemInstruction,
        temperature: 0.7,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              colors: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    role: { 
                      type: Type.STRING,
                      enum: ["primary", "accent", "background", "surface", "text"]
                    },
                    hex: { type: Type.STRING }
                  },
                  required: ["role", "hex"]
                }
              }
            },
            required: ["name", "colors"]
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

    const palettes = JSON.parse(jsonText.trim());

    return {
      data: palettes as ColorPalette[],
      usage
    };
  };

  try {
    return await runGemini();
  } catch (error) {
    console.error("Gemini API error in generatePaletteServer:", error);
    throw error;
  }
}

