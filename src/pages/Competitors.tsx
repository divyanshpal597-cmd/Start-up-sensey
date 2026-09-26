import { useState } from "react";
import { Crosshair, RefreshCw, Search, Shield, Swords, Zap } from "lucide-react";
import { useCurrentIdea } from "../context/CurrentIdea";
import { useJob } from "../lib/useJob";
import { competitionTone } from "../lib/format";
import PlaceCard from "../components/PlaceCard";
import PlacesMap from "../components/PlacesMap";
import { BulletList, Card, ErrorBox, NeedsAnalysis, Notice, PageHeader, Pill, SIZE, Spinner, Tag, cx } from "../components/ui";

export default function Competitors() {
  const ctx = useCurrentIdea();
  return (
    <NeedsAnalysis ctx={ctx}>
      <Body />
    </NeedsAnalysis>
  );
}

function Body() {
  const { idea, analysis, ai } = useCurrentIdea();
  const c = ai.competitorAnalysis || {};
  const live = analysis.competitorsLive || { status: "unavailable", results: [] };
  const results: any[] = live.results || [];
  const { running, start, error } = useJob("competitors");
  const [radius, setRadius] = useState<number>(live.radiusKm || 15);
  const [hover, setHover] = useState<string | null>(null);
  const origin = typeof idea.latitude === "number" ? { lat: idea.latitude, lng: idea.longitude } : live.center || null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Competitor War Room"
        title={`Competition for ${ai.businessOverview?.businessName}`}
        subtitle="Competitor profiles below are AI assumptions about typical businesses of each type. Nearby businesses are real listings from live map data, matched by keywords — confirm what they actually sell."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Competition level" icon={<Swords className="h-4 w-4" />} action={<Tag kind="ai" />}>
          <Pill className={competitionTone(c.competitionLevel)}>{c.competitionLevel}</Pill>
          <p className="mt-3 text-sm text-slate-600">{c.summary}</p>
        </Card>
        <Card title="Competitive factors" icon={<Crosshair className="h-4 w-4" />} action={<Tag kind="ai" />}>
          <BulletList items={c.competitiveFactors} />
        </Card>
        <Card title="Differentiation opportunities" icon={<Zap className="h-4 w-4" />} action={<Tag kind="ai" />}>
          <BulletList items={c.differentiationOpportunities} />
        </Card>
      </div>

      <Card title="Direct competitor types" subtitle="Typical players — not specific named companies." icon={<Shield className="h-4 w-4" />} action={<Tag kind="assumption" />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Competitor type</th>
                <th className="py-2 pr-3">Products / services</th>
                <th className="py-2 pr-3">Typical pricing</th>
                <th className="py-2 pr-3">Strengths</th>
                <th className="py-2">Weaknesses</th>
              </tr>
            </thead>
            <tbody>
              {(c.directCompetitorTypes || []).map((x: any, i: number) => (
                <tr key={i} className="border-b border-slate-100 align-top last:border-0">
                  <td className="py-3 pr-3 font-semibold text-slate-900">{x.type}</td>
                  <td className="py-3 pr-3 text-slate-600">{x.description}</td>
                  <td className="py-3 pr-3 text-slate-600">{x.typicalPricing} <span className="block text-[11px] text-amber-700">AI assumption</span></td>
                  <td className="py-3 pr-3 text-slate-600"><ul className="space-y-1">{(x.strengths || []).map((s: string, j: number) => <li key={j}>+ {s}</li>)}</ul></td>
                  <td className="py-3 text-slate-600"><ul className="space-y-1">{(x.weaknesses || []).map((s: string, j: number) => <li key={j}>− {s}</li>)}</ul></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Indirect competitors</div>
          <div className="grid gap-3 md:grid-cols-3">
            {(c.indirectCompetitors || []).map((x: any, i: number) => (
              <div key={i} className="rounded-xl bg-slate-50 p-3 text-sm">
                <div className="font-semibold text-slate-800">{x.type}</div>
                <div className="mt-1 text-slate-600">{x.description}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {live.status === "unavailable" ? (
        <ErrorBox
          title="Live business search is temporarily unavailable."
          actions={<button onClick={() => start({ radiusKm: radius })} disabled={running} className={cx("btn-primary", SIZE.md)}>{running ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Try again</button>}
        >
          No nearby businesses are shown because the data source could not be reached. Nothing has been invented in their place.
        </ErrorBox>
      ) : (
        <Card
          title={`Nearby similar businesses (${results.length})`}
          subtitle={`Real listings within ${live.radiusKm} km matching: ${(live.keywords || c.searchKeywords || []).join(", ") || "—"}${(live.osmTags || []).length ? ` · tags ${live.osmTags.join(", ")}` : ""}. Sources: ${(live.sources || []).join(" + ") || "—"}`}
          action={
            <div className="flex items-center gap-2">
              <select className="input w-24 py-1.5 text-xs" value={radius} onChange={(e) => setRadius(Number(e.target.value))} aria-label="Radius">
                {[5, 10, 15, 25, 40].map((r) => <option key={r} value={r}>{r} km</option>)}
              </select>
              <button onClick={() => start({ radiusKm: radius })} disabled={running} className={cx("btn-primary", SIZE.sm)}>
                {running ? <Spinner className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />} {running ? "Searching…" : "Search"}
              </button>
            </div>
          }
        >
          {error && <div className="mb-3"><Notice tone="warn">{error}</Notice></div>}
          <div className="mb-4"><Notice>These are real businesses found near your location by name/category match. Whether each one is a direct competitor is <b>not verified</b> — check before drawing conclusions.</Notice></div>
          {origin && results.length > 0 && <PlacesMap center={origin} places={results} radiusKm={live.radiusKm} highlightId={hover} height={300} />}
          <div className="mt-4 space-y-3">
            {results.map((p, i) => <PlaceCard key={p.id} p={p} rank={i + 1} origin={origin} onHover={setHover} mode="competitor" />)}
            {!results.length && <p className="text-sm text-slate-500">No similar businesses were found in live map data within this radius. That may mean low local competition — or simply that local businesses aren’t mapped. Verify on the ground.</p>}
          </div>
        </Card>
      )}
    </div>
  );
}
