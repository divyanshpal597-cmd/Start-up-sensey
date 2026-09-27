// Gemini API client (server-side only). The API key never leaves the backend.
import { env } from "./http.mts";

export class AIError extends Error {
  detail: string;
  constructor(message: string, detail = "") {
    super(message);
    this.detail = detail;
  }
}

const API = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_MODEL = "gemini-3.8-flash";
const FALLBACK_MODELS = ["gemini-3.7-flash", "gemini-3.5-flash-lite"];

export function aiConfigured() {
  return Boolean(env("GEMINI_API_KEY"));
}

export function modelList(): string[] {
  const primary = env("GEMINI_MODEL") || DEFAULT_MODEL;
  return [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface CallOpts {
  system: string;
  prompt: string;
  maxOutputTokens?: number;
  /** Used only by the explicit "simulate AI failure" test: forces a real API error. */
  forceInvalidModel?: boolean;
  /** Override the model order (e.g. a faster model for quick extraction). */
  models?: string[];
  /** Per-request timeout in ms. */
  timeoutMs?: number;
  /** Max attempts per model. */
  attempts?: number;
}

export interface AIResult<T> {
  data: T;
  model: string;
}

/** Calls Gemini and returns parsed JSON. Throws AIError on any failure — never returns placeholder data. */
export async function generateJSON<T = any>(opts: CallOpts): Promise<AIResult<T>> {
  const key = env("GEMINI_API_KEY");
  if (!key) throw new AIError("AI is not configured on the server.", "GEMINI_API_KEY is not set.");

  const models = opts.forceInvalidModel ? ["startup-sense-simulated-failure-model"] : opts.models || modelList();
  let lastErr = "";

  for (const model of models) {
    let useThinking = true;
    for (let attempt = 0; attempt < (opts.attempts ?? 3); attempt++) {
      const generationConfig: Record<string, unknown> = {
        responseMimeType: "application/json",
        maxOutputTokens: opts.maxOutputTokens ?? 16384,
      };
      if (useThinking) generationConfig.thinkingConfig = { thinkingLevel: "low" };
      let res: Response;
      try {
        res = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: opts.system }] },
            contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
            generationConfig,
          }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
        });
      } catch (e: any) {
        lastErr = `network: ${e?.message || e}`;
        await sleep(1500 * (attempt + 1));
        continue;
      }
      const text = await res.text();
      if (!res.ok) {
        lastErr = `${model} HTTP ${res.status}: ${text.slice(0, 300)}`;
        console.error("Gemini error", lastErr);
        if (res.status === 400 && useThinking && /thinking/i.test(text)) {
          useThinking = false; // model does not support thinking config — retry without it
          continue;
        }
        if (res.status === 404 || res.status === 400 || res.status === 403) break; // try next model
        if (res.status === 401) throw new AIError("The AI API key was rejected.", lastErr);
        await sleep(2000 * (attempt + 1)); // 429 / 5xx backoff
        continue;
      }
      let payload: any;
      try {
        payload = JSON.parse(text);
      } catch {
        lastErr = "Unparseable API response";
        continue;
      }
      const cand = payload?.candidates?.[0];
      const out: string = (cand?.content?.parts || [])
        .filter((p: any) => typeof p.text === "string" && !p.thought)
        .map((p: any) => p.text)
        .join("");
      if (!out) {
        lastErr = `Empty response (finishReason: ${cand?.finishReason || payload?.promptFeedback?.blockReason || "unknown"})`;
        continue;
      }
      const parsed = parseJsonLoose(out);
      if (parsed === undefined) {
        lastErr = `Model returned invalid JSON (finishReason: ${cand?.finishReason})`;
        continue;
      }
      return { data: parsed as T, model };
    }
  }
  throw new AIError("AI analysis could not be completed.", lastErr);
}

function parseJsonLoose(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {}
  const cleaned = s.replace(/^```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const a = cleaned.indexOf("{");
  const b = cleaned.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(cleaned.slice(a, b + 1));
    } catch {}
  }
  return undefined;
}
