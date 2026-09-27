// The analysis pipeline, run inside the background worker.
import { db } from "./db.mts";
import { AIError, generateJSON } from "./gemini.mts";
import { systemFor, pivotPrompt, step1Prompt, step2Prompt, step3Prompt } from "./prompts.mts";
import {
  arr, calculate, cleanKeywords, cleanOsmTags, computeScore, driversFromFinancials, normalizeFinancials,
  normalizeRisks, num, str, strArr,
} from "./finance.mts";
import { findNearby, geocode, type SearchTarget } from "./places.mts";
import type { IdeaInput } from "./validate.mts";
import { CURRENCIES, cleanLanguage } from "./validate.mts";

export const STAGES = [
  "Understanding business idea...",
  "Analyzing target customers...",
  "Analyzing market...",
  "Analyzing competition...",
  "Estimating financial feasibility...",
  "Identifying raw materials...",
  "Finding nearby sources...",
  "Preparing report...",
];

function inputFromIdea(idea: any): IdeaInput {
  const u = idea.userInput || {};
  return {
    businessIdea: str(u.businessIdea || idea.businessIdea),
    businessName: str(u.businessName || idea.businessName),
    businessType: u.businessType || "Let AI decide",
    area: str(u.area),
    city: str(u.city || idea.city),
    state: str(u.state || idea.state),
    country: str(u.country || idea.country || "India"),
    location: str(u.location || idea.location),
    budget: num(u.budget ?? idea.budget),
    currency: str(u.currency || idea.currency || "INR"),
    expectedCustomers: str(u.expectedCustomers),
    targetCustomer: str(u.targetCustomer),
    sellingPrice: str(u.sellingPrice),
    category: str(u.category),
    additionalInfo: str(u.additionalInfo),
    language: cleanLanguage(u.language),
    transcript: str(u.transcript) || undefined,
  };
}

async function stage(analysisId: string, i: number) {
  await db.patchAnalysis(analysisId, { status: "running", stage: STAGES[i], stageIndex: i });
}

function supplierTargets(ai: any): SearchTarget[] {
  return arr(ai?.supplyChainRequirements?.materials).map((m: any) => ({
    name: str(m.name),
    keywords: m.searchKeywords || [],
    osmTags: m.osmTags || [],
  }));
}

function competitorTargets(ai: any): SearchTarget[] {
  const c = ai?.competitorAnalysis || {};
  return [{ name: "Similar businesses", keywords: c.searchKeywords || [], osmTags: c.osmTags || [] }];
}

async function ensureGeo(idea: any, input: IdeaInput) {
  if (typeof idea.latitude === "number" && typeof idea.longitude === "number") {
    return { lat: idea.latitude, lng: idea.longitude, source: idea.geocodeSource, displayName: idea.location };
  }
  const g = await geocode(input);
  if (g) {
    await db.patchIdea(idea.id, { latitude: g.lat, longitude: g.lng, geocodeSource: `${g.source} (${g.precision})` });
    return { lat: g.lat, lng: g.lng, source: `${g.source} (${g.precision})`, displayName: g.displayName };
  }
  return null;
}

export async function searchSuppliers(ai: any, geo: { lat: number; lng: number } | null, input: IdeaInput, radiusKm?: number) {
  const targets = supplierTargets(ai);
  const whereToLook = strArr(ai?.supplyChainRequirements?.whereToLook, 6);
  if (!geo) {
    return {
      status: "unavailable", sources: [], errors: ["The business location could not be geocoded."], results: [],
      radiusKm: radiusKm ?? 0, center: null, searchedAt: new Date().toISOString(), whereToLook,
      materials: targets.map((t) => t.name),
    };
  }
  let radius = radiusKm ?? 20;
  let found = await findNearby({ center: geo, targets, radiusKm: radius, city: input.city, kind: "supplier" });
  if (!radiusKm && found.status !== "unavailable" && found.results.length < 5) {
    radius = 50; // widen automatically when little is found nearby
    found = await findNearby({ center: geo, targets, radiusKm: radius, city: input.city, kind: "supplier" });
  }
  return { ...found, whereToLook, materials: targets.map((t) => t.name), autoExpanded: !radiusKm && radius === 50 };
}

export async function searchCompetitors(ai: any, geo: { lat: number; lng: number } | null, input: IdeaInput, radiusKm = 15) {
  const targets = competitorTargets(ai);
  if (!geo || (!cleanKeywords(targets[0].keywords).length && !cleanOsmTags(targets[0].osmTags).length)) {
    return {
      status: geo ? "ok" : "unavailable", sources: [], errors: geo ? [] : ["The business location could not be geocoded."],
      results: [], radiusKm, center: geo, searchedAt: new Date().toISOString(),
    };
  }
  const found = await findNearby({ center: geo, targets, radiusKm, city: input.city, kind: "competitor", maxResults: 40 });
  return { ...found, keywords: cleanKeywords(targets[0].keywords), osmTags: cleanOsmTags(targets[0].osmTags) };
}

