import { useEffect, useState } from "react";
import { Api } from "./api";
import { useCurrentIdea, usePolling } from "../context/CurrentIdea";
import { getLang } from "./i18n";

/** Starts a background job (suppliers / competitors / pivots) and polls until it finishes. */
export function useJob(type: "suppliers" | "competitors" | "pivots") {
  const { idea, analysis, refresh } = useCurrentIdea();
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const job = analysis?.jobs?.[type];
  const running = starting || job?.status === "queued" || job?.status === "running";

  usePolling(!!job && (job.status === "queued" || job.status === "running"), refresh, 2500);

  useEffect(() => setStartError(null), [analysis?.id]);

  async function start(params: { radiusKm?: number } = {}) {
    if (!idea || !analysis) return;
    setStartError(null);
    setStarting(true);
    try {
      await Api.runJob(idea.id, { type, analysisId: analysis.id, language: getLang(), ...params });
      await refresh();
    } catch (e) {
      setStartError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  return { job, running, start, error: startError || (job?.status === "failed" ? job.error || "The job failed." : null) };
}
