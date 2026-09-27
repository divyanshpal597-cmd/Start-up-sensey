import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "../lib/i18n";

const RELOAD_KEY = "ss_crash_reload";

export function reportClientError(message: string, stack?: string, componentStack?: string) {
  try {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: location.href, message, stack, componentStack }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Never leave the user on a blank page: show what went wrong, report it, and offer a reload. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError(String(error?.message || error), error?.stack, info?.componentStack || undefined);
    // Self-heal once: a fresh page load fixes most transient rendering crashes.
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      if (Date.now() - last > 30_000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        setTimeout(() => location.reload(), 300);
      }
    } catch {
      /* storage blocked — show the message instead */
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center bg-canvas p-6 text-center">
        <div className="card max-w-md p-6">
          <h1 className="font-display text-lg font-extrabold text-slate-900">{t("Something went wrong on this page.")}</h1>
          <p className="mt-2 text-sm text-slate-600">{t("Your ideas are saved. Reload to continue.")}</p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-slate-100 p-2 text-left text-[11px] text-slate-500">{String(this.state.error?.message || this.state.error)}</pre>
          <button className="btn-primary mt-4 rounded-xl px-4 py-2.5 text-sm" onClick={() => location.reload()}>
            {t("Reload page")}
          </button>
        </div>
      </div>
    );
  }
}
