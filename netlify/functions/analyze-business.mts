// POST /api/analyze-business — validates the idea, saves it, and starts the real AI analysis.
// POST /api/ideas/:id/reanalyze — starts a fresh analysis (new record) for an existing idea.
import type { Config, Context } from "@netlify/functions";
import { db, enforceRateLimit } from "../lib/db.mts";
import { aiConfigured } from "../lib/gemini.mts";
import {
  HttpError, assertSameOrigin, assertUuid, env, errorResponse, json, ownerHash, readJson, triggerWorker,
} from "../lib/http.mts";
import { validateIdea } from "../lib/validate.mts";

export default async (req: Request, context: Context) => {
  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
    assertSameOrigin(req);
    const owner = await ownerHash(req);
    if (!aiConfigured()) {
      throw new HttpError(503, "ai_not_configured", "AI analysis could not be completed: the AI service is not configured on the server.");
    }
    const ip = context.ip || "unknown";
    await enforceRateLimit(`analyze:ip:${ip}`, 12, 3600, "analysis");
    await enforceRateLimit(`analyze:owner:${owner}`, 30, 86400, "analysis");

    const url = new URL(req.url);
    const m = url.pathname.match(/^\/api\/ideas\/([^/]+)\/reanalyze$/);
    let ids: { ideaId: string; analysisId: string };
    let simulateFailure = false;
    if (m) {
      const ideaId = assertUuid(m[1], "idea id");
      const body = await readJson(req).catch(() => ({}));
      simulateFailure = body?.simulateFailure === true;
      ids = await db.startAnalysis(owner, ideaId);
    } else {
      const input = validateIdea(await readJson(req));
      simulateFailure = input.simulateFailure === true;
      const { simulateFailure: _s, ...stored } = input;
      ids = await db.createIdea(owner, stored);
    }
    if (simulateFailure && env("ALLOW_FAILURE_TEST") === "false") simulateFailure = false;

    await triggerWorker(req, { type: "analyze", ...ids, ownerHash: owner, simulateFailure });
    return json({ ...ids, status: "queued" }, 202);
  } catch (e) {
    return errorResponse(e);
  }
};

export const config: Config = {
  path: ["/api/analyze-business", "/api/ideas/:id/reanalyze"],
  method: ["POST"],
};
