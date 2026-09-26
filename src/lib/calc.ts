// Client-side financial model. Mirrors the backend so planner, what-if and stress tests stay consistent.
import { storageGet, storageSet } from "./api";

export type Drivers = {
  investment: number;
  sellingPrice: number;
  unitsPerDay: number;
  workingDays: number;
  variableCostPerUnit: number;
  fixedCostsMonthly: number;
  marketingMonthly: number;
};

export type Calc = ReturnType<typeof calculate>;

export function calculate(d: Drivers) {
  const dailyRevenue = d.sellingPrice * d.unitsPerDay;
  const monthlyUnits = d.unitsPerDay * d.workingDays;
  const monthlyRevenue = dailyRevenue * d.workingDays;
  const monthlyVariable = d.variableCostPerUnit * monthlyUnits;
  const monthlyFixed = d.fixedCostsMonthly + (d.marketingMonthly || 0);
  const monthlyExpenses = monthlyVariable + monthlyFixed;
  const monthlyProfit = monthlyRevenue - monthlyExpenses;
  const profitMargin = monthlyRevenue > 0 ? (monthlyProfit / monthlyRevenue) * 100 : 0;
  const contribution = d.sellingPrice - d.variableCostPerUnit;
  const breakEvenUnitsPerMonth = contribution > 0 ? monthlyFixed / contribution : null;
  const breakEvenUnitsPerDay = breakEvenUnitsPerMonth !== null && d.workingDays > 0 ? breakEvenUnitsPerMonth / d.workingDays : null;
  const breakEvenMonths = monthlyProfit > 0 ? d.investment / monthlyProfit : null;
  return {
    dailyRevenue,
    monthlyUnits,
    monthlyRevenue,
    monthlyVariable,
    monthlyFixed,
    monthlyExpenses,
    monthlyProfit,
    profitMargin,
    breakEvenUnitsPerMonth,
    breakEvenUnitsPerDay,
    breakEvenMonths,
  };
}

export function aiDrivers(ai: any): Drivers | null {
  const f = ai?.financialAnalysis;
  if (!f) return null;
  const fixed = (f.fixedCostsMonthly || []).reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0);
  return {
    investment: Number(f.estimatedInvestment) || 0,
    sellingPrice: Number(f.sellingPricePerUnit) || 0,
    unitsPerDay: Number(f.unitsPerDay) || 0,
    workingDays: Number(f.workingDaysPerMonth) || 26,
    variableCostPerUnit: Number(f.variableCostPerUnit) || 0,
    fixedCostsMonthly: fixed,
    marketingMonthly: Number(f.marketingBudgetMonthly) || 0,
  };
}

const key = (analysisId: string) => `ss_planner_${analysisId}`;

/** Planner overrides the user typed (persisted per analysis so navigation never loses them). */
export function loadOverrides(analysisId: string | undefined): Partial<Drivers> {
  if (!analysisId) return {};
  try {
    return JSON.parse(storageGet(key(analysisId)) || "{}");
  } catch {
    return {};
  }
}
export function saveOverrides(analysisId: string, o: Partial<Drivers>) {
  storageSet(key(analysisId), JSON.stringify(o));
}

export function effectiveDrivers(ai: any, analysisId: string | undefined): Drivers | null {
  const base = aiDrivers(ai);
  if (!base) return null;
  return { ...base, ...loadOverrides(analysisId) };
}

/** Month-by-month cumulative cash position, starting at -investment. */
export function cashflowSeries(d: Drivers, months = 24, rampMonths = 3) {
  const c = calculate(d);
  const rows: { month: string; cumulative: number; profit: number }[] = [];
  let cum = -d.investment;
  rows.push({ month: "M0", cumulative: Math.round(cum), profit: 0 });
  for (let m = 1; m <= months; m++) {
    // simple ramp: first months reach 50% → 100% of steady-state revenue
    const ramp = m <= rampMonths ? 0.5 + (0.5 * (m - 1)) / Math.max(1, rampMonths - 1) : 1;
    const revenue = c.monthlyRevenue * ramp;
    const variable = c.monthlyVariable * ramp;
    const profit = revenue - variable - c.monthlyFixed;
    cum += profit;
    rows.push({ month: `M${m}`, cumulative: Math.round(cum), profit: Math.round(profit) });
  }
  return rows;
}

export const DRIVER_LABELS: Record<keyof Drivers, string> = {
  investment: "Investment",
  sellingPrice: "Selling price / unit",
  unitsPerDay: "Customers (units) per day",
  workingDays: "Working days / month",
  variableCostPerUnit: "Variable cost / unit",
  fixedCostsMonthly: "Fixed costs / month",
  marketingMonthly: "Marketing budget / month",
};
