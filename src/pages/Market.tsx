import { CalendarRange, Globe2, LineChart, MapPinned, Radar as RadarIcon, TrendingUp } from "lucide-react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { useCurrentIdea } from "../context/CurrentIdea";
import { levelTone } from "../lib/format";
import { BulletList, Card, NeedsAnalysis, PageHeader, Pill, Tag } from "../components/ui";

export default function Market() {
  const ctx = useCurrentIdea();
  return (
    <NeedsAnalysis ctx={ctx}>
      <Body />
    </NeedsAnalysis>
  );
}

function Body() {
  const { idea, ai } = useCurrentIdea();
  const mk = ai.marketAnalysis || {};
  const comps = ai.scoring?.components || {};
  const radar = [
    { k: "Demand", v: comps.demand?.score },
    { k: "Opportunity", v: comps.marketOpportunity?.score },
    { k: "Competition", v: comps.competition?.score },
    { k: "Profitability", v: comps.profitability?.score },
    { k: "Feasibility", v: comps.feasibility?.score },
    { k: "Low risk", v: comps.risk?.score },
  ].map((x) => ({ ...x, v: Number(x.v ?? 0) }));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Market Scanner" title={`Market for ${ai.businessOverview?.businessName}`} subtitle={`Demand, opportunity and local factors in ${idea.location}. All market figures are AI estimates.`} />
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Demand" icon={<TrendingUp className="h-4 w-4" />} action={<Tag kind="ai" />}>
          <Pill className={levelTone(mk.demandLevel)}>{mk.demandLevel}</Pill>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{mk.demandSummary}</p>
        </Card>
        <Card title="Estimated market size" icon={<Globe2 className="h-4 w-4" />} action={<Tag kind="ai" />}>
          <div className="font-display text-xl font-extrabold text-slate-900">{mk.estimatedMarketSize?.value || "—"}</div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500"><b>How estimated:</b> {mk.estimatedMarketSize?.basis}</p>
        </Card>
        <Card title="Growth potential" icon={<LineChart className="h-4 w-4" />} action={<Tag kind="ai" />}>
          <Pill className={levelTone(mk.growthPotential?.level)}>{mk.growthPotential?.level}</Pill>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{mk.growthPotential?.rationale}</p>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Market opportunity" icon={<RadarIcon className="h-4 w-4" />} action={<Tag kind="ai" />}>
          <p className="text-sm leading-relaxed text-slate-700">{mk.marketOpportunity}</p>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Trends</div>
              <BulletList items={mk.trends} />
            </div>
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><MapPinned className="h-3.5 w-3.5" /> Local factors · {idea.city}</div>
              <BulletList items={mk.localMarketFactors} />
            </div>
          </div>
        </Card>
        <Card className="lg:col-span-2" title="Opportunity radar" subtitle="AI component scores (0–10)" action={<Tag kind="ai" />}>
          <div className="h-72">
            <ResponsiveContainer>
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="k" fontSize={11} tick={{ fill: "#475569" }} />
                <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                <Radar dataKey="v" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <Card title="Seasonality" icon={<CalendarRange className="h-4 w-4" />} action={<Tag kind="ai" />}>
        <p className="text-sm text-slate-700">{mk.seasonality?.summary}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-emerald-50 p-4">
            <div className="mb-2 text-xs font-bold uppercase text-emerald-700">Peak periods</div>
            <div className="flex flex-wrap gap-2">{(mk.seasonality?.peakPeriods || []).map((p: string) => <Pill key={p} className="bg-white text-emerald-700 ring-emerald-200">{p}</Pill>)}</div>
          </div>
          <div className="rounded-xl bg-amber-50 p-4">
            <div className="mb-2 text-xs font-bold uppercase text-amber-700">Slow periods</div>
            <div className="flex flex-wrap gap-2">{(mk.seasonality?.slowPeriods || []).map((p: string) => <Pill key={p} className="bg-white text-amber-700 ring-amber-200">{p}</Pill>)}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
