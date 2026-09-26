// Database access through secured Postgres RPC functions (see supabase/migrations).
import { HttpError, requireEnv } from "./http.mts";

export async function rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_KEY");
  const secret = requireEnv("SS_API_SECRET");
  const headers: Record<string, string> = {
    apikey: key,
    "content-type": "application/json",
    accept: "application/json",
  };
  if (key.startsWith("eyJ")) headers.authorization = `Bearer ${key}`;
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_secret: secret, ...args }),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text).message || text;
    } catch {}
    if (msg.includes("not_found")) throw new HttpError(404, "not_found", "Not found.");
    console.error(`DB rpc ${fn} failed`, res.status, msg);
    throw new HttpError(502, "database_error", "The database request failed. Please try again.");
  }
  return (text ? JSON.parse(text) : null) as T;
}

export const db = {
  createIdea: (ownerHash: string, idea: Record<string, unknown>) =>
    rpc<{ ideaId: string; analysisId: string }>("ss_create_idea", { p_owner_hash: ownerHash, p_idea: idea }),
  startAnalysis: (ownerHash: string, ideaId: string) =>
    rpc<{ ideaId: string; analysisId: string }>("ss_start_analysis", { p_owner_hash: ownerHash, p_idea_id: ideaId }),
  patchIdea: (ideaId: string, patch: Record<string, unknown>) =>
    rpc("ss_patch_idea", { p_idea_id: ideaId, p_patch: patch }),
  patchAnalysis: (analysisId: string, patch: Record<string, unknown>) =>
    rpc("ss_patch_analysis", { p_analysis_id: analysisId, p_patch: patch }),
  listIdeas: (ownerHash: string) => rpc<any[]>("ss_list_ideas", { p_owner_hash: ownerHash }),
  getIdea: (ownerHash: string, ideaId: string, analysisId?: string | null) =>
    rpc<any>("ss_get_idea", { p_owner_hash: ownerHash, p_idea_id: ideaId, p_analysis_id: analysisId ?? null }),
  deleteIdea: (ownerHash: string, ideaId: string) =>
    rpc<boolean>("ss_delete_idea", { p_owner_hash: ownerHash, p_idea_id: ideaId }),
  share: (ownerHash: string, analysisId: string) =>
    rpc<string>("ss_share", { p_owner_hash: ownerHash, p_analysis_id: analysisId }),
  getShared: (token: string) => rpc<any>("ss_get_shared", { p_token: token }),
  rateLimit: (key: string, max: number, windowSeconds: number) =>
    rpc<boolean>("ss_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds }),
};

export async function enforceRateLimit(key: string, max: number, windowSeconds: number, what: string) {
  const ok = await db.rateLimit(key, max, windowSeconds);
  if (!ok) {
    throw new HttpError(429, "rate_limited", `Too many ${what} requests. Please wait a while and try again.`);
  }
}
