// POST /api/ideas/:id/jobs — run a follow-up job on the current analysis:
//   { type: "suppliers" | "competitors", analysisId, radiusKm }  → live places search
//   { type: "pivots", analysisId }                               → AI pivot generator
import type { Config, Context } from "@netlify/functions";
import { db, enforceRateLimit } from "../lib/db.mts";
import { aiConfigured } from "../lib/gemini.mts";
import {
  HttpError, assertSameOrigin, assertUuid, errorResponse, json, ownerHash, readJson, triggerWorker,
} from "../lib/http.mts";

export default async (req: Request, context: Context) => {
  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
    assertSameOrigin(req);
    const owner = await ownerHash(req);
    const ideaId = assertUuid(context.params?.id, "idea id");
    const body = await readJson(req);
    const type = String(body?.type || "");
    if (!["suppliers", "competitors", "pivots"].includes(type)) {
      throw new HttpError(400, "invalid_input", "Unknown job type.");
    }
    const analysisId = assertUuid(body?.analysisId, "analysis id");
    if (type === "pivots" && !aiConfigured()) {
      throw new HttpError(503, "ai_not_configured", "The AI service is not configured on the server.");
    }
    const radiusKm = Number(body?.radiusKm);
    const params = Number.isFinite(radiusKm) ? { radiusKm: Math.min(60, Math.max(2, radiusKm)) } : {};

    await enforceRateLimit(`jobs:ip:${context.ip || "unknown"}`, 40, 3600, "search");
    const rec = await db.getIdea(owner, ideaId, analysisId);
    if (!rec?.analysis) throw new HttpError(404, "not_found", "Analysis not found.");
    if (rec.analysis.status !== "complete") throw new HttpError(409, "not_ready", "The analysis has not completed yet.");
    const current = rec.analysis.jobs?.[type];
    if (current?.status === "running" && Date.now() - Date.parse(current.updatedAt) < 5 * 60_000) {
      return json({ status: "running" }, 202);
    }
    await db.patchAnalysis(analysisId, { jobs: { [type]: { status: "queued", updatedAt: new Date().toISOString() } } });
    await triggerWorker(req, { type, analysisId, ideaId, ownerHash: owner, params });
    return json({ status: "queued" }, 202);
  } catch (e) {
    return errorResponse(e);
  }
};

export const config: Config = { path: "/api/ideas/:id/jobs", method: ["POST"] };
