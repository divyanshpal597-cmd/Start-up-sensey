import { useEffect, useState, type ReactNode } from "react";
import { BrainCircuit, Copy, Database, FlaskConical, KeyRound, Languages, MapPinned, ShieldCheck } from "lucide-react";
import { Api, getOwnerKey, setOwnerKey, storageAvailable, storageGet, storageSet } from "../lib/api";
import { useCurrentIdea } from "../context/CurrentIdea";
import { Card, Notice, PageHeader, Pill, SIZE, Tag, cx } from "../components/ui";
import { LanguageSelect } from "../components/Layout";
import { t } from "../lib/i18n";
import { SIMULATE_KEY } from "./NewIdea";

function StatusPill({ ok, label }: { ok: boolean; label?: string }) {
  return ok ? (
    <Pill className="bg-emerald-50 text-emerald-700 ring-emerald-200">{t(label || "Configured")}</Pill>
  ) : (
    <Pill className="bg-amber-50 text-amber-800 ring-amber-200">{t(label || "Not configured")}</Pill>
  );
}

function Row({ icon, title, desc, right }: { icon: ReactNode; title: string; desc: ReactNode; right: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <div className="font-medium">{t(title)}</div>
          <div className="text-xs text-slate-500">{desc}</div>
        </div>
      </div>
      {right}
    </div>
  );
}

export default function SettingsPage() {
  const [status, setStatus] = useState<any>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [importKey, setImportKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [simulate, setSimulate] = useState(storageGet(SIMULATE_KEY) === "1");
  const { refreshIdeas, selectIdea } = useCurrentIdea();
  const key = getOwnerKey();

  useEffect(() => {
    Api.status().then(setStatus).catch((e) => setStatusErr(e.message));
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader eyebrow="Settings" title="Settings & integrations" subtitle="All API keys live in server-side environment variables. None are ever sent to your browser." />

      <Card title="Language" subtitle="Changes the whole interface. New AI analyses are written directly in this language." icon={<Languages className="h-4 w-4" />}>
        <LanguageSelect className="w-max" />
        <p className="mt-3 text-xs text-slate-500">{t("Your choice is saved in this browser and stays selected after a refresh.")}</p>
      </Card>

      <Card title="Integrations" icon={<ShieldCheck className="h-4 w-4" />}>
        {statusErr && <Notice tone="warn">{t("Could not load server status:")} {statusErr}</Notice>}
        <div className="divide-y divide-slate-100">
          <Row
            icon={<BrainCircuit className="h-5 w-5 text-violet-500" />}
            title="AI analysis"
            desc={`${status?.ai?.provider || "—"} · ${t("model")} ${status?.ai?.model || "—"} · ${t("key stored as GEMINI_API_KEY on the server")}`}
            right={<StatusPill ok={!!status?.ai?.configured} />}
          />
          <Row
            icon={<MapPinned className="h-5 w-5 text-emerald-500" />}
            title="Google Places (optional)"
            desc={t("Richer supplier data: phones, ratings, opening hours. Set GOOGLE_MAPS_API_KEY on the server.")}
            right={<StatusPill ok={!!status?.places?.googlePlaces} label={status?.places?.googlePlaces ? "Enabled" : "Not set — using OpenStreetMap"} />}
          />
          <Row
            icon={<MapPinned className="h-5 w-5 text-indigo-500" />}
            title="OpenStreetMap (Nominatim + Overpass)"
            desc={t("Free, live map data for geocoding and nearby business search.")}
            right={<StatusPill ok label="Always on" />}
          />
          <Row
            icon={<Database className="h-5 w-5 text-sky-500" />}
            title="Database"
            desc={t("Supabase Postgres, accessed only through secured server functions.")}
            right={<StatusPill ok={!!status?.database?.configured} />}
          />
        </div>
      </Card>

      <Card title="Your workspace key" subtitle="Your ideas are tied to this private key stored in this browser. Copy it to open your ideas on another device." icon={<KeyRound className="h-4 w-4" />}>
        {!storageAvailable() && <div className="mb-3"><Notice tone="warn">{t("Browser storage is blocked, so this key only lasts for this tab. Copy it to keep access to your ideas.")}</Notice></div>}
        <div className="flex flex-wrap items-center gap-2">
          <code className="flex-1 truncate rounded-lg bg-slate-100 px-3 py-2 text-xs">{showKey ? key : `${key.slice(0, 6)}••••••••••••••••••••${key.slice(-4)}`}</code>
          <button className={cx("btn-secondary", SIZE.sm)} onClick={() => setShowKey((s) => !s)}>{showKey ? t("Hide") : t("Show")}</button>
          <button
            className={cx("btn-secondary", SIZE.sm)}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(key);
                setMsg(t("Workspace key copied."));
              } catch {
                setMsg(t("Copy failed — select and copy it manually."));
              }
            }}
          >
            <Copy className="h-3.5 w-3.5" /> {t("Copy")}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <input className="input flex-1" placeholder={t("Paste a workspace key from another device")} value={importKey} onChange={(e) => setImportKey(e.target.value.trim())} />
          <button
            className={cx("btn-primary", SIZE.md)}
            disabled={!importKey}
            onClick={async () => {
              try {
                setOwnerKey(importKey);
                storageSet("ss_current_idea", null);
                const list = await refreshIdeas();
                await selectIdea(list.find((i) => i.analysis?.status === "complete")?.id || null);
                setMsg(t("Switched workspace — {n} idea(s) found.", { n: list.length }));
                setImportKey("");
              } catch (e) {
                setMsg(t((e as Error).message));
              }
            }}
          >
            {t("Use this key")}
          </button>
        </div>
        {msg && <p className="mt-2 text-sm text-indigo-700">{msg}</p>}
      </Card>

      <Card title="Data labels" subtitle="How to read numbers across Startup Sense">
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div className="flex items-start gap-2"><Tag kind="ai" /> <span className="text-slate-600">{t("Generated by the AI from your inputs. Never verified data.")}</span></div>
          <div className="flex items-start gap-2"><Tag kind="user" /> <span className="text-slate-600">{t("A value you entered or changed.")}</span></div>
          <div className="flex items-start gap-2"><Tag kind="calc" /> <span className="text-slate-600">{t("Computed with a formula from the values shown.")}</span></div>
          <div className="flex items-start gap-2"><Tag kind="verified" /> <span className="text-slate-600">{t("A real business from a live map/business data source.")}</span></div>
          <div className="flex items-start gap-2 md:col-span-2"><Tag kind="unverified" /> <span className="text-slate-600">{t("An AI pointer with no live data behind it.")}</span></div>
        </div>
      </Card>

      <Card
        title="Error-handling test"
        subtitle="Check what happens when the AI fails. Your next analysis will call the AI with an invalid model, so you can see the real error screen (no sample data is ever shown)."
        icon={<FlaskConical className="h-4 w-4" />}
      >
        {status && !status.failureTestAllowed ? (
          <p className="text-sm text-slate-500">{t("Disabled on this server.")}</p>
        ) : (
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              data-testid="simulate-failure"
              checked={simulate}
              onChange={(e) => {
                setSimulate(e.target.checked);
                storageSet(SIMULATE_KEY, e.target.checked ? "1" : null);
              }}
            />
            {t("Simulate an AI failure on my next analysis (one time)")}
          </label>
        )}
      </Card>
    </div>
  );
}
