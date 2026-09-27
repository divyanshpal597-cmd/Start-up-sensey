import { GitBranch, RefreshCw, Sparkles } from "lucide-react";
import { useCurrentIdea } from "../context/CurrentIdea";
import { useJob } from "../lib/useJob";
import { fmtDateTime, levelTone, scoreTone } from "../lib/format";
import { Card, ErrorBox, NeedsAnalysis, PageHeader, Pill, SIZE, Spinner, Tag, cx } from "../components/ui";
import { t } from "../lib/i18n";

export default function Pivots() {
  const ctx = useCurrentIdea();
  return (
    <NeedsAnalysis ctx={ctx}>
      <Body />
    </NeedsAnalysis>
  );
}

function Body() {
  const { analysis, ai } = useCurrentIdea();
  const { running, start, error } = useJob("pivots");
  const pv = analysis.pivots;
  const items: any[] = pv?.items || [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pivot Generator"
        title={t("Alternative models for {name}", { name: ai.businessOverview?.businessName })}
        subtitle="The AI generates alternative business models that reuse this idea’s customers, suppliers, skills or location."
        actions={
          <button onClick={() => start()} disabled={running} className={cx("btn-primary", SIZE.md)}>
            {running ? <Spinner /> : items.length ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {running ? t("Generating with AI…") : items.length ? t("Regenerate pivots") : t("Generate pivots")}
          </button>
        }
      />
      {error && !running && (
        <ErrorBox title="AI pivot generation could not be completed." actions={<button onClick={() => start()} className={cx("btn-primary", SIZE.md)}>{t("Retry")}</button>}>
          {t("No pivots are shown in place of the failed request.")} {error}
        </ErrorBox>
      )}
      {running && !items.length && (
        <Card><div className="flex items-center gap-3 text-sm text-slate-600"><Spinner className="h-5 w-5 text-indigo-600" /> {t("The AI is generating alternative business models for this idea…")}</div></Card>
      )}
      {!running && !items.length && !error && (
        <Card className="bg-hero text-center">
          <div className="py-10">
            <GitBranch className="mx-auto h-10 w-10 text-indigo-500" />
            <p className="mt-3 text-sm text-slate-600">{t("No pivots generated yet for this business. Click “Generate pivots” to ask the AI.")}</p>
          </div>
        </Card>
      )}
      {items.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-xs text-slate-500"><Tag kind="ai" /> {t("Generated {date}", { date: fmtDateTime(pv.generatedAt) })} · {pv.model}</div>
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((x, i) => (
              <div key={i} className="card flex flex-col p-5" data-testid="pivot-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Pill className="bg-indigo-50 text-indigo-700 ring-indigo-200">{t(x.model)}</Pill>
                    <h3 className="mt-2 font-display text-lg font-bold text-slate-900">{x.name}</h3>
                  </div>
                  <div className={cx("rounded-xl px-2.5 py-1.5 text-center ring-1 ring-inset", scoreTone(x.fitScore).soft)}>
                    <div className="text-[10px] font-semibold uppercase">{t("Fit")}</div>
                    <div className="font-display text-lg font-extrabold leading-none">{Number(x.fitScore).toFixed(1)}</div>
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-600">{x.description}</p>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div><dt className="inline font-semibold text-slate-700">{t("Target:")} </dt><dd className="inline text-slate-600">{x.targetCustomer}</dd></div>
                  <div><dt className="inline font-semibold text-slate-700">{t("Revenue model:")} </dt><dd className="inline text-slate-600">{x.revenueModel}</dd></div>
                  <div><dt className="inline font-semibold text-slate-700">{t("Why it could work:")} </dt><dd className="inline text-slate-600">{x.whyItCouldWork}</dd></div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Pill>{t("Est. investment:")} {x.estimatedInvestment}</Pill>
                  <Pill className={levelTone(x.riskLevel === "Low" ? "high" : x.riskLevel === "High" ? "low" : "moderate")}>{t("{level} risk", { level: t(x.riskLevel) })}</Pill>
                </div>
                {x.firstSteps?.length > 0 && (
                  <div className="mt-4 rounded-xl bg-slate-50 p-3">
                    <div className="mb-1 text-xs font-bold uppercase text-slate-500">{t("First steps")}</div>
                    <ol className="space-y-1 text-sm text-slate-700">{x.firstSteps.map((s: string, j: number) => <li key={j}>{j + 1}. {s}</li>)}</ol>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
