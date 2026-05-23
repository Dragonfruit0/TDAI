import { UIVariant, UsageMetadata, DesignSuggestion } from "../types.ts";

export interface GenerationResult<T> {
  data: T;
  usage: UsageMetadata;
}

export interface ModifyUIResult {
  reasoning: string;
  html: string;
}

// Improved helper function that parses response text and screens for any Gemini key/restricted errors
async function parseResponseData(response: Response, defaultMsg: string): Promise<any> {
  let errText = '';
  let errData: any = {};
  
  try {
    errText = await response.text();
    errData = JSON.parse(errText);
  } catch {
    // text or parsing failed, response is likely non-JSON
  }

  const isRestrictedError = 
    !response.ok ||
    response.status === 403 || 
    response.status === 400 ||
    errData.error === 'API_KEY_RESTRICTED' ||
    (errData.error && typeof errData.error === 'string' && (
      errData.error.includes('API_KEY_RESTRICTED') ||
      errData.error.includes('API key') ||
      errData.error.includes('API_KEY_INVALID') ||
      errData.error.includes('Forbidden')
    )) ||
    errText.includes('API key not valid') ||
    errText.includes('API_KEY_INVALID') ||
    errText.includes('Forbidden') ||
    errText.includes('403 Forbidden') ||
    errText.includes('ApiError');

  if (isRestrictedError || errData.error) {
    const errorMsg = errData.details || 
                     (errData.error && typeof errData.error === 'object' ? errData.error.message : null) ||
                     (typeof errData.error === 'string' ? errData.error : null) || 
                     errText || 
                     defaultMsg;
    const error = new Error(errorMsg);
    (error as any).isApiKeyRestricted = true;
    (error as any).restrictedDetails = errorMsg;
    throw error;
  }

  return errData;
}

export async function generateFollowUpQuestions(prompt: string): Promise<GenerationResult<string[]>> {
  try {
    const response = await fetch('/api/gemini/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    const result = await parseResponseData(response, 'Failed to fetch clarifying questions');
    return {
      data: result.questions,
      usage: result.usage
    };
  } catch (error: any) {
    console.error("error fetching clarifying questions:", error);
    throw error;
  }
}

export async function generateUIVariants(
  prompt: string, 
  questions: string[] = [], 
  answers: string[] = []
): Promise<GenerationResult<UIVariant[]>> {
  try {
    const response = await fetch('/api/gemini/generate-variants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, questions, answers }),
    });

    const result = await parseResponseData(response, 'Failed to generate variants');
    const variants = result.variants.map((v: any, i: number) => ({
      ...v,
      id: `variant-${Date.now()}-${i}`
    }));

    return {
      data: variants,
      usage: result.usage
    };
  } catch (error: any) {
    console.error("error fetching UI variants:", error);
    throw error;
  }
}

export const modifyUI = async (currentHtml: string, prompt: string): Promise<ModifyUIResult> => {
  try {
    const response = await fetch('/api/gemini/modify-ui', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentHtml, prompt }),
    });

    const result = await parseResponseData(response, 'Failed to modify layout');
    return {
      reasoning: result.reasoning || 'I have completed the requested changes.',
      html: result.html
    };
  } catch (error: any) {
    console.error("error modifying layout:", error);
    throw error;
  }
};

export async function generateDesignSuggestions(currentHtml: string): Promise<GenerationResult<DesignSuggestion[]>> {
  try {
    const response = await fetch('/api/gemini/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentHtml }),
    });

    const result = await parseResponseData(response, 'Failed to generate critique suggestions');
    const suggestions = result.suggestions.map((s: any, i: number) => ({
      ...s,
      id: `suggestion-${Date.now()}-${i}`
    }));

    return {
      data: suggestions,
      usage: result.usage
    };
  } catch (error: any) {
    console.error("error fetching design crit suggestions:", error);
    throw error;
  }
}
