// Shared HTTP helpers for Startup Sense functions.

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
  console.error("Unhandled error", err);
  return json({ error: { code: "internal_error", message: "Something went wrong on the server." } }, 500);
}

export function env(name: string): string | undefined {
  let v: string | undefined;
  try {
    v = (globalThis as any).Netlify?.env?.get(name);
  } catch {}
  if (!v) v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new HttpError(503, "not_configured", `Server is missing configuration: ${name}`);
  return v;
}

const OWNER_KEY_RE = /^[A-Za-z0-9_-]{32,128}$/;

/** Each browser keeps a random owner key; the server only stores its SHA-256 hash. */
export async function ownerHash(req: Request): Promise<string> {
  const key = req.headers.get("x-owner-key") || "";
  if (!OWNER_KEY_RE.test(key)) {
    throw new HttpError(401, "missing_owner_key", "Missing or invalid workspace key.");
  }
  return sha256Hex(`startup-sense:${key}`);
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function readJson(req: Request, maxBytes = 20_000): Promise<any> {
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new HttpError(415, "unsupported_media_type", "Expected application/json.");
  }
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "payload_too_large", "Request is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "Request body is not valid JSON.");
  }
}

/** Blocks cross-site POSTs from other origins (browsers always send Origin on POST). */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (tests, curl)
  const host = req.headers.get("host");
  try {
    const o = new URL(origin);
    if (host && o.host !== host) throw new HttpError(403, "forbidden_origin", "Cross-origin request blocked.");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(403, "forbidden_origin", "Cross-origin request blocked.");
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(v: string | undefined, what = "id"): string {
  if (!v || !UUID_RE.test(v)) throw new HttpError(400, "invalid_id", `Invalid ${what}.`);
  return v.toLowerCase();
}

/** Fires the background worker and waits only for its 202 acknowledgement. */
export async function triggerWorker(req: Request, payload: Record<string, unknown>) {
  const origin = new URL(req.url).origin;
  const secret = requireEnv("SS_API_SECRET");
  const res = await fetch(`${origin}/.netlify/functions/worker-background`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-worker-secret": secret },
    body: JSON.stringify(payload),
  });
  if (res.status !== 202 && !res.ok) {
    throw new HttpError(502, "worker_unavailable", "Could not start the background analysis worker.");
  }
}
