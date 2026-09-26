import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCurrentIdea } from "../context/CurrentIdea";
import { calculate, effectiveDrivers, loadOverrides, type Drivers } from "../lib/calc";
import { fmtMoney, fmtMonths, fmtPct, moneyOf } from "../lib/format";
import { Card, NeedsAnalysis, PageHeader, SIZE, Tag, cx } from "../components/ui";

export default function WhatIf() {
  const ctx = useCurrentIdea();
  return (
    <NeedsAnalysis ctx={ctx}>
      <Body />
    </NeedsAnalysis>
  );
}

const SLIDERS = [
  { k: "price", label: "Selling price", min: -50, max: 100 },
  { k: "customers", label: "Customers per day", min: -75, max: 200 },
  { k: "variable", label: "Variable cost per unit", min: -50, max: 100 },
  { k: "fixed", label: "Fixed costs", min: -50, max: 100 },
  { k: "investment", label: "Investment", min: -50, max: 200 },
] as const;

type Pct = Record<(typeof SLIDERS)[number]["k"], number>;
const ZERO: Pct = { price: 0, customers: 0, variable: 0, fixed: 0, investment: 0 };

function Delta({ a, b, money, m, invert }: { a: number | null; b: number | null; money?: boolean; m?: any; invert?: boolean }) {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return <span className="text-slate-400">—</span>;
  const d = b - a;
  if (Math.abs(d) < 0.005) return <span className="text-slate-400">no change</span>;
  const good = invert ? d < 0 : d > 0;
  return <span className={good ? "text-emerald-600" : "text-rose-600"}>{d > 0 ? "+" : "−"}{money ? fmtMoney(Math.abs(d), m) : Math.abs(d).toFixed(1)}</span>;
}

function Body() {
  const { idea, analysis, ai } = useCurrentIdea();
  const m = moneyOf(idea, analysis);
  const base = useMemo(() => effectiveDrivers(ai, analysis.id)!, [ai, analysis.id]);
  const usesPlanner = Object.keys(loadOverrides(analysis.id)).length > 0;
  const [p, setP] = useState<Pct>(ZERO);
  const [marketing, setMarketing] = useState<number>(base.marketingMonthly);

  const scen: Drivers = {
    ...base,
    sellingPrice: base.sellingPrice * (1 + p.price / 100),
    unitsPerDay: base.unitsPerDay * (1 + p.customers / 100),
    variableCostPerUnit: base.variableCostPerUnit * (1 + p.variable / 100),
    fixedCostsMonthly: base.fixedCostsMonthly * (1 + p.fixed / 100),
    investment: base.investment * (1 + p.investment / 100),
    marketingMonthly: marketing,
  };
  const b = calculate(base);
  const s = calculate(scen);
  const chart = [
    { name: "Revenue", Baseline: Math.round(b.monthlyRevenue), Scenario: Math.round(s.monthlyRevenue) },
    { name: "Expenses", Baseline: Math.round(b.monthlyExpenses), Scenario: Math.round(s.monthlyExpenses) },
    { name: "Profit", Baseline: Math.round(b.monthlyProfit), Scenario: Math.round(s.monthlyProfit) },
  ];
  const rows = [
    { l: "Monthly revenue", a: b.monthlyRevenue, z: s.monthlyRevenue, money: true },
    { l: "Monthly expenses", a: b.monthlyExpenses, z: s.monthlyExpenses, money: true, invert: true },
    { l: "Monthly profit", a: b.monthlyProfit, z: s.monthlyProfit, money: true },
    { l: "Profit margin", a: b.profitMargin, z: s.profitMargin, fmt: fmtPct },
    { l: "Break-even (months)", a: b.breakEvenMonths, z: s.breakEvenMonths, fmt: fmtMonths, invert: true },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="What-If Simulator"
        title={`What if… · ${ai.businessOverview?.businessName}`}
        subtitle={`Baseline = ${usesPlanner ? "your Financial Planner values" : "AI-estimated unit economics"} for this business. Move the sliders to see results recalculate instantly.`}
        actions={<button onClick={() => { setP(ZERO); setMarketing(base.marketingMonthly); }} className={cx("btn-secondary", SIZE.md)}><RotateCcw className="h-4 w-4" /> Reset</button>}
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2" title="Change the assumptions" action={<Tag kind="user" label="Your scenario" />}>
          <div className="space-y-5">
            {SLIDERS.map((sl) => (
              <div key={sl.k}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium text-slate-700">{sl.label}</span>
                  <span className={cx("font-semibold", p[sl.k] === 0 ? "text-slate-400" : "text-indigo-600")}>{p[sl.k] > 0 ? "+" : ""}{p[sl.k]}%</span>
                </div>
                <input type="range" min={sl.min} max={sl.max} step={5} value={p[sl.k]} onChange={(e) => setP({ ...p, [sl.k]: Number(e.target.value) })} className="w-full" />
                <div className="mt-0.5 text-[11px] text-slate-400">
                  {sl.k === "price" && `${fmtMoney(base.sellingPrice, m)} → ${fmtMoney(scen.sellingPrice, m)}`}
                  {sl.k === "customers" && `${base.unitsPerDay.toFixed(1)} → ${scen.unitsPerDay.toFixed(1)} per day`}
                  {sl.k === "variable" && `${fmtMoney(base.variableCostPerUnit, m)} → ${fmtMoney(scen.variableCostPerUnit, m)}`}
                  {sl.k === "fixed" && `${fmtMoney(base.fixedCostsMonthly, m)} → ${fmtMoney(scen.fixedCostsMonthly, m)} / month`}
                  {sl.k === "investment" && `${fmtMoney(base.investment, m)} → ${fmtMoney(scen.investment, m)}`}
                </div>
              </div>
            ))}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="mkt">Marketing budget / month</label>
              <input id="mkt" type="number" min={0} className="input" value={Math.round(marketing)} onChange={(e) => setMarketing(Math.max(0, Number(e.target.value) || 0))} />
              <div className="mt-0.5 text-[11px] text-slate-400">Baseline {fmtMoney(base.marketingMonthly, m)}</div>
            </div>
          </div>
        </Card>
        <div className="space-y-6 lg:col-span-3">
          <Card title="Baseline vs scenario" action={<Tag kind="calc" />}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2">Metric</th><th className="py-2 text-right">Baseline</th><th className="py-2 text-right">Scenario</th><th className="py-2 text-right">Change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.l} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 font-medium text-slate-700">{r.l}</td>
                    <td className="py-2.5 text-right text-slate-600">{r.money ? fmtMoney(r.a, m) : r.fmt!(r.a)}</td>
                    <td className="py-2.5 text-right font-semibold text-slate-900">{r.money ? fmtMoney(r.z, m) : r.fmt!(r.z)}</td>
                    <td className="py-2.5 text-right text-xs font-semibold"><Delta a={r.a} b={r.z} money={r.money} m={m} invert={r.invert} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title="Monthly comparison" action={<Tag kind="calc" />}>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={chart} margin={{ left: 8, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="#eef0f6" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={72} tickFormatter={(v) => fmtMoney(v, m, { compact: true })} />
                  <Tooltip formatter={(v: any) => fmtMoney(v, m)} cursor={{ fill: "#f1f5f9" }} />
                  <Legend />
                  <Bar dataKey="Baseline" fill="#cbd5e1" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Scenario" fill="#6366f1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
