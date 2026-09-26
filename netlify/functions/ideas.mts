// GET /api/ideas            — all ideas for this workspace (latest analysis summary each)
// GET /api/ideas/:id        — one idea with its latest (or ?analysisId=) analysis
// DELETE /api/ideas/:id     — delete an idea and its analyses
import type { Config, Context } from "@netlify/functions";
import { db } from "../lib/db.mts";
import { HttpError, assertSameOrigin, assertUuid, errorResponse, json, ownerHash } from "../lib/http.mts";

export default async (req: Request, context: Context) => {
  try {
    const owner = await ownerHash(req);
    const id = context.params?.id;
    if (!id) {
      if (req.method !== "GET") throw new HttpError(405, "method_not_allowed", "Use GET.");
      return json({ ideas: await db.listIdeas(owner) });
    }
    const ideaId = assertUuid(id, "idea id");
    if (req.method === "GET") {
      const analysisId = new URL(req.url).searchParams.get("analysisId");
      const rec = await db.getIdea(owner, ideaId, analysisId ? assertUuid(analysisId, "analysis id") : null);
      if (!rec) throw new HttpError(404, "not_found", "This idea was not found in your workspace.");
      return json(rec);
    }
    if (req.method === "DELETE") {
      assertSameOrigin(req);
      const ok = await db.deleteIdea(owner, ideaId);
      if (!ok) throw new HttpError(404, "not_found", "Idea not found.");
      return json({ deleted: true });
    }
    throw new HttpError(405, "method_not_allowed", "Method not allowed.");
  } catch (e) {
    return errorResponse(e);
  }
};

export const config: Config = {
  path: ["/api/ideas", "/api/ideas/:id"],
  method: ["GET", "DELETE"],
};
