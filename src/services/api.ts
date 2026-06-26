export const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || "";

/**
 * A customized fetch wrapper that prepends the API_BASE_URL
 * and sets default headers.
 */
export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint}`;
  
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  return fetch(url, {
    ...options,
    headers,
  });
}
