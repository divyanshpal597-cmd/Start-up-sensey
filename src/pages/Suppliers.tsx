import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, ExternalLink, Filter, Package, RefreshCw, Search } from "lucide-react";
import { useCurrentIdea } from "../context/CurrentIdea";
import { useJob } from "../lib/useJob";
import { mapsSearch } from "../lib/format";
import PlaceCard from "../components/PlaceCard";
import PlacesMap from "../components/PlacesMap";
import { Card, ErrorBox, NeedsAnalysis, Notice, PageHeader, Pill, SIZE, Spinner, Tag, cx } from "../components/ui";

const TYPES = ["Manufacturers", "Factories", "Raw Material Suppliers", "Wholesalers", "Distributors", "Dealers", "Unclassified"];

export default function Suppliers() {
  const ctx = useCurrentIdea();
  return (
    <NeedsAnalysis ctx={ctx}>
      <Body />
    </NeedsAnalysis>
  );
}

function Body() {
  const { idea, analysis, ai } = useCurrentIdea();
  const sc = ai.supplyChainRequirements || {};
  const data = analysis.suppliers || { status: "unavailable", results: [] };
  const results: any[] = data.results || [];
  const { running, start, error } = useJob("suppliers");
  const origin = typeof idea.latitude === "number" ? { lat: idea.latitude, lng: idea.longitude } : data.center || null;

  const [maxKm, setMaxKm] = useState<number>(Math.ceil(data.radiusKm || 60));
  const [type, setType] = useState("");
  const [material, setMaterial] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState<"nearest" | "match" | "price">("nearest");
  const [radius, setRadius] = useState<number>(data.radiusKm || 25);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    setMaxKm(Math.ceil(data.radiusKm || 60));
    if (data.radiusKm) setRadius(data.radiusKm);
  }, [data.searchedAt, data.radiusKm]);

  const hasRatings = results.some((r) => r.rating != null);
  const hasOpen = results.some((r) => r.openNow != null);
  const hasPrice = results.some((r) => r.price != null);

  const filtered = useMemo(() => {
    let r = results.filter((x) => x.distanceKm <= maxKm);
    if (type) r = r.filter((x) => x.supplierType === type);
    if (material) r = r.filter((x) => (x.matchedFor || []).includes(material));
    if (minRating > 0) r = r.filter((x) => x.rating != null && x.rating >= minRating);
    if (openOnly) r = r.filter((x) => x.openNow === true);
    r = [...r];
    if (sort === "nearest") r.sort((a, b) => a.distanceKm - b.distanceKm);
    if (sort === "match") r.sort((a, b) => b.relevance - a.relevance || a.distanceKm - b.distanceKm);
    if (sort === "price" && hasPrice) r.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    return r;
  }, [results, maxKm, type, material, minRating, openOnly, sort, hasPrice]);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    results.forEach((r) => (c[r.supplierType] = (c[r.supplierType] || 0) + 1));
    return c;
  }, [results]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Smart Supply Chain Finder"
        title={`Supply chain for ${ai.businessOverview?.businessName}`}
        subtitle={`Materials identified by AI for this business, and the nearest real sources to ${idea.location} from live map data.`}
      />

      <Card title="Required raw materials & resources" subtitle={sc.summary} icon={<Package className="h-4 w-4" />} action={<Tag kind="ai" label="Identified by AI" />}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="materials">
          {(sc.materials || []).map((mat: any) => {
            const count = results.filter((r) => (r.matchedFor || []).includes(mat.name)).length;
            return (
              <button
                key={mat.name}
                onClick={() => setMaterial(material === mat.name ? "" : mat.name)}
                className={cx("rounded-xl border p-4 text-left transition", material === mat.name ? "border-indigo-400 bg-indigo-50 ring-4 ring-indigo-100" : "border-slate-200 hover:bg-slate-50")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-slate-900" data-testid="material-name">{mat.name}</div>
                  <Pill className="bg-slate-100 text-slate-600 ring-slate-200">{mat.category}</Pill>
                </div>
                <p className="mt-1 text-xs text-slate-500">{mat.description}</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  {mat.estimatedQuantity && <span><b>Qty:</b> {mat.estimatedQuantity}</span>}
                  {mat.estimatedCost && <span><b>Est. cost:</b> {mat.estimatedCost} <span className="text-violet-600">(AI Estimate)</span></span>}
                </div>
                <div className="mt-2 text-xs font-semibold text-indigo-600">{count} live source{count === 1 ? "" : "s"} found</div>
              </button>
            );
          })}
        </div>
      </Card>

      {data.status === "unavailable" ? (
        <ErrorBox
          title="Live supplier search is temporarily unavailable."
          actions={<button onClick={() => start({ radiusKm: radius })} disabled={running} className={cx("btn-primary", SIZE.md)}>{running ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Try again</button>}
        >
          No supplier listings are shown because the live data source could not be reached. Nothing has been invented in their place.
          {data.errors?.length ? <span className="mt-1 block text-xs opacity-75">{data.errors.join(" · ")}</span> : null}
        </ErrorBox>
      ) : (
        <>
          <Card
            title="Nearest raw material sources"
            subtitle={`${results.length} live listings within ${data.radiusKm} km · Sources: ${(data.sources || []).join(" + ") || "—"}${data.autoExpanded ? " · radius widened automatically" : ""}`}
            icon={<Boxes className="h-4 w-4" />}
            action={
              <div className="flex items-center gap-2">
                <select className="input w-28 py-1.5 text-xs" value={radius} onChange={(e) => setRadius(Number(e.target.value))} aria-label="Search radius">
                  {[5, 10, 20, 25, 40, 50, 60].map((r) => <option key={r} value={r}>{r} km</option>)}
                </select>
                <button onClick={() => start({ radiusKm: radius })} disabled={running} className={cx("btn-primary", SIZE.sm)}>
                  {running ? <Spinner className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />} {running ? "Searching…" : "Search again"}
                </button>
              </div>
            }
          >
            {error && <div className="mb-3"><Notice tone="warn">{error}</Notice></div>}
            {data.status === "partial" && <div className="mb-3"><Notice tone="warn">Some data sources failed: {(data.errors || []).join(" · ")}</Notice></div>}
            {!data.googleEnabled && (
              <div className="mb-3"><Notice>Listings come from OpenStreetMap. Many small Indian suppliers are not mapped with phone numbers — add a Google Places key in Settings for richer contact data.</Notice></div>
            )}
            {origin && <PlacesMap center={origin} places={filtered.slice(0, 80)} radiusKm={data.radiusKm} highlightId={hover} />}
          </Card>

          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            <aside className="card h-max space-y-4 p-4 lg:sticky lg:top-20">
              <div className="flex items-center gap-2 font-semibold text-slate-900"><Filter className="h-4 w-4" /> Filters</div>
              <div>
                <label className="label text-xs">Max distance: {maxKm} km</label>
                <input type="range" min={1} max={Math.max(5, Math.ceil(data.radiusKm || 60))} value={maxKm} onChange={(e) => setMaxKm(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="label text-xs">Supplier type</label>
                <select className="input py-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="">All types</option>
                  {TYPES.map((t) => <option key={t} value={t}>{t} ({typeCounts[t] || 0})</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Raw material</label>
                <select className="input py-2 text-sm" value={material} onChange={(e) => setMaterial(e.target.value)}>
                  <option value="">All materials</option>
                  {(sc.materials || []).map((m: any) => <option key={m.name} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Price</label>
                <select className="input py-2 text-sm" disabled><option>No verified price data</option></select>
                <p className="mt-1 text-[11px] text-slate-400">Sources don’t publish prices. Request quotes directly.</p>
              </div>
              <div>
                <label className="label text-xs">Minimum rating {hasRatings ? "" : "(no verified ratings)"}</label>
                <select className="input py-2 text-sm" disabled={!hasRatings} value={minRating} onChange={(e) => setMinRating(Number(e.target.value))}>
                  {[0, 3, 3.5, 4, 4.5].map((r) => <option key={r} value={r}>{r ? `${r}+` : "Any"}</option>)}
                </select>
              </div>
              <label className={cx("flex items-center gap-2 text-sm", !hasOpen && "text-slate-400")}>
                <input type="checkbox" disabled={!hasOpen} checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
                Open now only {hasOpen ? "" : "(not verified)"}
              </label>
              <div>
                <label className="label text-xs">Sort by</label>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 text-xs">
                  {([
                    ["nearest", "Nearest"],
                    ["match", "Best Match"],
                    ["price", "Lowest Price"],
                  ] as const).map(([k, l]) => (
                    <button
                      key={k}
                      disabled={k === "price" && !hasPrice}
                      title={k === "price" && !hasPrice ? "No price data is available, so we can't rank by price" : undefined}
                      onClick={() => setSort(k)}
                      className={cx("rounded-lg px-1 py-1.5 font-semibold disabled:cursor-not-allowed disabled:text-slate-300", sort === k ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600")}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {(type || material || maxKm < (data.radiusKm || 60) || minRating || openOnly) && (
                <button className={cx("btn-ghost w-full", SIZE.sm)} onClick={() => { setType(""); setMaterial(""); setMaxKm(Math.ceil(data.radiusKm || 60)); setMinRating(0); setOpenOnly(false); }}>Clear filters</button>
              )}
            </aside>

            <div className="space-y-3" data-testid="supplier-results">
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>Showing <b className="text-slate-900">{filtered.length}</b> of {results.length} sources · {sort === "nearest" ? "nearest first" : sort === "match" ? "best match first" : "lowest price first"}</span>
              </div>
              {filtered.map((p, i) => (
                <PlaceCard key={p.id} p={p} rank={i + 1} origin={origin} onHover={setHover} />
              ))}
              {!filtered.length && (
                <div className="card p-6 text-center text-sm text-slate-500">
                  {results.length ? "No sources match these filters." : "No matching suppliers were found in live map data for this area."}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <Card
        title="Where else to look"
        subtitle="AI-generated pointers — these are not live listings. Use the search links to find real businesses on Google Maps."
        icon={<AlertTriangle className="h-4 w-4" />}
        action={<Tag kind="unverified" />}
      >
        <ul className="space-y-2">
          {(sc.whereToLook || data.whereToLook || []).map((w: string, i: number) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          {(sc.materials || []).slice(0, 6).map((m: any) => (
            <a key={m.name} href={mapsSearch(`${m.name} supplier near ${idea.city}`)} target="_blank" rel="noopener noreferrer" className={cx("btn-secondary", SIZE.sm)}>
              <ExternalLink className="h-3.5 w-3.5" /> Search “{m.name}” on Google Maps
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
