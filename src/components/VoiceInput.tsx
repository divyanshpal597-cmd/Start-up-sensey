// Voice input for the business idea. Open-ended: whatever the user says is transcribed and handed to the
// AI extractor as-is — there is no list of supported businesses, categories or keywords anywhere here.
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Mic, MicOff, RotateCcw, Sparkles, Square, Trash2 } from "lucide-react";
import { Api } from "../lib/api";
import { getLang, t } from "../lib/i18n";
import { SIZE, Spinner, cx } from "./ui";

type Phase = "idle" | "listening" | "extracting" | "review" | "error";

export type Extraction = {
  transcript: string;
  fields: Record<string, any>;
  uncertainFields: string[];
  budgetHeard: string | null;
  note: string | null;
};

const SPEECH_LANGS = [
  { id: "en-IN", label: "English (India)" },
  { id: "hi-IN", label: "हिंदी / Hinglish" },
];

function getRecognitionCtor(): any {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

function errorText(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return t("Microphone permission was denied. Allow microphone access in your browser settings, or type your idea below.");
    case "audio-capture":
      return t("No microphone was found. Connect a microphone, or type your idea below.");
    case "no-speech":
      return t("We didn't hear anything. Tap the microphone and speak again.");
    case "network":
      return t("Speech recognition needs an internet connection. Check your connection and try again.");
    case "language-not-supported":
      return t("This browser can't recognise the selected speech language. Try the other speech language or type your idea.");
    default:
      return t("Speech recognition failed. Please try again or type your idea below.");
  }
}

