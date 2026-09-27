import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Languages, Square, Volume2 } from "lucide-react";
import { Api } from "../lib/api";
import { getLang, langLabel, t, type Lang } from "../lib/i18n";
import { useCurrentIdea } from "../context/CurrentIdea";
import { SIZE, Spinner, cx } from "./ui";

const hasTTS = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const base = lang.split("-")[0];
  return (
    voices.find((v) => v.lang === lang) ||
    voices.find((v) => v.lang?.replace("_", "-").startsWith(base + "-")) ||
    voices.find((v) => v.lang?.startsWith(base)) ||
    null
  );
}

/** Builds the spoken script from the saved AI analysis (already written in the analysis language). */
function buildScript(ai: any, idea: any, analysis: any): string[] {
  const ov = ai.businessOverview || {};
  const rec = ai.recommendation || {};
  const parts: string[] = [];
  parts.push(`${ov.businessName || idea.businessName}. ${t("AI Validation Score")}: ${Number(analysis.score).toFixed(1)} / 10. ${t(rec.verdict || "")}.`);
  if (rec.headline) parts.push(rec.headline);
  if (ov.summary) parts.push(ov.summary);
  if (ai.marketAnalysis?.demandSummary) parts.push(`${t("Market demand")}: ${ai.marketAnalysis.demandSummary}`);
  if (ai.swot?.strengths?.length) parts.push(`${t("Strengths")}: ${ai.swot.strengths.slice(0, 3).join(". ")}`);
  if (ai.swot?.weaknesses?.length) parts.push(`${t("Weaknesses")}: ${ai.swot.weaknesses.slice(0, 3).join(". ")}`);
  if (rec.summary) parts.push(rec.summary);
  if (rec.keyActions?.length) parts.push(`${t("Key actions")}: ${rec.keyActions.join(". ")}`);
  // Split into sentence-sized chunks: long utterances get cut off in some browsers.
  return parts
    .join(" ")
    .split(/(?<=[.!?।])\s+/)
    .reduce<string[]>((acc, s) => {
      const last = acc[acc.length - 1];
      if (last && last.length + s.length < 220) acc[acc.length - 1] = `${last} ${s}`;
      else acc.push(s);
      return acc;
    }, []);
}

export default function ReadAloud({ ai, idea, analysis }: { ai: any; idea: any; analysis: any }) {
  const [speaking, setSpeaking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => () => {
    if (hasTTS()) window.speechSynthesis.cancel();
  }, []);

  if (!hasTTS()) return null;
  const analysisLang: Lang = (ai?.meta?.language as Lang) || "en";
  // Hinglish is Hindi in Roman letters: an Indian-English voice reads it far better than a Devanagari voice.
  const ttsLang = analysisLang === "hi" ? "hi-IN" : "en-IN";

  function stop() {
    cancelled.current = true;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  function start() {
    setMsg(null);
    const synth = window.speechSynthesis;
    synth.cancel();
    cancelled.current = false;
    const chunks = buildScript(ai, idea, analysis);
    const voice = pickVoice(ttsLang);
    if (!voice && analysisLang === "hi") setMsg(t("No Hindi voice is installed on this device, so the default voice is used."));
    let i = 0;
    const next = () => {
      if (cancelled.current || i >= chunks.length) {
        setSpeaking(false);
        return;
      }
      const u = new SpeechSynthesisUtterance(chunks[i++]);
      u.lang = ttsLang;
      if (voice) u.voice = voice;
      u.rate = 0.98;
      u.onend = next;
      u.onerror = (e: any) => {
        if (e?.error !== "interrupted" && e?.error !== "canceled") setMsg(t("Could not read the analysis aloud on this device."));
        setSpeaking(false);
      };
      synth.speak(u);
    };
    setSpeaking(true);
    next();
  }

  return (
    <div>
      {speaking ? (
        <button onClick={stop} className={cx("btn-secondary", SIZE.sm)} data-testid="read-aloud-stop">
          <Square className="h-3.5 w-3.5" /> {t("Stop reading")}
        </button>
      ) : (
        <button onClick={start} className={cx("btn-secondary", SIZE.sm)} data-testid="read-aloud">
          <Volume2 className="h-3.5 w-3.5" /> {t("Read Analysis Aloud")}
        </button>
      )}
      {msg && <div className="mt-1 max-w-[16rem] text-[11px] text-amber-700">{msg}</div>}
    </div>
  );
}

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
