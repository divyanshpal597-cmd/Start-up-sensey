// Frontend API client. No secrets live here — only the browser's random workspace key.

const OWNER_KEY = "ss_owner_key";
let memoryKey: string | null = null;

export function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function storageSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) — values live for this tab only */
  }
}
export function storageAvailable() {
  try {
    const k = "__ss_test";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function randomKey() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function getOwnerKey(): string {
  const stored = storageGet(OWNER_KEY);
  if (stored && /^[A-Za-z0-9_-]{32,128}$/.test(stored)) return stored;
  if (memoryKey) return memoryKey;
  const k = randomKey();
  storageSet(OWNER_KEY, k);
  memoryKey = k;
  return k;
}

export function setOwnerKey(k: string) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(k)) throw new Error("That workspace key is not valid.");
  storageSet(OWNER_KEY, k);
  memoryKey = k;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.auth !== false) headers["x-owner-key"] = getOwnerKey();
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method || "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network_error", translate("Could not reach the server. Check your internet connection and try again."));
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const code = data?.error?.code || "http_error";
    throw new ApiError(res.status, code, errorMessage(code, data?.error?.message || `Request failed (${res.status}).`));
  }
  return data as T;
}

export const Api = {
  status: () => api("/api/status", { auth: false }),
  analyze: (body: unknown) => api<{ ideaId: string; analysisId: string }>("/api/analyze-business", { method: "POST", body }),
  reanalyze: (ideaId: string, simulateFailure = false, language?: string) =>
    api<{ ideaId: string; analysisId: string }>(`/api/ideas/${ideaId}/reanalyze`, { method: "POST", body: { simulateFailure, language } }),
  extractIdea: (transcript: string, language: string) =>
    api<{ transcript: string; fields: Record<string, any>; uncertainFields: string[]; budgetHeard: string | null; note: string | null }>(
      "/api/extract-idea",
      { method: "POST", body: { transcript, language } }
    ),
  listIdeas: () => api<{ ideas: any[] }>("/api/ideas"),
  getIdea: (ideaId: string, analysisId?: string) =>
    api<{ idea: any; analysis: any }>(`/api/ideas/${ideaId}${analysisId ? `?analysisId=${analysisId}` : ""}`),
  deleteIdea: (ideaId: string) => api(`/api/ideas/${ideaId}`, { method: "DELETE" }),
  runJob: (ideaId: string, body: { type: "suppliers" | "competitors" | "pivots"; analysisId: string; radiusKm?: number; language?: string }) =>
    api(`/api/ideas/${ideaId}/jobs`, { method: "POST", body }),
  share: (analysisId: string) => api<{ token: string; path: string }>("/api/share", { method: "POST", body: { analysisId } }),
  shared: (token: string) => api<{ idea: any; analysis: any }>(`/api/shared/${token}`, { auth: false }),
};

// Error messages from the server are mapped to translated text by their error code.
let translate: (s: string) => string = (s) => s;
export function setApiTranslator(fn: (s: string) => string) {
  translate = fn;
}
const CODE_MESSAGES: Record<string, string> = {
  ai_not_configured: "AI analysis could not be completed: the AI service is not configured on the server.",
  rate_limited: "Too many requests. Please wait a while and try again.",
  database_error: "The database request failed. Please try again.",
  worker_unavailable: "Could not start the background analysis worker.",
  not_found: "Not found.",
  missing_owner_key: "Missing or invalid workspace key.",
  empty_transcript: "No speech was captured. Please try again.",
  ai_failed: "AI could not read the details from your speech. You can edit the fields yourself or try again.",
  internal_error: "Something went wrong on the server.",
};
function errorMessage(code: string, fallback: string) {
  if (code === "invalid_input") return translate(fallback);
  return translate(CODE_MESSAGES[code] || fallback);
}
