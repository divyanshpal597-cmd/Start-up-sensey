import type { ReactNode } from "react";
import { Clock, ExternalLink, Globe, Mail, MapPin, Navigation, Phone, Star } from "lucide-react";
import { mapsDirections, mapsView } from "../lib/format";
import { Pill, SIZE, Tag, cx } from "./ui";

function ActionLink({ href, icon, label, disabled }: { href?: string; icon: ReactNode; label: string; disabled?: boolean }) {
  if (disabled || !href) {
    return (
      <span className={cx("btn border border-slate-100 bg-slate-50 text-slate-300", SIZE.sm)} title={`${label}: not available`}>
        {icon} {label}
      </span>
    );
  }
  const external = href.startsWith("http");
  return (
    <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className={cx("btn-secondary", SIZE.sm)}>
      {icon} {label}
    </a>
  );
}

function websiteUrl(w: string) {
  return /^https?:\/\//i.test(w) ? w : `https://${w}`;
}

export default function PlaceCard({
  p, rank, origin, onHover, mode = "supplier",
}: {
  p: any; rank: number; origin: { lat: number; lng: number } | null; onHover?: (id: string | null) => void; mode?: "supplier" | "competitor";
}) {
  const hasContact = p.phone || p.email || p.website;
  return (
    <div
      data-testid="place-card"
      onMouseEnter={() => onHover?.(p.id)}
      onMouseLeave={() => onHover?.(null)}
      className="card p-4 transition hover:border-indigo-200 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-900 font-display text-sm font-bold text-white">{rank}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-slate-900" data-testid="place-name">{p.name}</h4>
            <Tag kind="verified" label={`Live listing · ${p.source}`} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="font-semibold text-indigo-700" data-testid="place-distance">{p.distanceKm} km away</span>
            <span>(straight-line from your location)</span>
            {p.supplierType && p.supplierType !== "Unclassified" && <Pill className="bg-slate-100 text-slate-600 ring-slate-200">{p.supplierType}</Pill>}
            {p.rating != null && (
              <span className="inline-flex items-center gap-1 text-amber-600"><Star className="h-3 w-3 fill-amber-400 stroke-amber-500" /> {p.rating} ({p.ratingCount ?? 0})</span>
            )}
            {p.openNow != null && <Pill className={p.openNow ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-rose-50 text-rose-700 ring-rose-200"}>{p.openNow ? "Open now" : "Closed now"}</Pill>}
          </div>
        </div>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div className="flex gap-2 sm:col-span-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <div>
            {p.locality && <div className="font-medium text-slate-700">{p.locality}</div>}
            <div className="text-slate-600">{p.address || "Address not listed in the data source"}</div>
            {p.addressApproximate && <div className="text-[11px] text-amber-700">Approximate address, derived from map coordinates</div>}
          </div>
        </div>
        <div className="flex gap-2">
          <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span className={p.phone ? "text-slate-700" : "text-slate-400"}>{p.phone || "Phone not listed"}</span>
        </div>
        <div className="flex gap-2">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span className={cx("truncate", p.email ? "text-slate-700" : "text-slate-400")}>{p.email || "Email not listed"}</span>
        </div>
        <div className="flex gap-2">
          <Globe className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span className={cx("truncate", p.website ? "text-slate-700" : "text-slate-400")}>{p.website || "Website not listed"}</span>
        </div>
        <div className="flex gap-2">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span className={cx("line-clamp-2", p.openingHours ? "text-slate-700" : "text-slate-400")}>{p.openingHours || "Hours not listed"}</span>
        </div>
      </dl>
      {!hasContact && <div className="mt-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-500">Contact information not available</div>}

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        <span className="text-slate-500">{mode === "supplier" ? "Relevant for:" : "Matched:"}</span>
        {(p.matchedFor || []).map((mat: string) => <Pill key={mat} className="bg-indigo-50 text-indigo-700 ring-indigo-200">{mat}</Pill>)}
        {p.matchReason && <span className="text-slate-400">· {p.matchReason}</span>}
      </div>
      {mode === "supplier" && <div className="mt-1 text-xs text-slate-400">Price: not listed by source — request a quote.</div>}

      <div className="mt-4 flex flex-wrap gap-2">
        <ActionLink href={mapsView(p.lat, p.lng)} icon={<MapPin className="h-3.5 w-3.5" />} label="View on Google Maps" />
        <ActionLink href={mapsDirections(origin, p)} icon={<Navigation className="h-3.5 w-3.5" />} label="Get Directions" />
        <ActionLink href={p.phone ? `tel:${p.phone.replace(/[^\d+]/g, "")}` : undefined} icon={<Phone className="h-3.5 w-3.5" />} label="Call" />
        <ActionLink href={p.email ? `mailto:${p.email}` : undefined} icon={<Mail className="h-3.5 w-3.5" />} label="Email" />
        <ActionLink href={p.website ? websiteUrl(p.website) : undefined} icon={<Globe className="h-3.5 w-3.5" />} label="Website" />
        {p.sourceUrl && <ActionLink href={p.sourceUrl} icon={<ExternalLink className="h-3.5 w-3.5" />} label="Source record" />}
      </div>
    </div>
  );
}
