import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Api, ApiError, storageGet, storageSet } from "../lib/api";

type Rec = { idea: any; analysis: any } | null;

interface Ctx {
  ideaId: string | null;
  record: Rec;
  loading: boolean;
  error: string | null;
  ideas: any[];
  ideasLoaded: boolean;
  selectIdea: (id: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  refreshIdeas: () => Promise<any[]>;
}

const CurrentIdeaContext = createContext<Ctx | null>(null);
const CURRENT_KEY = "ss_current_idea";

export function CurrentIdeaProvider({ children }: { children: ReactNode }) {
  const [ideaId, setIdeaId] = useState<string | null>(() => storageGet(CURRENT_KEY));
  const [record, setRecord] = useState<Rec>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<any[]>([]);
  const [ideasLoaded, setIdeasLoaded] = useState(false);
  const reqId = useRef(0);

  const refreshIdeas = useCallback(async () => {
    try {
      const r = await Api.listIdeas();
      setIdeas(r.ideas || []);
      setIdeasLoaded(true);
      return r.ideas || [];
    } catch (e) {
      setIdeasLoaded(true);
      return [];
    }
  }, []);

  const load = useCallback(async (id: string | null) => {
    const my = ++reqId.current;
    setError(null);
    if (!id) {
      setRecord(null);
      setLoading(false);
      return;
    }
    try {
      const r = await Api.getIdea(id);
      if (my !== reqId.current) return;
      setRecord(r);
    } catch (e) {
      if (my !== reqId.current) return;
      if (e instanceof ApiError && e.status === 404) {
        storageSet(CURRENT_KEY, null);
        setIdeaId(null);
        setRecord(null);
      } else {
        setError((e as Error).message);
      }
    } finally {
      if (my === reqId.current) setLoading(false);
    }
  }, []);

  // initial load: remembered idea, else the latest completed analysis
  useEffect(() => {
    (async () => {
      const list = await refreshIdeas();
      let id = ideaId;
      if (id && !list.some((i) => i.id === id)) id = null;
      if (!id) {
        const latest = list.find((i) => i.analysis?.status === "complete") || list[0];
        id = latest?.id || null;
        if (id) storageSet(CURRENT_KEY, id);
        setIdeaId(id);
      }
      await load(id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectIdea = useCallback(
    async (id: string | null) => {
      storageSet(CURRENT_KEY, id);
      setIdeaId(id);
      setLoading(true);
      setRecord(null);
      await load(id);
    },
    [load]
  );

  const refresh = useCallback(async () => {
    await load(ideaId);
  }, [load, ideaId]);

  return (
    <CurrentIdeaContext.Provider value={{ ideaId, record, loading, error, ideas, ideasLoaded, selectIdea, refresh, refreshIdeas }}>
      {children}
    </CurrentIdeaContext.Provider>
  );
}

export function useCurrentIdea() {
  const c = useContext(CurrentIdeaContext);
  if (!c) throw new Error("useCurrentIdea must be inside CurrentIdeaProvider");
  const analysis = c.record?.analysis;
  const ai = analysis?.status === "complete" ? analysis?.aiAnalysis : null;
  return { ...c, idea: c.record?.idea ?? null, analysis, ai };
}

/** Polls `fn` every `ms` while `active` is true. */
export function usePolling(active: boolean, fn: () => void | Promise<void>, ms = 2500) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => fnRef.current(), ms);
    return () => clearInterval(t);
  }, [active, ms]);
}
