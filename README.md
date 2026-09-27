# Startup Sense — AI Business Validator

**Validate Before You Invest.**

Startup Sense takes a real business idea (idea, location, budget, customers, price), runs a multi-step analysis with Google Gemini on the server, saves every analysis in Postgres, and finds the nearest real suppliers from live map data.

## Architecture

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite + Tailwind CSS v4, Recharts, Leaflet (OpenStreetMap tiles) |
| API | Netlify Functions (`netlify/functions`) — `/api/analyze-business`, `/api/ideas`, `/api/ideas/:id/jobs`, `/api/share`, `/api/status` |
| Long-running work | `worker-background` Netlify background function (15-min limit): AI analysis, supplier search, pivots |
| AI | Gemini API (`GEMINI_API_KEY`, default model `gemini-3.8-flash`, override with `GEMINI_MODEL`) |
| Places | OpenStreetMap Nominatim + Overpass (always on); Google Places API when `GOOGLE_MAPS_API_KEY` is set |
| Database | Supabase Postgres, private `startup_sense` schema, reached only via `SECURITY DEFINER` RPCs that require `SS_API_SECRET` |

### Analysis pipeline
1. Validate input → create `business_ideas` + `business_analyses` rows (new row per run; nothing is overwritten).
2. Geocode the location (Google or Nominatim).
3. Gemini step 1: overview, market, customers.
4. Gemini step 2: competition, SWOT, unit economics, risks.
5. Revenue, profit, margin and break-even are **calculated** from the AI's drivers.
6. Gemini step 3: raw materials, marketing, launch plan, component scores, recommendation.
7. Live supplier + nearby-business search, sorted by straight-line distance.
8. Score = weighted component scores, capped if the calculated economics are loss-making or far over budget.

Each stage is written to the database, and the progress screen shows it live. If any AI step fails, the analysis is marked failed and the UI shows "AI analysis could not be completed." — no sample data is ever substituted.

## Languages
- English, हिंदी and Hinglish. The choice is saved in the browser (it stays selected after a refresh), translates the whole interface (`src/lib/translations.ts`), and is sent to the backend so Gemini writes the analysis directly in that language (`systemFor()` in `netlify/lib/prompts.mts`). Nothing is translated from a fixed English response, and there is no list of allowed businesses or categories anywhere.
- Enum values and map-search keywords stay in English internally and are translated for display.
- If a saved analysis is in a different language from the one selected, the dashboard offers to generate a fresh analysis in the selected language.

## Environment variables (Netlify)

| Name | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | yes | Google AI Studio key |
| `SUPABASE_URL`, `SUPABASE_KEY` | yes | Project URL + publishable key |
| `SS_API_SECRET` | yes | Must match `startup_sense.config.api_secret` |
| `GOOGLE_MAPS_API_KEY` | no | Enables Google Places + Geocoding |
| `GEMINI_MODEL` | no | Override model id |
| `ALLOW_FAILURE_TEST` | no | Set `false` to disable the Settings → failure test |

## Database
Apply `supabase/migrations/001_startup_sense_schema.sql`, then insert the API secret:

```sql
insert into startup_sense.config(key, value) values ('api_secret', '<same as SS_API_SECRET>');
```

## Tests
`.github/workflows/e2e.yml` runs `tests/e2e.mjs` (Playwright) against the live site: tests A–E from the spec plus security, PDF, share, pivots and mobile checks. Results are pushed to the `e2e-results` branch.
