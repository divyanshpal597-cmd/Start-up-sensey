// GET /api/status — which integrations are configured (booleans only; never returns secrets).
import type { Config } from "@netlify/functions";
import { env, json } from "../lib/http.mts";
import { aiConfigured, modelList } from "../lib/gemini.mts";

export default async () =>
  json({
    ai: { configured: aiConfigured(), provider: "Google Gemini", model: modelList()[0] },
    places: {
      googlePlaces: Boolean(env("GOOGLE_MAPS_API_KEY")),
      openStreetMap: true,
    },
    database: { configured: Boolean(env("SUPABASE_URL") && env("SUPABASE_KEY") && env("SS_API_SECRET")) },
    failureTestAllowed: env("ALLOW_FAILURE_TEST") !== "false",
    deploy: env("COMMIT_REF")?.slice(0, 7) || null,
  });

export const config: Config = { path: "/api/status", method: ["GET"] };
