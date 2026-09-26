// Background worker (15-minute limit). Invoked only by our own API functions with the server secret.
import type { Context } from "@netlify/functions";
import { env } from "../lib/http.mts";
import { runAnalysis, runJob } from "../lib/pipeline.mts";

export default async (req: Request, _context: Context) => {
  const secret = env("SS_API_SECRET");
  if (!secret || req.headers.get("x-worker-secret") !== secret) {
    console.warn("Rejected unauthorised worker call");
    return;
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return;
  }
  if (body?.type === "analyze") {
    await runAnalysis({
      analysisId: body.analysisId,
      ideaId: body.ideaId,
      ownerHash: body.ownerHash,
      simulateFailure: body.simulateFailure === true,
    });
  } else if (["suppliers", "competitors", "pivots"].includes(body?.type)) {
    await runJob(body);
  }
};
