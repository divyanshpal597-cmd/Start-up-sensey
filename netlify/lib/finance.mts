// Deterministic calculations derived from AI-estimated drivers, plus output normalisation.

export const num = (v: unknown, d = 0): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : d;
};
export const str = (v: unknown, d = ""): string => (typeof v === "string" ? v.trim() : v == null ? d : String(v));
export const arr = <T = any,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
export const strArr = (v: unknown, max = 12): string[] =>
  arr(v).map((x) => str(x)).filter(Boolean).slice(0, max);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number, dp = 0) => Math.round(n * 10 ** dp) / 10 ** dp;

export function normalizeFinancials(f: any) {
  const fixed = arr(f?.fixedCostsMonthly)
    .map((x: any) => ({ item: str(x?.item, "Item"), amount: Math.max(0, num(x?.amount)) }))
    .filter((x) => x.item);
  const investmentBreakdown = arr(f?.investmentBreakdown)
    .map((x: any) => ({ item: str(x?.item, "Item"), amount: Math.max(0, num(x?.amount)) }))
    .filter((x) => x.item);
  const variableItems = arr(f?.variableCostItems)
    .map((x: any) => ({ item: str(x?.item, "Item"), costPerUnit: Math.max(0, num(x?.costPerUnit)) }))
    .filter((x) => x.item);
  const sumBreakdown = investmentBreakdown.reduce((s, x) => s + x.amount, 0);
  return {
    unitLabel: str(f?.unitLabel, "unit"),
    sellingPricePerUnit: Math.max(0, num(f?.sellingPricePerUnit)),
    variableCostPerUnit: Math.max(0, num(f?.variableCostPerUnit)),
    unitsPerDay: Math.max(0, num(f?.unitsPerDay)),
    workingDaysPerMonth: clamp(num(f?.workingDaysPerMonth, 26), 1, 31),
    estimatedInvestment: Math.max(0, num(f?.estimatedInvestment, sumBreakdown)),
    investmentBreakdown,
    fixedCostsMonthly: fixed,
    variableCostItems: variableItems,
    marketingBudgetMonthly: Math.max(0, num(f?.marketingBudgetMonthly)),
    assumptions: strArr(f?.assumptions),
  };
}

export type Drivers = {
  investment: number;
  sellingPrice: number;
  unitsPerDay: number;
  workingDays: number;
  variableCostPerUnit: number;
  fixedCostsMonthly: number;
  marketingMonthly?: number;
};

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
  const breakEvenMonths = monthlyProfit > 0 ? d.investment / monthlyProfit : null;
  return {
    dailyRevenue: round(dailyRevenue),
    monthlyUnits: round(monthlyUnits),
    monthlyRevenue: round(monthlyRevenue),
    monthlyVariableCosts: round(monthlyVariable),
    monthlyFixedCosts: round(monthlyFixed),
    monthlyExpenses: round(monthlyExpenses),
    monthlyProfit: round(monthlyProfit),
    profitMargin: round(profitMargin, 1),
    breakEvenUnitsPerMonth: breakEvenUnitsPerMonth == null ? null : round(breakEvenUnitsPerMonth),
    breakEvenMonths: breakEvenMonths == null ? null : round(breakEvenMonths, 1),
  };
}

export function driversFromFinancials(f: ReturnType<typeof normalizeFinancials>): Drivers {
  return {
    investment: f.estimatedInvestment,
    sellingPrice: f.sellingPricePerUnit,
    unitsPerDay: f.unitsPerDay,
    workingDays: f.workingDaysPerMonth,
    variableCostPerUnit: f.variableCostPerUnit,
    fixedCostsMonthly: f.fixedCostsMonthly.reduce((s, x) => s + x.amount, 0),
    marketingMonthly: f.marketingBudgetMonthly,
  };
}

const WEIGHTS: Record<string, number> = {
  demand: 0.2,
  marketOpportunity: 0.15,
  competition: 0.15,
  profitability: 0.2,
  feasibility: 0.15,
  risk: 0.15,
};

/**
 * Validation score = weighted mean of the AI's component scores, with hard caps
 * from the calculated economics (loss-making or far-over-budget ideas cannot score high).
 */
export function computeScore(scoring: any, calc: ReturnType<typeof calculate>, investment: number, budget: number) {
  const components: Record<string, { score: number; reason: string; adjusted?: string }> = {};
  for (const k of Object.keys(WEIGHTS)) {
    components[k] = { score: clamp(num(scoring?.[k]?.score, 5), 0, 10), reason: str(scoring?.[k]?.reason) };
  }
  if (calc.monthlyProfit <= 0 && components.profitability.score > 3) {
    components.profitability.score = 3;
    components.profitability.adjusted = "Capped at 3: calculated monthly profit is not positive.";
  }
  if (budget > 0 && investment > budget * 1.5 && components.feasibility.score > 4) {
    components.feasibility.score = 4;
    components.feasibility.adjusted = "Capped at 4: estimated investment is more than 1.5× the stated budget.";
  }
  let total = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) total += components[k].score * w;
  return { score: round(total, 1), components, weights: WEIGHTS };
}

export function normalizeRisks(r: any) {
  const cat = (v: unknown) =>
    arr(v)
      .map((x: any) => ({
        risk: str(x?.risk),
        severity: ["Low", "Medium", "High"].includes(str(x?.severity)) ? str(x?.severity) : "Medium",
        mitigation: str(x?.mitigation),
      }))
      .filter((x) => x.risk)
      .slice(0, 4);
  return {
    financial: cat(r?.financial),
    market: cat(r?.market),
    operational: cat(r?.operational),
    supplyChain: cat(r?.supplyChain),
    competition: cat(r?.competition),
    regulatory: cat(r?.regulatory),
    licensesAndPermits: strArr(r?.licensesAndPermits),
  };
}

const TAG_KEYS = new Set(["amenity", "shop", "craft", "industrial", "man_made", "office"]);
export function cleanOsmTags(v: unknown): string[] {
  return strArr(v, 6).filter((t) => {
    const m = /^([a-z_:]+)=([A-Za-z0-9_ ;-]{1,40})$/.exec(t);
    return !!m && TAG_KEYS.has(m[1]);
  });
}
// Words too generic to identify what a business sells.
const GENERIC_KEYWORDS = new Set([
  "shop", "store", "stores", "traders", "trader", "trading", "enterprises", "enterprise", "company", "india", "services",
  "service", "industrial", "industry", "industries", "equipment", "machinery", "machine", "engineering", "products",
  "product", "materials", "material", "supply", "supplies", "supplier", "suppliers", "general", "works", "hardware",
  "wholesale", "dealer", "dealers", "distributor", "center", "centre", "mart", "house", "agency", "raw",
]);

export function cleanKeywords(v: unknown, max = 6): string[] {
  return strArr(v, 12)
    .map((k) => k.toLowerCase().replace(/[^a-z0-9 &]/g, " ").replace(/\s+/g, " ").trim())
    .filter((k) => k.length >= 3 && k.length <= 30)
    .filter((k) => !GENERIC_KEYWORDS.has(k))
    .slice(0, max);
}