export async function runAnalysis(p: { analysisId: string; ideaId: string; ownerHash: string; simulateFailure?: boolean; language?: string }) {
  const { analysisId, ideaId, ownerHash } = p;
  const record = await db.getIdea(ownerHash, ideaId, analysisId);
  if (!record?.idea) throw new Error("Idea not found for analysis");
  const idea = record.idea;
  const input = inputFromIdea(idea);
  if (p.language) input.language = cleanLanguage(p.language);
  const cur = CURRENCIES[input.currency] || CURRENCIES.INR;

  try {
    await stage(analysisId, 0);
    const geo = await ensureGeo(idea, input);

    // Step 1 — overview, customers, market
    const s1 = await generateJSON<any>({ system: systemFor(input.language), prompt: step1Prompt(input), forceInvalidModel: p.simulateFailure });
    await stage(analysisId, 3);

    // Step 2 — competition, SWOT, financials, risks
    const s2 = await generateJSON<any>({ system: systemFor(input.language), prompt: step2Prompt(input, s1.data) });
    await stage(analysisId, 5);

    const financialAnalysis = normalizeFinancials(s2.data.financialAnalysis);
    const calc = calculate(driversFromFinancials(financialAnalysis));

    // Step 3 — supply chain, marketing, launch plan, scoring, recommendation
    const digest = {
      businessOverview: s1.data.businessOverview,
      marketAnalysis: { demandLevel: s1.data.marketAnalysis?.demandLevel, growth: s1.data.marketAnalysis?.growthPotential },
      competitionLevel: s2.data.competitorAnalysis?.competitionLevel,
      swot: s2.data.swot,
      topRisks: s2.data.risks,
    };
    const s3 = await generateJSON<any>({ system: systemFor(input.language), prompt: step3Prompt(input, digest, { ...financialAnalysis, calculated: calc }) });
    await stage(analysisId, 6);

    const ov = s1.data.businessOverview || {};
    const ai: any = {
      meta: {
        language: input.language,
        currency: input.currency,
        currencySymbol: cur.symbol,
        locale: cur.locale,
        generatedAt: new Date().toISOString(),
        model: s3.model,
        location: { ...(geo || {}), input: input.location },
        disclaimer:
          "All figures and assessments are AI estimates generated from your inputs. They are not verified real-world data. Validate with real customers, suppliers and local experts before investing.",
      },
      businessOverview: {
        businessName: input.businessName,
        suggestedBrandName: str(ov.businessName),
        businessType: ["Product", "Service", "Hybrid"].includes(ov.businessType) ? ov.businessType : input.businessType,
        category: str(ov.category, input.category),
        businessModel: str(ov.businessModel),
        location: input.location,
        targetCustomer: str(ov.targetCustomer, input.targetCustomer),
        summary: str(ov.summary),
        valueProposition: str(ov.valueProposition),
      },
      marketAnalysis: s1.data.marketAnalysis || {},
      customerAnalysis: s1.data.customerAnalysis || {},
      competitorAnalysis: {
        ...(s2.data.competitorAnalysis || {}),
        searchKeywords: cleanKeywords(s2.data.competitorAnalysis?.searchKeywords),
        osmTags: cleanOsmTags(s2.data.competitorAnalysis?.osmTags),
      },
      swot: {
        strengths: strArr(s2.data.swot?.strengths),
        weaknesses: strArr(s2.data.swot?.weaknesses),
        opportunities: strArr(s2.data.swot?.opportunities),
        threats: strArr(s2.data.swot?.threats),
      },
      financialAnalysis: { ...financialAnalysis, calculated: calc },
      risks: normalizeRisks(s2.data.risks),
      marketingStrategy: s3.data.marketingStrategy || {},
      launchPlan: {
        first7Days: strArr(s3.data.launchPlan?.first7Days),
        first30Days: strArr(s3.data.launchPlan?.first30Days),
        first90Days: strArr(s3.data.launchPlan?.first90Days),
      },
      supplyChainRequirements: {
        summary: str(s3.data.supplyChainRequirements?.summary),
        materials: arr(s3.data.supplyChainRequirements?.materials)
          .map((m: any) => ({
            name: str(m?.name),
            category: str(m?.category, "Raw material"),
            description: str(m?.description),
            estimatedQuantity: str(m?.estimatedQuantity),
            estimatedCost: str(m?.estimatedCost),
            supplierTypes: strArr(m?.supplierTypes, 6),
            searchKeywords: cleanKeywords(m?.searchKeywords),
            osmTags: cleanOsmTags(m?.osmTags),
          }))
          .filter((m) => m.name)
          .slice(0, 8),
        whereToLook: strArr(s3.data.supplyChainRequirements?.whereToLook, 6),
      },
      recommendation: {
        verdict: str(s3.data.recommendation?.verdict, "Go with changes"),
        headline: str(s3.data.recommendation?.headline),
        summary: str(s3.data.recommendation?.summary),
        keyActions: strArr(s3.data.recommendation?.keyActions),
        conditions: strArr(s3.data.recommendation?.conditions),
      },
    };
    const scored = computeScore(s3.data.scoring, calc, financialAnalysis.estimatedInvestment, input.budget);
    ai.scoring = scored;

    // Live data (never AI-generated): suppliers + nearby similar businesses
    let suppliers: any;
    let competitorsLive: any;
    try {
      suppliers = await searchSuppliers(ai, geo, input);
    } catch (e) {
      suppliers = { status: "unavailable", errors: [String((e as Error)?.message || e)], results: [], sources: [] };
    }
    try {
      competitorsLive = await searchCompetitors(ai, geo, input);
    } catch (e) {
      competitorsLive = { status: "unavailable", errors: [String((e as Error)?.message || e)], results: [], sources: [] };
    }

    await stage(analysisId, 7);
    await db.patchIdea(ideaId, {
      businessType: ai.businessOverview.businessType,
      category: ai.businessOverview.category,
    });
    await db.patchAnalysis(analysisId, {
      status: "complete",
      stage: "Analysis Complete",
      stageIndex: STAGES.length,
      model: s3.model,
      aiAnalysis: ai,
      score: scored.score,
      suppliers,
      competitorsLive,
      error: null,
    });
  } catch (e) {
    const detail = e instanceof AIError ? e.detail : String((e as Error)?.message || e);
    console.error("Analysis failed", analysisId, detail);
    await db.patchAnalysis(analysisId, {
      status: "failed",
      stage: "Failed",
      error: `AI analysis could not be completed. ${detail ? `(${detail.replace(/key=[^&\s]+/gi, "key=***").slice(0, 400)})` : ""}`.trim(),
    });
  }
}

