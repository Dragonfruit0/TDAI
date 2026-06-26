import { auth } from "../firebase.ts";

export const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || "";

/**
 * A customized fetch wrapper that prepends the API_BASE_URL,
 * automatically appends the Firebase Auth Bearer ID Token if available,
 * and sets default headers.
 */
export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint}`;
  
  let token: string | null = null;
  if (auth.currentUser) {
    try {
      token = await auth.currentUser.getIdToken();
    } catch (err) {
      console.error("Failed to retrieve Firebase ID Token:", err);
    }
  }

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  return fetch(url, {
    ...options,
    headers,
  });
}