export default function VoiceInput({ onExtracted, onCleared }: { onExtracted: (x: Extraction) => void; onCleared: () => void }) {
  const Ctor = getRecognitionCtor();
  const supported = !!Ctor;
  const [phase, setPhase] = useState<Phase>("idle");
  const [speechLang, setSpeechLang] = useState(getLang() === "en" ? "en-IN" : "hi-IN");
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const recRef = useRef<any>(null);
  const finalRef = useRef("");
  const stopRequested = useRef(false);
  const errored = useRef(false);

  useEffect(() => () => recRef.current?.abort?.(), []);

  async function extract(text: string) {
    const transcript = text.trim();
    if (!transcript) {
      setPhase("error");
      setError(t("We didn't hear anything. Tap the microphone and speak again."));
      return;
    }
    setPhase("extracting");
    setExtractError(null);
    try {
      const r = await Api.extractIdea(transcript, getLang());
      onExtracted({ ...r, transcript });
      setPhase("review");
    } catch (e) {
      setExtractError((e as Error).message);
      setPhase("review");
    }
  }

  function start() {
    if (!Ctor) return;
    setError(null);
    setExtractError(null);
    finalRef.current = "";
    setFinalText("");
    setInterim("");
    stopRequested.current = false;
    errored.current = false;
    let rec: any;
    try {
      rec = new Ctor();
    } catch {
      setPhase("error");
      setError(errorText("unknown"));
      return;
    }
    rec.lang = speechLang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (ev: any) => {
      let fin = "";
      let inter = "";
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) fin += r[0].transcript + " ";
        else inter += r[0].transcript;
      }
      finalRef.current = fin.trim();
      setFinalText(finalRef.current);
      setInterim(inter);
    };
    rec.onerror = (ev: any) => {
      if (ev?.error === "aborted") return;
      errored.current = true;
      setPhase("error");
      setError(errorText(ev?.error || "unknown"));
    };
    rec.onend = () => {
      recRef.current = null;
      if (errored.current) return;
      const text = `${finalRef.current} ${stopRequested.current ? "" : ""}`.trim();
      setInterim("");
      extract(text);
    };
    recRef.current = rec;
    try {
      rec.start();
      setPhase("listening");
    } catch {
      setPhase("error");
      setError(errorText("unknown"));
    }
  }

  function stop() {
    stopRequested.current = true;
    recRef.current?.stop?.();
  }

  function clear() {
    recRef.current?.abort?.();
    finalRef.current = "";
    setFinalText("");
    setInterim("");
    setError(null);
    setExtractError(null);
    setPhase("idle");
    onCleared();
  }

  return (
    <div className="card overflow-hidden p-5" data-testid="voice-panel">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={phase === "listening" ? stop : start}
            disabled={!supported || phase === "extracting"}
            data-testid="mic-button"
            aria-label={phase === "listening" ? t("Stop recording") : t("Speak Your Business Idea")}
            className={cx(
              "relative grid h-14 w-14 shrink-0 place-items-center rounded-full text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-40",
              phase === "listening" ? "bg-rose-500 shadow-rose-500/30" : "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-indigo-500/30 hover:scale-105"
            )}
          >
            {phase === "listening" && <span className="absolute inset-0 animate-ping rounded-full bg-rose-400/60" />}
            {phase === "listening" ? <Square className="relative h-5 w-5" /> : supported ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
          </button>
          <div>
            <div className="font-display text-base font-bold text-slate-900">🎙️ {t("Speak Your Business Idea")}</div>
            <div className="text-sm text-slate-500">
              {phase === "listening"
                ? t("Listening… describe your idea, city, budget and customers. Tap stop when done.")
                : t("Describe any business in your own words — English, हिंदी or Hinglish.")}
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          {t("Speech language")}
          <select
            className="input w-auto py-1.5 text-xs"
            value={speechLang}
            disabled={phase === "listening"}
            onChange={(e) => setSpeechLang(e.target.value)}
            data-testid="speech-lang"
          >
            {SPEECH_LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
      </div>

      {!supported && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="voice-unsupported">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t("Voice input isn't supported in this browser. Use Chrome, Edge or Safari for voice — or simply type your idea below.")}
        </div>
      )}

      {phase === "listening" && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/60 p-4" data-testid="listening">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-rose-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> {t("Listening…")}
          </div>
          <p className="min-h-[1.5rem] text-sm text-slate-800">
            {finalText} <span className="text-slate-400">{interim}</span>
          </p>
          <button type="button" onClick={stop} className={cx("btn-secondary mt-3", SIZE.sm)} data-testid="stop-recording">
            <Square className="h-3.5 w-3.5" /> {t("Stop recording")}
          </button>
        </div>
      )}

      {phase === "extracting" && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-800" data-testid="extracting">
          <Spinner /> {t("Understanding what you said…")}
        </div>
      )}

      {phase === "error" && error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" data-testid="voice-error">
          <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</div>
          <button type="button" onClick={start} disabled={!supported} className={cx("btn-secondary mt-3", SIZE.sm)}>
            <RotateCcw className="h-3.5 w-3.5" /> {t("Try again")}
          </button>
        </div>
      )}

      {phase === "review" && (
        <div className="mt-4 space-y-3" data-testid="transcript-review">
          <label className="label" htmlFor="transcript">{t("What we heard (you can edit this)")}</label>
          <textarea
            id="transcript"
            data-testid="transcript"
            rows={3}
            className="input"
            value={finalText}
            onChange={(e) => {
              finalRef.current = e.target.value;
              setFinalText(e.target.value);
            }}
          />
          {extractError && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800" data-testid="extract-error">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {extractError}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => extract(finalText)} className={cx("btn-primary", SIZE.sm)} data-testid="re-extract">
              <Sparkles className="h-3.5 w-3.5" /> {t("Update details from this text")}
            </button>
            <button type="button" onClick={start} disabled={!supported} className={cx("btn-secondary", SIZE.sm)} data-testid="re-record">
              <RotateCcw className="h-3.5 w-3.5" /> {t("Re-record")}
            </button>
            <button type="button" onClick={clear} className={cx("btn-ghost text-rose-600 hover:bg-rose-50", SIZE.sm)} data-testid="clear-transcript">
              <Trash2 className="h-3.5 w-3.5" /> {t("Clear")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
