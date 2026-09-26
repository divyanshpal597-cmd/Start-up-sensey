export type Money = { currency: string; locale: string };

export function moneyOf(idea: any, analysis?: any): Money {
  const meta = analysis?.aiAnalysis?.meta;
  return {
    currency: meta?.currency || idea?.currency || "INR",
    locale: meta?.locale || (idea?.currency === "INR" || !idea?.currency ? "en-IN" : "en-US"),
  };
}

export function fmtMoney(n: number | null | undefined, m: Money, opts: { compact?: boolean; decimals?: number } = {}) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  try {
    if (opts.compact && Math.abs(v) >= 100000) {
      if (m.currency === "INR") {
        const sym = "₹";
        if (Math.abs(v) >= 1e7) return `${v < 0 ? "-" : ""}${sym}${(Math.abs(v) / 1e7).toFixed(2).replace(/\.?0+$/, "")} Cr`;
        return `${v < 0 ? "-" : ""}${sym}${(Math.abs(v) / 1e5).toFixed(2).replace(/\.?0+$/, "")} L`;
      }
      return new Intl.NumberFormat(m.locale, { style: "currency", currency: m.currency, notation: "compact", maximumFractionDigits: 1 }).format(v);
    }
    return new Intl.NumberFormat(m.locale, {
      style: "currency",
      currency: m.currency,
      maximumFractionDigits: opts.decimals ?? (Math.abs(v) < 100 ? 2 : 0),
      minimumFractionDigits: 0,
    }).format(v);
  } catch {
    return `${m.currency} ${v.toLocaleString()}`;
  }
}

export function fmtNum(n: number | null | undefined, dp = 0) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: dp });
}

export function fmtPct(n: number | null | undefined, dp = 1) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return `${Number(n).toFixed(dp)}%`;
}

export function fmtMonths(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "Not reached";
  const v = Number(n);
  if (v < 1) return `${Math.max(1, Math.round(v * 30))} days`;
  if (v > 120) return "10+ years";
  return `${v.toFixed(1)} months`;
}

export function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function scoreTone(score: number | null | undefined) {
  const s = Number(score ?? 0);
  if (s >= 7.5) return { text: "text-emerald-600", bg: "bg-emerald-500", soft: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Strong" };
  if (s >= 6) return { text: "text-indigo-600", bg: "bg-indigo-500", soft: "bg-indigo-50 text-indigo-700 ring-indigo-200", label: "Promising" };
  if (s >= 4.5) return { text: "text-amber-600", bg: "bg-amber-500", soft: "bg-amber-50 text-amber-700 ring-amber-200", label: "Needs work" };
  return { text: "text-rose-600", bg: "bg-rose-500", soft: "bg-rose-50 text-rose-700 ring-rose-200", label: "Weak" };
}

export function levelTone(level: string | undefined) {
  const l = (level || "").toLowerCase();
  if (l.includes("very high") || l === "high") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (l.includes("moderate") || l.includes("medium")) return "bg-amber-50 text-amber-700 ring-amber-200";
  if (l.includes("low")) return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

/** Competition is inverted: high competition is bad news. */
export function competitionTone(level: string | undefined) {
  const l = (level || "").toLowerCase();
  if (l.includes("very high") || l === "high") return "bg-rose-50 text-rose-700 ring-rose-200";
  if (l.includes("moderate")) return "bg-amber-50 text-amber-700 ring-amber-200";
  if (l.includes("low")) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export function verdictTone(v: string | undefined) {
  const s = (v || "").toLowerCase();
  if (s === "go") return "bg-emerald-600 text-white";
  if (s.includes("changes")) return "bg-indigo-600 text-white";
  if (s.includes("pivot")) return "bg-amber-500 text-white";
  if (s.includes("not")) return "bg-rose-600 text-white";
  return "bg-slate-600 text-white";
}

export const mapsView = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
export const mapsDirections = (from: { lat: number; lng: number } | null, to: { lat: number; lng: number }) =>
  `https://www.google.com/maps/dir/?api=1${from ? `&origin=${from.lat},${from.lng}` : ""}&destination=${to.lat},${to.lng}`;
export const mapsSearch = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
