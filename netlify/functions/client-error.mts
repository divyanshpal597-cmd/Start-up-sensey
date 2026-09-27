// POST /api/client-error — records a browser crash (message + stack) so blank-page bugs on real devices can be diagnosed.
import type { Config, Context } from "@netlify/functions";
import { enforceRateLimit, rpc } from "../lib/db.mts";
import { errorResponse, json, readJson } from "../lib/http.mts";

export default async (req: Request, context: Context) => {
  try {
    const b = await readJson(req, 16_000);
    await enforceRateLimit(`clienterr:ip:${context.ip || "unknown"}`, 30, 3600, "error report");
    const s = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);
    await rpc("ss_log_client_error", {
      p_err: {
        url: s(b?.url, 500),
        message: s(b?.message, 2000),
        stack: s(b?.stack, 6000),
        componentStack: s(b?.componentStack, 6000),
        userAgent: s(req.headers.get("user-agent"), 500),
      },
    });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
};

export const config: Config = { path: "/api/client-error", method: ["POST"] };
