import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Languages } from "lucide-react";
import { Api } from "../lib/api";
import { getLang, langLabel, t, type Lang } from "../lib/i18n";
import { useCurrentIdea } from "../context/CurrentIdea";
import { SIZE, Spinner, cx } from "./ui";

/** Shown when the saved analysis was written in a different language from the one selected now. */
export function LanguageMismatch() {
  const { idea, ai } = useCurrentIdea();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();
  const current = getLang();
  const analysisLang = (ai?.meta?.language as Lang) || "en";
  if (!idea || !ai || analysisLang === current) return null;
  return (
    <div className="no-print flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 sm:flex-row sm:items-center sm:justify-between" data-testid="language-mismatch">
      <div className="flex items-start gap-2">
        <Languages className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {t("This analysis was written by the AI in {from}. Generate a new analysis in {to}?", { from: langLabel(analysisLang), to: langLabel(current) })}
          {err && <span className="mt-1 block text-rose-700">{err}</span>}
        </span>
      </div>
      <button
        disabled={busy}
        className={cx("btn-primary shrink-0", SIZE.sm)}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const r = await Api.reanalyze(idea.id, false, current);
            nav(`/analyzing/${r.ideaId}?analysisId=${r.analysisId}`);
          } catch (e) {
            setErr((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? <Spinner className="h-3.5 w-3.5" /> : <Languages className="h-3.5 w-3.5" />} {t("Analyze in {lang}", { lang: langLabel(current) })}
      </button>
    </div>
  );
}
