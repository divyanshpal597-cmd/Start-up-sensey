import type { ReactNode } from "react";
import { fmtDate, fmtMoney, fmtMonths, fmtPct, moneyOf } from "../lib/format";

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="report-section mb-8">
      <h2 className="mb-3 flex items-baseline gap-3 border-b-2 border-slate-900 pb-1.5 font-display text-lg font-extrabold text-slate-900">
        <span className="text-indigo-600">{String(n).padStart(2, "0")}</span> {title}
      </h2>
      {children}
    </section>
  );
}

const AiNote = () => <span className="ml-2 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">AI Estimate</span>;

function List({ items }: { items?: string[] }) {
  if (!items?.length) return <p className="text-sm text-slate-400">—</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
      {items.map((x, i) => <li key={i}>{x}</li>)}
    </ul>
  );
}

function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-slate-100">
            <td className="w-1/3 py-1.5 pr-3 font-medium text-slate-500">{k}</td>
            <td className="py-1.5 text-slate-800">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ReportDocument({ idea, analysis }: { idea: any; analysis: any }) {
  const ai = analysis.aiAnalysis;
  const m = moneyOf(idea, analysis);
  const ov = ai.businessOverview || {};
  const mk = ai.marketAnalysis || {};
  const cu = ai.customerAnalysis || {};
  const co = ai.competitorAnalysis || {};
  const fin = ai.financialAnalysis || {};
  const calc = fin.calculated || {};
  const rec = ai.recommendation || {};
  const risks = ai.risks || {};
  const mkt = ai.marketingStrategy || {};
  const lp = ai.launchPlan || {};
  const sup = analysis.suppliers || {};
  const supResults: any[] = (sup.results || []).slice(0, 15);

  return (
    <article id="report" className="bg-white p-8 text-slate-800 md:p-12">
      <header className="mb-10 flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Startup Sense · AI Business Validation Report</div>
          <h1 className="mt-2 font-display text-3xl font-extrabold text-slate-900" data-testid="report-title">{ov.businessName || idea.businessName}</h1>
          <p className="mt-1 text-sm text-slate-500">{idea.location} · Budget {fmtMoney(idea.budget, m)} · {fmtDate(analysis.updatedAt)}</p>
        </div>
        <div className="shrink-0 rounded-2xl bg-slate-900 px-5 py-3 text-center text-white">
          <div className="text-[10px] uppercase tracking-wide text-slate-300">AI Score</div>
          <div className="font-display text-3xl font-extrabold">{Number(analysis.score).toFixed(1)}</div>
          <div className="text-[11px] text-slate-300">{rec.verdict}</div>
        </div>
      </header>

      <Section n={1} title="Executive Summary">
        <p className="text-sm font-semibold text-slate-900">{rec.headline}</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{ov.summary}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          {[
            ["Est. investment", fmtMoney(fin.estimatedInvestment, m)],
            ["Monthly revenue", fmtMoney(calc.monthlyRevenue, m)],
            ["Monthly profit", fmtMoney(calc.monthlyProfit, m)],
            ["Break-even", fmtMonths(calc.breakEvenMonths)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-slate-50 p-3">
              <div className="text-[11px] uppercase text-slate-500">{k}</div>
              <div className="font-bold text-slate-900">{v}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Figures are AI estimates or calculated from AI-estimated drivers.</p>
      </Section>

      <Section n={2} title="Business Overview">
        <KV rows={[
          ["Business name", ov.businessName],
          ["Business type", ov.businessType],
          ["Category", ov.category],
          ["Business model", ov.businessModel],
          ["Location", idea.location],
          ["Target customer", ov.targetCustomer],
          ["Value proposition", ov.valueProposition],
        ]} />
      </Section>

      <Section n={3} title="Market Analysis">
        <KV rows={[
          ["Demand", <>{mk.demandLevel} — {mk.demandSummary}<AiNote /></>],
          ["Market opportunity", mk.marketOpportunity],
          ["Estimated market size", <>{mk.estimatedMarketSize?.value}<AiNote /><div className="text-xs text-slate-500">{mk.estimatedMarketSize?.basis}</div></>],
          ["Growth potential", `${mk.growthPotential?.level || ""} — ${mk.growthPotential?.rationale || ""}`],
          ["Seasonality", mk.seasonality?.summary],
        ]} />
        <h3 className="mb-1 mt-3 text-sm font-bold">Local market factors</h3>
        <List items={mk.localMarketFactors} />
      </Section>

      <Section n={4} title="Target Customers">
        <h3 className="mb-1 text-sm font-bold">Primary</h3>
        <List items={(cu.primaryCustomers || []).map((s: any) => `${s.segment}: ${s.description}`)} />
        <h3 className="mb-1 mt-3 text-sm font-bold">Secondary</h3>
        <List items={(cu.secondaryCustomers || []).map((s: any) => `${s.segment}: ${s.description}`)} />
        <h3 className="mb-1 mt-3 text-sm font-bold">Needs & buying factors</h3>
        <List items={[...(cu.customerNeeds || []), ...(cu.buyingFactors || []).map((b: any) => `${b.factor} (importance ${b.importance}/5)`)]} />
      </Section>

      <Section n={5} title="Competition">
        <p className="text-sm text-slate-700">Competition level: <b>{co.competitionLevel}</b>. {co.summary}</p>
        <h3 className="mb-1 mt-3 text-sm font-bold">Direct competitor types <span className="text-[11px] font-normal text-amber-700">(AI assumptions — not named companies)</span></h3>
        <List items={(co.directCompetitorTypes || []).map((c: any) => `${c.type} — ${c.description} Typical pricing: ${c.typicalPricing}`)} />
        <h3 className="mb-1 mt-3 text-sm font-bold">Differentiation opportunities</h3>
        <List items={co.differentiationOpportunities} />
        {analysis.competitorsLive?.results?.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Live map data found {analysis.competitorsLive.results.length} similar businesses within {analysis.competitorsLive.radiusKm} km (not verified as direct competitors).
          </p>
        )}
      </Section>

      <Section n={6} title="SWOT">
        <div className="grid grid-cols-2 gap-3">
          {[["Strengths", "strengths"], ["Weaknesses", "weaknesses"], ["Opportunities", "opportunities"], ["Threats", "threats"]].map(([t, k]) => (
            <div key={k} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-1 text-sm font-bold">{t}</div>
              <List items={ai.swot?.[k]} />
            </div>
          ))}
        </div>
      </Section>

      <Section n={7} title="Financial Analysis">
        <KV rows={[
          ["Sales unit", fin.unitLabel],
          ["Selling price / unit", <>{fmtMoney(fin.sellingPricePerUnit, m)}<AiNote /></>],
          ["Variable cost / unit", <>{fmtMoney(fin.variableCostPerUnit, m)}<AiNote /></>],
          ["Units per day × working days", <>{fin.unitsPerDay} × {fin.workingDaysPerMonth}<AiNote /></>],
          ["Estimated investment", <>{fmtMoney(fin.estimatedInvestment, m)}<AiNote /></>],
          ["Monthly fixed costs (incl. marketing)", fmtMoney(calc.monthlyFixedCosts, m)],
          ["Monthly revenue (calculated)", fmtMoney(calc.monthlyRevenue, m)],
          ["Monthly expenses (calculated)", fmtMoney(calc.monthlyExpenses, m)],
          ["Monthly profit (calculated)", fmtMoney(calc.monthlyProfit, m)],
          ["Profit margin (calculated)", fmtPct(calc.profitMargin)],
          ["Break-even (calculated)", fmtMonths(calc.breakEvenMonths)],
        ]} />
        <h3 className="mb-1 mt-3 text-sm font-bold">Assumptions</h3>
        <List items={fin.assumptions} />
      </Section>

      <Section n={8} title="Supply Chain Sources">
        <h3 className="mb-1 text-sm font-bold">Required materials <span className="text-[11px] font-normal text-violet-700">(identified by AI)</span></h3>
        <List items={(ai.supplyChainRequirements?.materials || []).map((x: any) => `${x.name} (${x.category}) — ${x.estimatedQuantity || ""} ${x.estimatedCost ? `· est. ${x.estimatedCost}` : ""}`)} />
        <h3 className="mb-1 mt-3 text-sm font-bold">Nearest live sources {sup.sources?.length ? `(${sup.sources.join(" + ")})` : ""}</h3>
        {sup.status === "unavailable" ? (
          <p className="text-sm text-slate-500">Live supplier search was unavailable when this report was generated.</p>
        ) : supResults.length ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-500">
                <th className="py-1 pr-2">#</th><th className="py-1 pr-2">Name</th><th className="py-1 pr-2">Distance</th><th className="py-1 pr-2">Address</th><th className="py-1 pr-2">Phone</th><th className="py-1">For</th>
              </tr>
            </thead>
            <tbody>
              {supResults.map((s, i) => (
                <tr key={s.id} className="border-b border-slate-100 align-top">
                  <td className="py-1 pr-2">{i + 1}</td>
                  <td className="py-1 pr-2 font-medium">{s.name}</td>
                  <td className="py-1 pr-2">{s.distanceKm} km</td>
                  <td className="py-1 pr-2">{s.address || "Not listed"}{s.addressApproximate ? " (approx.)" : ""}</td>
                  <td className="py-1 pr-2">{s.phone || "Not listed"}</td>
                  <td className="py-1">{(s.matchedFor || []).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-500">No matching suppliers were found in live map data.</p>
        )}
        <p className="mt-2 text-[11px] text-slate-500">Distances are straight-line from the business location. Prices are not published by these sources — request quotes.</p>
      </Section>

      <Section n={9} title="Marketing Strategy">
        <p className="text-sm text-slate-700"><b>Positioning:</b> {mkt.positioning}</p>
        <h3 className="mb-1 mt-3 text-sm font-bold">Online</h3>
        <List items={(mkt.online || []).map((x: any) => `${x.channel}: ${x.tactic} (${x.estimatedMonthlyCost})`)} />
        <h3 className="mb-1 mt-3 text-sm font-bold">Offline</h3>
        <List items={(mkt.offline || []).map((x: any) => `${x.channel}: ${x.tactic} (${x.estimatedMonthlyCost})`)} />
        <h3 className="mb-1 mt-3 text-sm font-bold">Low-budget tactics</h3>
        <List items={mkt.lowBudget} />
        {mkt.launchOffer && <p className="mt-2 text-sm"><b>Launch offer:</b> {mkt.launchOffer}</p>}
      </Section>

      <Section n={10} title="Risks">
        {[["Financial", "financial"], ["Market", "market"], ["Operational", "operational"], ["Supply chain", "supplyChain"], ["Competition", "competition"], ["Regulatory", "regulatory"]].map(([t, k]) => (
          <div key={k} className="mb-2">
            <h3 className="text-sm font-bold">{t}</h3>
            <List items={(risks[k] || []).map((r: any) => `[${r.severity}] ${r.risk} — Mitigation: ${r.mitigation}`)} />
          </div>
        ))}
        {risks.licensesAndPermits?.length > 0 && (
          <>
            <h3 className="mt-2 text-sm font-bold">Licences & permits (verify locally)</h3>
            <List items={risks.licensesAndPermits} />
          </>
        )}
      </Section>

      <Section n={11} title="Launch Plan">
        <div className="grid gap-3 md:grid-cols-3">
          {[["First 7 days", lp.first7Days], ["First 30 days", lp.first30Days], ["First 90 days", lp.first90Days]].map(([t, items]) => (
            <div key={t as string} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-1 text-sm font-bold">{t as string}</div>
              <List items={items as string[]} />
            </div>
          ))}
        </div>
      </Section>

      <Section n={12} title="AI Recommendation">
        <p className="text-sm"><b>Verdict: {rec.verdict}</b> — {rec.headline}</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{rec.summary}</p>
        <h3 className="mb-1 mt-3 text-sm font-bold">Key actions</h3>
        <List items={rec.keyActions} />
        <h3 className="mb-1 mt-3 text-sm font-bold">Conditions for success</h3>
        <List items={rec.conditions} />
      </Section>

      <footer className="mt-10 border-t border-slate-200 pt-4 text-[11px] leading-relaxed text-slate-500">
        {ai.meta?.disclaimer} Generated by Startup Sense using {analysis.model || ai.meta?.model}. Supplier listings come from {(sup.sources || []).join(" and ") || "live map data"}; verify all details before purchasing.
      </footer>
    </article>
  );
}
