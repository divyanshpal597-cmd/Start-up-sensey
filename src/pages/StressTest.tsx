import { Fragment, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ShieldAlert } from "lucide-react";
import { useCurrentIdea } from "../context/CurrentIdea";
import { calculate, effectiveDrivers, loadOverrides, type Drivers } from "../lib/calc";
import { fmtMoney, fmtMonths, fmtPct, moneyOf } from "../lib/format";
import { Card, NeedsAnalysis, PageHeader, Tag, cx } from "../components/ui";
import { t } from "../lib/i18n";

export default function StressTest() {
  const ctx = useCurrentIdea();
  return (
    <NeedsAnalysis ctx={ctx}>
      <Body />
    </NeedsAnalysis>
  );
}

type Scenario = { group: string; name: string; desc: string; vars?: Record<string, number>; apply: (d: Drivers) => Drivers };

const SCENARIOS: Scenario[] = [
  { group: "Demand", name: "Low Demand", desc: "Customers −30%", apply: (d) => ({ ...d, unitsPerDay: d.unitsPerDay * 0.7 }) },
  { group: "Demand", name: "Normal Demand", desc: "Baseline", apply: (d) => d },
  { group: "Demand", name: "High Demand", desc: "Customers +30%", apply: (d) => ({ ...d, unitsPerDay: d.unitsPerDay * 1.3 }) },
  ...[10, 20, 30].map((pct) => ({
    group: "Cost increase", name: `Costs +${pct}%`, desc: `Variable & fixed costs +${pct}%`, vars: { pct },
    apply: (d: Drivers) => ({ ...d, variableCostPerUnit: d.variableCostPerUnit * (1 + pct / 100), fixedCostsMonthly: d.fixedCostsMonthly * (1 + pct / 100) }),
  })),
  ...[10, 25, 40].map((pct) => ({
    group: "Customer drop", name: `Customers −${pct}%`, desc: `${pct}% fewer customers`, vars: { pct },
    apply: (d: Drivers) => ({ ...d, unitsPerDay: d.unitsPerDay * (1 - pct / 100) }),
  })),
  {
    group: "Combined", name: "Worst case", desc: "Customers −40% and costs +30%",
    apply: (d) => ({ ...d, unitsPerDay: d.unitsPerDay * 0.6, variableCostPerUnit: d.variableCostPerUnit * 1.3, fixedCostsMonthly: d.fixedCostsMonthly * 1.3 }),
  },
];

const sname = (r: Scenario) =>
  r.name.startsWith("Costs +") ? t("Costs +{pct}%", r.vars) : r.name.startsWith("Customers −") ? t("Customers −{pct}%", r.vars) : t(r.name);
const sdesc = (r: Scenario) =>
  r.desc.startsWith("Variable & fixed") ? t("Variable & fixed costs +{pct}%", r.vars) : r.desc.endsWith("fewer customers") ? t("{pct}% fewer customers", r.vars) : t(r.desc);

function Body() {
  const { idea, analysis, ai } = useCurrentIdea();
  const m = moneyOf(idea, analysis);
  const base = useMemo(() => effectiveDrivers(ai, analysis.id)!, [ai, analysis.id]);
  const usesPlanner = Object.keys(loadOverrides(analysis.id)).length > 0;
  const b = calculate(base);
  const rows = SCENARIOS.map((s) => ({ ...s, c: calculate(s.apply(base)) }));
  const survive = rows.filter((r) => r.c.monthlyProfit > 0).length;
  const chart = rows.map((r) => ({ name: sname(r), profit: Math.round(r.c.monthlyProfit) }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business Stress Test"
        title={t("How resilient is {name}?", { name: ai.businessOverview?.businessName })}
        subtitle={usesPlanner ? t("Each scenario applies a shock to your Financial Planner baseline and recalculates revenue, expenses, profit and break-even.") : t("Each scenario applies a shock to the AI-estimated baseline and recalculates revenue, expenses, profit and break-even.")}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs font-medium uppercase text-slate-500">{t("Scenarios still profitable")}</div>
          <div className={cx("mt-2 font-display text-3xl font-extrabold", survive >= 7 ? "text-emerald-600" : survive >= 4 ? "text-amber-600" : "text-rose-600")}>{survive} / {rows.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-medium uppercase text-slate-500">{t("Baseline monthly profit")}</div>
          <div className="mt-2 font-display text-3xl font-extrabold text-slate-900">{fmtMoney(b.monthlyProfit, m, { compact: true })}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-medium uppercase text-slate-500">{t("Worst-case monthly profit")}</div>
          <div className={cx("mt-2 font-display text-3xl font-extrabold", rows[rows.length - 1].c.monthlyProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>
            {fmtMoney(rows[rows.length - 1].c.monthlyProfit, m, { compact: true })}
          </div>
        </div>
      </div>
      <Card title="Scenario results" icon={<ShieldAlert className="h-4 w-4" />} action={<Tag kind="calc" />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">{t("Scenario")}</th>
                <th className="py-2 text-right">{t("Revenue")}</th>
                <th className="py-2 text-right">{t("Expenses")}</th>
                <th className="py-2 text-right">{t("Profit")}</th>
                <th className="py-2 text-right">{t("Margin")}</th>
                <th className="py-2 text-right">{t("Break-even")}</th>
                <th className="py-2 text-right">{t("Profit vs baseline")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const d = r.c.monthlyProfit - b.monthlyProfit;
                const newGroup = i === 0 || rows[i - 1].group !== r.group;
                return (
                  <Fragment key={r.name}>
                    {newGroup && (
                      <tr>
                        <td colSpan={7} className="pb-1 pt-4 text-xs font-bold uppercase tracking-wide text-indigo-600">{t(r.group)}</td>
                      </tr>
                    )}
                    <tr className={cx("border-b border-slate-100", r.c.monthlyProfit <= 0 && "bg-rose-50/60")}>
                      <td className="py-2.5"><div className="font-semibold text-slate-800">{sname(r)}</div><div className="text-xs text-slate-500">{sdesc(r)}</div></td>
                      <td className="py-2.5 text-right">{fmtMoney(r.c.monthlyRevenue, m)}</td>
                      <td className="py-2.5 text-right">{fmtMoney(r.c.monthlyExpenses, m)}</td>
                      <td className={cx("py-2.5 text-right font-semibold", r.c.monthlyProfit >= 0 ? "text-emerald-700" : "text-rose-700")}>{fmtMoney(r.c.monthlyProfit, m)}</td>
                      <td className="py-2.5 text-right">{fmtPct(r.c.profitMargin)}</td>
                      <td className="py-2.5 text-right">{fmtMonths(r.c.breakEvenMonths)}</td>
                      <td className={cx("py-2.5 text-right text-xs font-semibold", d >= 0 ? "text-emerald-600" : "text-rose-600")}>{Math.abs(d) < 1 ? "—" : `${d > 0 ? "+" : "−"}${fmtMoney(Math.abs(d), m)}`}</td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Monthly profit by scenario" action={<Tag kind="calc" />}>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={chart} margin={{ left: 8, right: 8, top: 8, bottom: 40 }}>
              <CartesianGrid vertical={false} stroke="#eef0f6" />
              <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} angle={-25} textAnchor="end" interval={0} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} width={72} tickFormatter={(v) => fmtMoney(v, m, { compact: true })} />
              <Tooltip formatter={(v: any) => fmtMoney(v, m)} cursor={{ fill: "#f1f5f9" }} />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Bar dataKey="profit" radius={[6, 6, 0, 0]}>
                {chart.map((c) => <Cell key={c.name} fill={c.profit >= 0 ? "#10b981" : "#f43f5e"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
