import { Link } from "react-router-dom";
import {
  ArrowRight, Boxes, Building2, CalendarClock, FileText, MapPin, RefreshCw, Sparkles, Target, TrendingUp, Users, Wallet,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCurrentIdea } from "../context/CurrentIdea";
import { fmtDate, fmtMoney, fmtMonths, fmtPct, levelTone, competitionTone, moneyOf, scoreTone, verdictTone } from "../lib/format";
import { Card, MiniBar, NeedsAnalysis, Pill, ScoreRing, SIZE, Stat, Tag, cx } from "../components/ui";
import { t } from "../lib/i18n";
import { LanguageMismatch } from "../components/LanguageMismatch";

const COMPONENT_LABELS: Record<string, string> = {
  demand: "Market demand",
  marketOpportunity: "Market opportunity",
  competition: "Competitive position",
  profitability: "Profitability",
  feasibility: "Budget feasibility",
  risk: "Risk (higher = safer)",
};

export function SwotGrid({ swot }: { swot: any }) {
  const blocks = [
    { k: "strengths", t: "Strengths", c: "border-emerald-200 bg-emerald-50/60", h: "text-emerald-700" },
    { k: "weaknesses", t: "Weaknesses", c: "border-rose-200 bg-rose-50/60", h: "text-rose-700" },
    { k: "opportunities", t: "Opportunities", c: "border-sky-200 bg-sky-50/60", h: "text-sky-700" },
    { k: "threats", t: "Threats", c: "border-amber-200 bg-amber-50/60", h: "text-amber-700" },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {blocks.map((b) => (
        <div key={b.k} className={cx("rounded-xl border p-4", b.c)}>
          <div className={cx("mb-2 text-sm font-bold", b.h)}>{t(b.t)}</div>
          <ul className="space-y-1.5">
            {(swot?.[b.k] || []).map((s: string, i: number) => (
              <li key={i} className="text-sm leading-snug text-slate-700">• {s}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const ctx = useCurrentIdea();
  return (
    <NeedsAnalysis ctx={ctx}>
      <DashboardBody />
    </NeedsAnalysis>
  );
}

function DashboardBody() {
  const { idea, analysis, ai } = useCurrentIdea();
  const m = moneyOf(idea, analysis);
  const fin = ai.financialAnalysis || {};
  const calc = fin.calculated || {};
  const score = Number(analysis.score);
  const tone = scoreTone(score);
  const comps = ai.scoring?.components || {};
  const rec = ai.recommendation || {};
  const ov = ai.businessOverview || {};
  const chartData = [
    { name: t("Revenue"), value: calc.monthlyRevenue, fill: "#6366f1" },
    { name: t("Expenses"), value: calc.monthlyExpenses, fill: "#f59e0b" },
    { name: t("Profit"), value: calc.monthlyProfit, fill: calc.monthlyProfit >= 0 ? "#10b981" : "#f43f5e" },
  ];

  return (
    <div className="space-y-6">
      <LanguageMismatch />
      {/* Hero */}
      <div className="card bg-hero overflow-hidden p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Pill className="bg-indigo-50 text-indigo-700 ring-indigo-200">{t(ov.businessType || idea.businessType)}</Pill>
              {ov.category && <Pill>{ov.category}</Pill>}
              {ov.suggestedBrandName && ov.suggestedBrandName !== ov.businessName && (
                <span className="text-xs text-slate-500">{t("AI brand idea:")} <b className="text-slate-700">{ov.suggestedBrandName}</b></span>
              )}
              <span className="text-xs text-slate-500">{t("Analysed {date}", { date: fmtDate(analysis.updatedAt) })}</span>
            </div>
            <h1 data-testid="business-name" className="mt-2 font-display text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
              {ov.businessName || idea.businessName}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{ov.summary}</p>
            <div className="mt-4 grid gap-x-6 gap-y-2 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
              <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400" /> <span data-testid="business-location">{idea.location}</span></div>
              <div className="flex items-center gap-2"><Wallet className="h-4 w-4 text-slate-400" /> {t("Budget")} {fmtMoney(idea.budget, m)} <Tag kind="user" label="Input" /></div>
              <div className="flex items-center gap-2 sm:col-span-2"><Users className="h-4 w-4 text-slate-400" /> <span className="truncate">{idea.expectedCustomers || ov.targetCustomer || "—"}</span></div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-5 rounded-2xl bg-white/80 p-4 ring-1 ring-slate-200">
            <ScoreRing score={score} />
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("AI Validation Score")}</div>
              <div className={cx("mt-1 text-lg font-bold", tone.text)}>{tone.label}</div>
              <div className={cx("mt-2 inline-flex rounded-lg px-2.5 py-1 text-xs font-bold", verdictTone(rec.verdict))}>{t(rec.verdict)}</div>
              <div className="mt-2"><Tag kind="ai" /></div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Market demand" icon={<TrendingUp className="h-3.5 w-3.5" />} tag="ai"
          value={<Pill className={levelTone(ai.marketAnalysis?.demandLevel)}>{t(ai.marketAnalysis?.demandLevel || "—")}</Pill>}
          sub={ai.marketAnalysis?.demandSummary} />
        <Stat label="Market opportunity" icon={<Target className="h-3.5 w-3.5" />} tag="ai"
          value={<span className="text-lg">{t("{level} growth", { level: t(ai.marketAnalysis?.growthPotential?.level || "—") })}</span>}
          sub={ai.marketAnalysis?.estimatedMarketSize?.value} />
        <Stat label="Competition" icon={<Building2 className="h-3.5 w-3.5" />} tag="ai"
          value={<Pill className={competitionTone(ai.competitorAnalysis?.competitionLevel)}>{t(ai.competitorAnalysis?.competitionLevel || "—")}</Pill>}
          sub={ai.competitorAnalysis?.summary} />
        <Stat label="Estimated investment" icon={<Wallet className="h-3.5 w-3.5" />} tag="ai"
          value={fmtMoney(fin.estimatedInvestment, m, { compact: true })}
          sub={fin.estimatedInvestment > idea.budget ? t("Above your budget of {x}", { x: fmtMoney(idea.budget, m) }) : t("Within your budget of {x}", { x: fmtMoney(idea.budget, m) })} />
        <Stat label="Est. monthly revenue" tag="calc" value={fmtMoney(calc.monthlyRevenue, m, { compact: true })}
          sub={t("{price} × {units} {unit}/day × {days} days (AI drivers)", { price: fmtMoney(fin.sellingPricePerUnit, m), units: fin.unitsPerDay, unit: fin.unitLabel, days: fin.workingDaysPerMonth })} />
        <Stat label="Est. monthly profit" tag="calc" value={fmtMoney(calc.monthlyProfit, m, { compact: true })}
          tone={calc.monthlyProfit >= 0 ? "text-emerald-600" : "text-rose-600"} sub={t("Margin {x}", { x: fmtPct(calc.profitMargin) })} />
        <Stat label="Break-even" icon={<CalendarClock className="h-3.5 w-3.5" />} tag="calc" value={fmtMonths(calc.breakEvenMonths)}
          sub={calc.breakEvenUnitsPerMonth ? t("Needs ~{n} {unit}/month to cover fixed costs", { n: Math.ceil(calc.breakEvenUnitsPerMonth).toLocaleString("en-IN"), unit: fin.unitLabel }) : t("Price does not cover variable cost")} />
        <Stat label="Nearby sources found" icon={<Boxes className="h-3.5 w-3.5" />} tag="verified"
          value={analysis.suppliers?.status === "unavailable" ? "—" : (analysis.suppliers?.results?.length ?? 0)}
          sub={analysis.suppliers?.status === "unavailable" ? "Live supplier search is temporarily unavailable." : t("Within {r} km · {sources}", { r: analysis.suppliers?.radiusKm ?? "—", sources: (analysis.suppliers?.sources || []).join(", ") })} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="AI Recommendation" icon={<Sparkles className="h-4 w-4" />} action={<Tag kind="ai" />}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx("rounded-lg px-2.5 py-1 text-xs font-bold", verdictTone(rec.verdict))}>{t(rec.verdict)}</span>
            <span className="font-semibold text-slate-900">{rec.headline}</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{rec.summary}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{t("Key actions")}</div>
              <ol className="space-y-1.5 text-sm text-slate-700">
                {(rec.keyActions || []).map((a: string, i: number) => <li key={i}>{i + 1}. {a}</li>)}
              </ol>
            </div>
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{t("Conditions for success")}</div>
              <ul className="space-y-1.5 text-sm text-slate-700">
                {(rec.conditions || []).map((a: string, i: number) => <li key={i}>• {a}</li>)}
              </ul>
            </div>
          </div>
        </Card>

        <Card title="Score breakdown" subtitle="Weighted AI component scores" action={<Tag kind="ai" />}>
          <div className="space-y-3">
            {Object.entries(COMPONENT_LABELS).map(([k, label]) => {
              const c = comps[k];
              if (!c) return null;
              return (
                <div key={k} title={c.reason + (c.adjusted ? ` — ${c.adjusted}` : "")}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium text-slate-700">{t(label)}</span>
                    <span className="font-semibold text-slate-900">{Number(c.score).toFixed(1)}</span>
                  </div>
                  <MiniBar value={c.score} color={scoreTone(c.score).bg} />
                  {c.adjusted && <div className="mt-1 text-[11px] text-amber-700">{t(c.adjusted)}</div>}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="SWOT" subtitle={t("For {name} in {city}", { name: ov.businessName, city: idea.city })} action={<Tag kind="ai" />}>
          <SwotGrid swot={ai.swot} />
        </Card>
        <Card title="Monthly economics" subtitle="Steady-state month" action={<Tag kind="calc" />}>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} stroke="#eef0f6" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={70} tickFormatter={(v) => fmtMoney(v, m, { compact: true })} />
                <Tooltip formatter={(v: any) => fmtMoney(v, m)} cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {chartData.map((d) => <Cell key={d.name} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Link to="/financial" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600">{t("Open Financial Planner")} <ArrowRight className="h-4 w-4" /></Link>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { to: "/suppliers", t: "Nearest suppliers", d: "Live listings sorted by distance", i: Boxes },
          { to: "/competitors", t: "Competitor War Room", d: "Nearby similar businesses", i: Building2 },
          { to: "/stress-test", t: "Stress test", d: "Demand & cost shocks", i: RefreshCw },
          { to: "/reports", t: "Full report", d: "Download PDF · Print · Share", i: FileText },
        ].map((x) => (
          <Link key={x.to} to={x.to} className="card group flex items-center gap-3 p-4 transition hover:border-indigo-200 hover:shadow-md">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><x.i className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-slate-900">{t(x.t)}</div>
              <div className="truncate text-xs text-slate-500">{t(x.d)}</div>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
          </Link>
        ))}
      </div>
      <p className="text-center text-xs text-slate-400">{t(ai.meta?.disclaimer || "")}</p>
      <div className="text-center">
        <Link to="/new" className={cx("btn-secondary", SIZE.sm)}><Sparkles className="h-3.5 w-3.5" /> {t("Analyze another idea")}</Link>
      </div>
    </div>
  );
}
