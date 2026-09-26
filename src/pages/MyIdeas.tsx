import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, FileText, MapPin, Search, Sparkles, Trash2, Wallet } from "lucide-react";
import { Api } from "../lib/api";
import { useCurrentIdea, usePolling } from "../context/CurrentIdea";
import { fmtDate, fmtMoney, scoreTone, verdictTone } from "../lib/format";
import { EmptyState, LoadingBlock, PageHeader, Pill, SIZE, Spinner, cx } from "../components/ui";

export default function MyIdeas() {
  const { ideas, ideasLoaded, refreshIdeas, selectIdea, ideaId } = useCurrentIdea();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    refreshIdeas();
  }, [refreshIdeas]);
  const pending = ideas.some((i) => i.analysis && ["queued", "running"].includes(i.analysis.status));
  usePolling(pending, () => { refreshIdeas(); }, 4000);

  const list = useMemo(
    () => ideas.filter((i) => `${i.businessName} ${i.city} ${i.category || ""}`.toLowerCase().includes(q.toLowerCase())),
    [ideas, q]
  );

  async function open(id: string, to = "/") {
    await selectIdea(id);
    nav(to);
  }

  async function remove(i: any) {
    if (!window.confirm(`Delete “${i.businessName}” and all of its analyses? This cannot be undone.`)) return;
    setBusy(i.id);
    try {
      await Api.deleteIdea(i.id);
      const rest = await refreshIdeas();
      if (ideaId === i.id) await selectIdea(rest.find((x) => x.analysis?.status === "complete")?.id || null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!ideasLoaded) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        eyebrow="My Ideas"
        title="All analyzed businesses"
        subtitle="Every analysis is saved separately. Open one to make it the current business across all pages."
        actions={<Link to="/new" className={cx("btn-primary", SIZE.md)}><Sparkles className="h-4 w-4" /> New idea</Link>}
      />
      {!ideas.length ? (
        <EmptyState
          title="No Business Idea Analyzed Yet"
          body="Your analyzed ideas will appear here."
          action={<Link to="/new" className={cx("btn-primary", SIZE.md)}>Analyze Your First Idea</Link>}
        />
      ) : (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search ideas…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="ideas-list">
            {list.map((i) => {
              const a = i.analysis;
              const complete = a?.status === "complete";
              const t = scoreTone(a?.score);
              return (
                <div key={i.id} data-testid="idea-card" className={cx("card flex flex-col p-5 transition hover:shadow-md", i.id === ideaId && "ring-2 ring-indigo-300")}>
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => open(i.id)} className="min-w-0 text-left">
                      <div className="truncate font-display text-lg font-bold text-slate-900 hover:text-indigo-700" data-testid="idea-name">{i.businessName}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><MapPin className="h-3.5 w-3.5" /> {i.city}{i.state ? `, ${i.state}` : ""}</div>
                    </button>
                    {complete ? (
                      <div className={cx("rounded-xl px-2.5 py-1.5 text-center ring-1 ring-inset", t.soft)}>
                        <div className="text-[10px] font-semibold uppercase">AI Score</div>
                        <div className="font-display text-lg font-extrabold leading-none">{Number(a.score).toFixed(1)}</div>
                      </div>
                    ) : a?.status === "failed" ? (
                      <Pill className="bg-rose-50 text-rose-700 ring-rose-200"><AlertTriangle className="h-3 w-3" /> Failed</Pill>
                    ) : (
                      <Pill className="bg-indigo-50 text-indigo-700 ring-indigo-200"><Spinner className="h-3 w-3" /> Analyzing</Pill>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-sm text-slate-600"><Wallet className="h-3.5 w-3.5 text-slate-400" /> {fmtMoney(i.budget, { currency: i.currency, locale: i.currency === "INR" ? "en-IN" : "en-US" })}</div>
                  {complete && a.verdict && (
                    <div className="mt-3 flex items-start gap-2">
                      <span className={cx("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold", verdictTone(a.verdict))}>{a.verdict}</span>
                      <span className="line-clamp-2 text-xs text-slate-500">{a.headline}</span>
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-slate-400">
                    <span>{fmtDate(i.createdAt)}</span>
                    <div className="flex gap-1.5">
                      {complete && (
                        <button onClick={() => open(i.id, "/reports")} className={cx("btn-ghost", SIZE.sm)} title="Report"><FileText className="h-3.5 w-3.5" /></button>
                      )}
                      {a?.status === "failed" && (
                        <Link to={`/analyzing/${i.id}?retry=1`} className={cx("btn-secondary", SIZE.sm)}>Retry</Link>
                      )}
                      {a && !complete && a.status !== "failed" && (
                        <Link to={`/analyzing/${i.id}?analysisId=${a.id}`} className={cx("btn-secondary", SIZE.sm)}>Progress</Link>
                      )}
                      <button onClick={() => remove(i)} disabled={busy === i.id} className={cx("btn-ghost text-rose-600 hover:bg-rose-50", SIZE.sm)} title="Delete">
                        {busy === i.id ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                      {complete && <button onClick={() => open(i.id)} className={cx("btn-primary", SIZE.sm)}>Open</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
