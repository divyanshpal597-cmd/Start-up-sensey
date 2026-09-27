import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, Circle, PartyPopper } from "lucide-react";
import { Api, storageGet, storageSet } from "../lib/api";
import { useCurrentIdea } from "../context/CurrentIdea";
import { Card, ErrorBox, LoadingBlock, PageHeader, SIZE, Spinner, cx } from "../components/ui";
import { SIMULATE_KEY } from "./NewIdea";
import { getLang, t } from "../lib/i18n";

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

export default function Analyzing() {
  const { ideaId } = useParams();
  const [params, setParams] = useSearchParams();
  const analysisId = params.get("analysisId");
  const retry = params.get("retry") === "1";
  const nav = useNavigate();
  const { selectIdea, refreshIdeas } = useCurrentIdea();
  const [rec, setRec] = useState<{ idea: any; analysis: any } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(Date.now());
  const retryFired = useRef(false);

  async function startRetry() {
    if (!ideaId) return;
    setRetrying(true);
    setError(null);
    try {
      const simulate = storageGet(SIMULATE_KEY) === "1";
      const r = await Api.reanalyze(ideaId, simulate, getLang());
      if (simulate) storageSet(SIMULATE_KEY, null);
      started.current = Date.now();
      setRec(null);
      setParams({ analysisId: r.analysisId }, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRetrying(false);
    }
  }

  useEffect(() => {
    if (retry && !retryFired.current) {
      retryFired.current = true;
      startRetry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retry]);

  const status = rec?.analysis?.status;
  const done = status === "complete" || status === "failed";

  useEffect(() => {
    if (!ideaId || retry) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await Api.getIdea(ideaId, analysisId || undefined);
        if (stop) return;
        setRec(r);
        if (r.analysis?.status === "complete") {
          await selectIdea(ideaId);
          refreshIdeas();
        }
        if (r.analysis?.status === "complete" || r.analysis?.status === "failed") return;
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
      if (!stop) setTimeout(tick, 2000);
    };
    tick();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideaId, analysisId, retry]);

  useEffect(() => {
    if (done) return;
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [done, analysisId]);

  if (retrying) return <LoadingBlock label="Starting a new analysis…" />;
  if (error && !rec) {
    return (
      <ErrorBox title="AI analysis could not be completed." actions={
        <>
          <button onClick={startRetry} className={cx("btn-primary", SIZE.md)}>{t("Retry Analysis")}</button>
          <Link to="/new" className={cx("btn-secondary", SIZE.md)}>{t("Back to New Idea")}</Link>
        </>
      }>{error}</ErrorBox>
    );
  }
  if (!rec) return <LoadingBlock label="Connecting to the analysis…" />;

  const a = rec.analysis;
  const idx = status === "complete" ? STAGES.length : Number(a?.stageIndex ?? 0);
  const queuedTooLong = status === "queued" && elapsed > 60;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Real AI analysis"
        title={rec.idea.businessName}
        subtitle={`${rec.idea.location} · ${t("Budget")} ${rec.idea.currency} ${Number(rec.idea.budget).toLocaleString("en-IN")}`}
      />

      {status === "failed" ? (
        <ErrorBox
          title="AI analysis could not be completed."
          actions={
            <>
              <button onClick={startRetry} className={cx("btn-primary", SIZE.md)}>{t("Retry Analysis")}</button>
              <Link to="/new" className={cx("btn-secondary", SIZE.md)}>{t("Back to New Idea")}</Link>
            </>
          }
        >
          {t("No results were generated, and no sample data is shown in their place. Your idea and inputs are saved, so you can retry.")}
          {a?.error && <span className="mt-2 block rounded-lg bg-white/60 p-2 font-mono text-[11px] text-rose-700">{a.error}</span>}
        </ErrorBox>
      ) : (
        <Card>
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {status === "complete" ? (
                <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-600"><PartyPopper className="h-5 w-5" /></div>
              ) : (
                <div className="grid h-10 w-10 place-items-center rounded-full bg-indigo-100 text-indigo-600"><Spinner className="h-5 w-5" /></div>
              )}
              <div>
                <div className="font-display text-lg font-bold text-slate-900">
                  {status === "complete" ? t("Analysis Complete") : status === "queued" ? t("Waiting for the AI worker…") : t(a?.stage || "Working…")}
                </div>
                <div className="text-xs text-slate-500">
                  {status === "complete" ? t("Saved with AI score {s} / 10", { s: Number(a.score).toFixed(1) }) : t("{n}s elapsed · live progress from the server", { n: elapsed })}
                </div>
              </div>
            </div>
          </div>
          <div className="mb-6 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-700" style={{ width: `${Math.max(4, (idx / STAGES.length) * 100)}%` }} />
          </div>
          <ol className="space-y-3">
            {STAGES.map((s, i) => {
              const state = i < idx ? "done" : i === idx && status !== "complete" ? "active" : "todo";
              return (
                <li key={s} className="flex items-center gap-3 text-sm">
                  {state === "done" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : state === "active" ? (
                    <Spinner className="h-5 w-5 text-indigo-600" />
                  ) : (
                    <Circle className="h-5 w-5 text-slate-300" />
                  )}
                  <span className={cx(state === "todo" ? "text-slate-400" : "text-slate-800", state === "active" && "font-semibold")}>{t(s)}</span>
                </li>
              );
            })}
          </ol>
          {queuedTooLong && (
            <p className="mt-5 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{t("The worker has not picked this up yet. It may be busy — keep this page open, or retry.")}</p>
          )}
          {status === "complete" && (
            <div className="mt-6 flex flex-wrap gap-2">
              <button onClick={() => nav("/")} className={cx("btn-primary", SIZE.md)}>{t("Open dashboard")}</button>
              <Link to="/suppliers" className={cx("btn-secondary", SIZE.md)}>{t("See nearest suppliers")}</Link>
              <Link to="/reports" className={cx("btn-secondary", SIZE.md)}>{t("View report")}</Link>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
