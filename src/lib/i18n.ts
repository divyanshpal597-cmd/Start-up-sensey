// Lightweight i18n: English source strings are the keys; Hindi and Hinglish dictionaries translate them.
// The selected language is saved in the browser and also sent to the backend so the AI writes the analysis in it.
import { HI, HINGLISH } from "./translations";
import { setApiTranslator, storageGet, storageSet } from "./api";

export type Lang = "en" | "hi" | "hinglish";
export const LANGS: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "hi", label: "हिंदी" },
  { id: "hinglish", label: "Hinglish" },
];

const KEY = "ss_language";
let current: Lang = (() => {
  const v = storageGet(KEY);
  return v === "hi" || v === "hinglish" || v === "en" ? v : "en";
})();
const listeners = new Set<(l: Lang) => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(l: Lang) {
  current = l;
  storageSet(KEY, l);
  applyDocumentLang();
  listeners.forEach((fn) => fn(l));
}

export function onLangChange(fn: (l: Lang) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function applyDocumentLang() {
  if (typeof document !== "undefined") document.documentElement.lang = current === "hi" ? "hi" : current === "hinglish" ? "hi-Latn" : "en";
}

const DICTS: Record<Lang, Record<string, string>> = { en: {}, hi: HI, hinglish: HINGLISH };
setApiTranslator((s) => t(s));

/** Translate an English UI string, with optional {placeholders}. Unknown strings fall back to English. */
export function t(s: string, vars?: Record<string, string | number | null | undefined>): string {
  let out = DICTS[current]?.[s] ?? s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v ?? ""));
  return out;
}

export function langMeta(l: Lang = current) {
  return LANGS.find((x) => x.id === l) || LANGS[0];
}

export function langLabel(l: string | undefined) {
  return LANGS.find((x) => x.id === l)?.label || "English";
}