export async function runJob(p: { type: string; analysisId: string; ideaId: string; ownerHash: string; params?: any }) {
  const record = await db.getIdea(p.ownerHash, p.ideaId, p.analysisId);
  if (!record?.analysis?.aiAnalysis) throw new Error("Analysis not ready");
  const idea = record.idea;
  const ai = record.analysis.aiAnalysis;
  const input = inputFromIdea(idea);
  if (p.params?.language) input.language = cleanLanguage(p.params.language);
  else if (ai?.meta?.language) input.language = cleanLanguage(ai.meta.language);
  const geo = typeof idea.latitude === "number" ? { lat: idea.latitude, lng: idea.longitude } : await ensureGeo(idea, input);
  const job = p.type;
  const setJob = (v: Record<string, unknown>) =>
    db.patchAnalysis(p.analysisId, { jobs: { [job]: { ...v, updatedAt: new Date().toISOString() } } });

  try {
    await setJob({ status: "running" });
    if (job === "suppliers") {
      const radius = Math.min(Math.max(num(p.params?.radiusKm, 25), 2), 60);
      const suppliers = await searchSuppliers(ai, geo, input, radius);
      await db.patchAnalysis(p.analysisId, { suppliers });
    } else if (job === "competitors") {
      const radius = Math.min(Math.max(num(p.params?.radiusKm, 15), 2), 60);
      const competitorsLive = await searchCompetitors(ai, geo, input, radius);
      await db.patchAnalysis(p.analysisId, { competitorsLive });
    } else if (job === "pivots") {
      const digest = {
        overview: ai.businessOverview,
        demand: ai.marketAnalysis?.demandLevel,
        competition: ai.competitorAnalysis?.competitionLevel,
        economics: ai.financialAnalysis?.calculated,
        swot: ai.swot,
        recommendation: ai.recommendation?.verdict,
      };
      const r = await generateJSON<any>({ system: systemFor(input.language), prompt: pivotPrompt(input, digest), maxOutputTokens: 8192 });
      const items = arr(r.data?.pivots)
        .map((x: any) => ({
          name: str(x?.name), model: str(x?.model), description: str(x?.description),
          targetCustomer: str(x?.targetCustomer), revenueModel: str(x?.revenueModel),
          whyItCouldWork: str(x?.whyItCouldWork), estimatedInvestment: str(x?.estimatedInvestment),
          riskLevel: str(x?.riskLevel, "Medium"), fitScore: Math.min(10, Math.max(0, num(x?.fitScore, 5))),
          firstSteps: strArr(x?.firstSteps, 5),
        }))
        .filter((x) => x.name);
      if (!items.length) throw new AIError("AI returned no pivot ideas.");
      await db.patchAnalysis(p.analysisId, { pivots: { generatedAt: new Date().toISOString(), model: r.model, items } });
    } else {
      throw new Error(`Unknown job ${job}`);
    }
    await setJob({ status: "complete" });
  } catch (e) {
    const detail = e instanceof AIError ? `${e.message} ${e.detail}` : String((e as Error)?.message || e);
    console.error("Job failed", job, detail);
    await setJob({ status: "failed", error: detail.slice(0, 300) });
  }
}
