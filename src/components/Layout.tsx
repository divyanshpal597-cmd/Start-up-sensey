import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3, Boxes, Calculator, ChevronDown, FileText, FlaskConical, Gauge, GitBranch, LayoutDashboard, Lightbulb,
  Menu, Radar, Settings, ShieldAlert, Sparkles, Swords, Users, X,
} from "lucide-react";
import { useCurrentIdea } from "../context/CurrentIdea";
import { cx, SIZE } from "./ui";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/new", label: "New Idea", icon: Sparkles },
  { to: "/ideas", label: "My Ideas", icon: Lightbulb },
  { section: "Analysis" },
  { to: "/market", label: "Market Scanner", icon: Radar },
  { to: "/customers", label: "Customer Validation", icon: Users },
  { to: "/financial", label: "Financial Planner", icon: Calculator },
  { to: "/suppliers", label: "Supply Chain & Sources", icon: Boxes },
  { to: "/competitors", label: "Competitor War Room", icon: Swords },
  { section: "Scenarios" },
  { to: "/what-if", label: "What-If Simulator", icon: FlaskConical },
  { to: "/stress-test", label: "Business Stress Test", icon: ShieldAlert },
  { to: "/pivots", label: "Pivot Generator", icon: GitBranch },
  { section: "Output" },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-3 px-2">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-900/40">
        <BarChart3 className="h-5 w-5 text-white" />
      </div>
      <div>
        <div className="font-display text-[15px] font-extrabold tracking-wide text-white">STARTUP SENSE</div>
        <div className="text-[11px] text-indigo-200/80">Validate Before You Invest.</div>
      </div>
    </Link>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-ink-900 px-3 py-5">
      <Brand />
      <nav className="mt-7 flex-1 space-y-0.5 overflow-y-auto">
        {NAV.map((n, i) =>
          "section" in n ? (
            <div key={i} className="px-3 pb-1.5 pt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{n.section}</div>
          ) : (
            <NavLink
              key={n.to}
              to={n.to}
              end={"end" in n ? n.end : false}
              onClick={onNavigate}
              className={({ isActive }) =>
                cx(
                  "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                  isActive ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <n.icon className={cx("h-4 w-4", isActive ? "text-indigo-300" : "text-slate-500 group-hover:text-slate-300")} />
                  {n.label}
                </>
              )}
            </NavLink>
          )
        )}
      </nav>
      <div className="mt-4 rounded-xl bg-white/5 p-3 text-[11px] leading-relaxed text-slate-400">
        AI figures are estimates. Supplier listings come from live map data.
      </div>
    </div>
  );
}

function BusinessSwitcher() {
  const { ideas, idea, selectIdea } = useCurrentIdea();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  if (!ideas.length) return null;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex max-w-[60vw] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50">
        <span className="hidden text-slate-500 sm:inline">Current business:</span>
        <span className="truncate font-semibold text-slate-900">{idea?.businessName || "Select…"}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="max-h-80 overflow-y-auto py-1">
              {ideas.map((i) => (
                <button
                  key={i.id}
                  onClick={async () => {
                    setOpen(false);
                    await selectIdea(i.id);
                    nav("/");
                  }}
                  className={cx("flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50", i.id === idea?.id && "bg-indigo-50/60")}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900">{i.businessName}</div>
                    <div className="truncate text-xs text-slate-500">{i.city} · {i.analysis?.status === "complete" ? `Score ${Number(i.analysis.score).toFixed(1)}` : i.analysis?.status}</div>
                  </div>
                  {i.id === idea?.id && <span className="text-xs font-semibold text-indigo-600">Current</span>}
                </button>
              ))}
            </div>
            <Link to="/ideas" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2.5 text-sm font-medium text-indigo-600 hover:bg-slate-50">
              Manage all ideas →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => window.scrollTo(0, 0), [loc.pathname]);
  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <Sidebar />
      </aside>
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-5 text-slate-300" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
      <header className="no-print sticky top-0 z-20 border-b border-slate-200/70 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 md:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-200/60 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden items-center gap-2 text-sm text-slate-500 md:flex">
              <Gauge className="h-4 w-4 text-indigo-500" /> AI Business Validator
            </div>
          </div>
          <div className="flex items-center gap-2">
            <BusinessSwitcher />
            <Link to="/new" className={cx("btn-primary hidden sm:inline-flex", SIZE.md)}>
              <Sparkles className="h-4 w-4" /> Analyze idea
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
        <Outlet />
      </main>
    </div>
  );
}
