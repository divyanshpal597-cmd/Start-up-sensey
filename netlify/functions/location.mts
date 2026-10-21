// /api/location — live location sharing between the iPhone app (writer) and the /find page (viewer).
// POST   (x-share-id + x-write-key)  the iPhone uploads new points; the first upload claims the share id.
// GET    (x-share-id)                the viewer reads the latest point and the last 24 hours of track.
// DELETE (x-share-id + x-write-key)  the iPhone erases everything stored for its share id.
// Ids travel in headers (never in the URL) so they do not end up in access logs.
import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { HttpError, errorResponse, json, readJson, sha256Hex } from "../lib/http.mts";

const KEY_RE = /^[A-Za-z0-9_-]{22,128}$/;
const TRACK_WINDOW_MS = 24 * 3600 * 1000;
const MAX_TRACK_POINTS = 2000;
const MAX_POINTS_PER_UPLOAD = 100;

type Point = { lat: number; lon: number; acc: number | null; alt: number | null; spd: number | null; crs: number | null; ts: number };
type Record = { writeKeyHash: string; battery: number | null; charging: boolean | null; device: string | null; points: Point[] };

function header(req: Request, name: string): string {
  const v = req.headers.get(name) || "";
  if (!KEY_RE.test(v)) throw new HttpError(401, "invalid_key", `Missing or invalid ${name}.`);
  return v;
}

const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;

function parsePoint(p: any, now: number): Point | null {
  const lat = num(p?.lat, -90, 90);
  const lon = num(p?.lon, -180, 180);
  const ts = num(p?.ts, now - TRACK_WINDOW_MS, now + 5 * 60 * 1000);
  if (lat === null || lon === null || ts === null) return null;
  return {
    lat,
    lon,
    acc: num(p?.acc, 0, 100_000),
    alt: num(p?.alt, -1000, 100_000),
    spd: num(p?.spd, 0, 1000),
    crs: num(p?.crs, 0, 360),
    ts: Math.round(ts),
  };
}

export default async (req: Request) => {
  try {
    const store = getStore({ name: "location-share", consistency: "strong" });
    const shareId = header(req, "x-share-id");
    const key = await sha256Hex(`location-share:${shareId}`);
    const existing = (await store.get(key, { type: "json" })) as Record | null;

    if (req.method === "GET") {
      if (!existing || existing.points.length === 0) {
        throw new HttpError(404, "not_found", "No location has been shared with this link yet.");
      }
      const pts = existing.points;
      return json({
        latest: pts[pts.length - 1],
        track: pts,
        battery: existing.battery,
        charging: existing.charging,
        device: existing.device,
        serverTime: Date.now(),
      });
    }

    const writeKeyHash = await sha256Hex(`location-share-write:${header(req, "x-write-key")}`);
    if (existing && existing.writeKeyHash !== writeKeyHash) {
      throw new HttpError(403, "wrong_write_key", "This share id belongs to another device.");
    }

    if (req.method === "DELETE") {
      await store.delete(key);
      return json({ ok: true });
    }

    const body = await readJson(req, 60_000);
    const now = Date.now();
    const incoming = (Array.isArray(body?.points) ? body.points : [])
      .slice(0, MAX_POINTS_PER_UPLOAD)
      .map((p: unknown) => parsePoint(p, now))
      .filter(Boolean) as Point[];
    if (incoming.length === 0) throw new HttpError(400, "no_points", "No valid location points in the upload.");

    const seen = new Set<number>();
    const points = [...(existing?.points || []), ...incoming]
      .filter((p) => p.ts >= now - TRACK_WINDOW_MS && !seen.has(p.ts) && seen.add(p.ts))
      .sort((a, b) => a.ts - b.ts)
      .slice(-MAX_TRACK_POINTS);

    const record: Record = {
      writeKeyHash,
      battery: num(body?.battery, 0, 1) ?? existing?.battery ?? null,
      charging: typeof body?.charging === "boolean" ? body.charging : existing?.charging ?? null,
      device: typeof body?.device === "string" ? body.device.slice(0, 60) : existing?.device ?? null,
      points,
    };
    await store.setJSON(key, record);
    return json({ ok: true, stored: points.length });
  } catch (e) {
    return errorResponse(e);
  }
};

export const config: Config = { path: "/api/location", method: ["GET", "POST", "DELETE"] };
