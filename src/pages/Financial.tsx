import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCurrentIdea } from "../context/CurrentIdea";
import { DRIVER_LABELS, aiDrivers, calculate, cashflowSeries, loadOverrides, saveOverrides, type Drivers } from "../lib/calc";
import { fmtMoney, fmtMonths, fmtNum, fmtPct, moneyOf } from "../lib/format";
import { BulletList, Card, NeedsAnalysis, PageHeader, SIZE, Tag, cx } from "../components/ui";
import { t } from "../lib/i18n";

export default function Financial() {
  const ctx = useCurrentIdea();
  return (
    <NeedsAnalysis ctx={ctx}>
      <Body />
    </NeedsAnalysis>
  );
}

const ORDER: (keyof Drivers)[] = ["investment", "sellingPrice", "unitsPerDay", "workingDays", "variableCostPerUnit", "fixedCostsMonthly", "marketingMonthly"];

function Body() {
  const { idea, analysis, ai } = useCurrentIdea();
  const m = moneyOf(idea, analysis);
  const fin = ai.financialAnalysis || {};
  const base = useMemo(() => aiDrivers(ai)!, [ai]);
  const [over, setOver] = useState<Partial<Drivers>>({});
  const [drafts, setDrafts] = useState<Partial<Record<keyof Drivers, string>>>({});
  useEffect(() => {
    setOver(loadOverrides(analysis.id));
  }, [analysis.id]);
  const d: Drivers = { ...base, ...over };
  const c = calculate(d);
  const series = cashflowSeries(d, 24);

  const setField = (k: keyof Drivers, raw: string) => {
    const v = Number(raw);
    const next = { ...over };
    if (raw === "" || !Number.isFinite(v)) delete next[k];
    else next[k] = Math.max(0, v);
    setOver(next);
    saveOverrides(analysis.id, next);
  };
  const reset = () => {
    setOver({});
    setDrafts({});
    saveOverrides(analysis.id, {});
  };
  const isMoney = (k: keyof Drivers) => !["unitsPerDay", "workingDays"].includes(k);

  const outputs = [
    { l: "Daily Revenue", v: fmtMoney(c.dailyRevenue, m) },
    { l: "Monthly Revenue", v: fmtMoney(c.monthlyRevenue, m) },
    { l: "Monthly Expenses", v: fmtMoney(c.monthlyExpenses, m), s: t("{v} variable + {f} fixed & marketing", { v: fmtMoney(c.monthlyVariable, m), f: fmtMoney(c.monthlyFixed, m) }) },
    { l: "Monthly Profit", v: fmtMoney(c.monthlyProfit, m), tone: c.monthlyProfit >= 0 ? "text-emerald-600" : "text-rose-600" },
    { l: "Profit Margin", v: fmtPct(c.profitMargin) },
    { l: "Break-even", v: fmtMonths(c.breakEvenMonths), s: c.breakEvenUnitsPerDay ? t("≈ {n} {unit}/day to cover monthly fixed costs", { n: fmtNum(Math.ceil(c.breakEvenUnitsPerDay)), unit: fin.unitLabel }) : t("Selling price does not cover variable cost") },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Financial Planner"
        title={`${t("Unit economics")} · ${ai.businessOverview?.businessName}`}
        subtitle={t("Pre-filled with AI estimates for this business. Change any value to see recalculated results. Sales unit: “{unit}”.", { unit: fin.unitLabel })}
        actions={Object.keys(over).length > 0 && <button onClick={reset} className={cx("btn-secondary", SIZE.md)}><RotateCcw className="h-4 w-4" /> {t("Reset to AI estimates")}</button>}
      />
      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
        {t("Legend:")} <Tag kind="user" /> {t("value you changed")} · <Tag kind="ai" /> {t("AI-estimated default")} · <Tag kind="calc" /> {t("formula result")}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2" title="Inputs">
          <div className="space-y-4">
            {ORDER.map((k) => {
              const edited = over[k] !== undefined;
              return (
                <div key={k}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700" htmlFor={`f-${k}`}>{k === "unitsPerDay" ? t("Customers per day ({unit})", { unit: fin.unitLabel }) : t(DRIVER_LABELS[k])}</label>
                    {edited ? <Tag kind="user" /> : <Tag kind="ai" />}
                  </div>
                  <input
                    id={`f-${k}`}
                    type="number"
                    min={0}
                    step="any"
                    className={cx("input", edited && "border-sky-300 bg-sky-50/40")}
                    value={drafts[k] ?? String(Math.round(d[k] * 100) / 100)}
                    onChange={(e) => {
                      setDrafts((p) => ({ ...p, [k]: e.target.value }));
                      setField(k, e.target.value);
                    }}
                    onBlur={() => setDrafts((p) => ({ ...p, [k]: undefined }))}
                  />
                  {edited && <div className="mt-1 text-[11px] text-slate-400">{t("AI estimate:")} {isMoney(k) ? fmtMoney(base[k], m) : fmtNum(base[k], 1)}</div>}
                </div>
              );
            })}
          </div>
        </Card>
        <div className="space-y-6 lg:col-span-3">
          <div className="grid gap-4 sm:grid-cols-2">
            {outputs.map((o) => (
              <div key={o.l} className="card p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{t(o.l)}</div>
                  <Tag kind="calc" />
                </div>
                <div className={cx("mt-2 font-display text-2xl font-extrabold text-slate-900", o.tone)}>{o.v}</div>
                {o.s && <div className="mt-1 text-xs text-slate-500">{o.s}</div>}
              </div>
            ))}
          </div>
          <Card title="24-month cumulative cash position" subtitle="Starts at minus the investment; first 3 months ramp from 50% to 100% of steady-state sales." action={<Tag kind="calc" />}>
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={series} margin={{ left: 8, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#eef0f6" />
                  <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} interval={2} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} width={72} tickFormatter={(v) => fmtMoney(v, m, { compact: true })} />
                  <Tooltip formatter={(v: any) => fmtMoney(v, m)} />
                  <ReferenceLine y={0} stroke="#10b981" strokeDasharray="4 4" label={{ value: t("Break-even"), fontSize: 11, fill: "#059669", position: "insideTopLeft" }} />
                  <Area dataKey="cumulative" name={t("Cumulative cash")} stroke="#6366f1" strokeWidth={2} fill="url(#cf)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Investment breakdown" action={<Tag kind="ai" />}>
          <CostTable rows={(fin.investmentBreakdown || []).map((x: any) => [x.item, x.amount])} m={m} total />
        </Card>
        <Card title="Monthly fixed costs" action={<Tag kind="ai" />}>
          <CostTable rows={(fin.fixedCostsMonthly || []).map((x: any) => [x.item, x.amount])} m={m} total />
          <div className="mt-2 text-xs text-slate-500">{t("Marketing budget (AI): {x}/month", { x: fmtMoney(fin.marketingBudgetMonthly, m) })}</div>
        </Card>
        <Card title="Variable cost per unit" action={<Tag kind="ai" />}>
          <CostTable rows={(fin.variableCostItems || []).map((x: any) => [x.item, x.costPerUnit])} m={m} total />
        </Card>
      </div>
      <Card title="AI assumptions behind these numbers" action={<Tag kind="ai" />}>
        <BulletList items={fin.assumptions} />
      </Card>
    </div>
  );
}

function CostTable({ rows, m, total }: { rows: [string, number][]; m: any; total?: boolean }) {
  const sum = rows.reduce((s, r) => s + (Number(r[1]) || 0), 0);
  if (!rows.length) return <p className="text-sm text-slate-400">{t("Not provided.")}</p>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i} className="border-b border-slate-100 last:border-0">
            <td className="py-2 pr-2 text-slate-600">{k}</td>
            <td className="py-2 text-right font-medium text-slate-900">{fmtMoney(v, m)}</td>
          </tr>
        ))}
        {total && (
          <tr>
            <td className="pt-3 font-semibold text-slate-900">{t("Total")}</td>
            <td className="pt-3 text-right font-bold text-slate-900">{fmtMoney(sum, m)}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
