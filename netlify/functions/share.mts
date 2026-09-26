// POST /api/share { analysisId }  — create (or reuse) a read-only share link for a completed report
// GET  /api/shared/:token         — public, read-only report data for a share link
import type { Config, Context } from "@netlify/functions";
import { db, enforceRateLimit } from "../lib/db.mts";
import { HttpError, assertSameOrigin, assertUuid, errorResponse, json, ownerHash, readJson } from "../lib/http.mts";

export default async (req: Request, context: Context) => {
  try {
    const token = context.params?.token;
    if (token) {
      if (req.method !== "GET") throw new HttpError(405, "method_not_allowed", "Use GET.");
      if (!/^[a-f0-9]{36}$/.test(token)) throw new HttpError(404, "not_found", "Shared report not found.");
      await enforceRateLimit(`shared:ip:${context.ip || "unknown"}`, 120, 3600, "shared report");
      const rec = await db.getShared(token);
      if (!rec) throw new HttpError(404, "not_found", "Shared report not found.");
      return json(rec);
    }
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
    assertSameOrigin(req);
    const owner = await ownerHash(req);
    const body = await readJson(req);
    const analysisId = assertUuid(body?.analysisId, "analysis id");
    const t = await db.share(owner, analysisId);
    return json({ token: t, path: `/share/${t}` });
  } catch (e) {
    return errorResponse(e);
  }
};

export const config: Config = { path: ["/api/share", "/api/shared/:token"], method: ["GET", "POST"] };
