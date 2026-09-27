import { useEffect, useState } from "react";
import { CheckSquare, ClipboardList, Megaphone, Square, Target, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCurrentIdea } from "../context/CurrentIdea";
import { storageGet, storageSet } from "../lib/api";
import { BulletList, Card, NeedsAnalysis, PageHeader, Tag, cx } from "../components/ui";
import { t } from "../lib/i18n";

export default function Customers() {
  const ctx = useCurrentIdea();
  return (
    <NeedsAnalysis ctx={ctx}>
      <Body />
    </NeedsAnalysis>
  );
}

function Segment({ s, primary }: { s: any; primary?: boolean }) {
  return (
    <div className={cx("rounded-xl border p-4", primary ? "border-indigo-200 bg-indigo-50/50" : "border-slate-200 bg-slate-50/60")}>
      <div className="font-semibold text-slate-900">{s.segment}</div>
      <p className="mt-1 text-sm text-slate-600">{s.description}</p>
      {s.willingnessToPay && <p className="mt-2 text-xs text-slate-500"><b>{t("Willingness to pay:")}</b> {s.willingnessToPay}</p>}
    </div>
  );
}

function Body() {
  const { ai, analysis } = useCurrentIdea();
  const c = ai.customerAnalysis || {};
  const storeKey = `ss_validation_${analysis.id}`;
  const [checks, setChecks] = useState<Record<number, { asked: boolean; notes: string }>>({});
  useEffect(() => {
    try {
      setChecks(JSON.parse(storageGet(storeKey) || "{}"));
    } catch {
      setChecks({});
    }
  }, [storeKey]);
  const update = (i: number, patch: Partial<{ asked: boolean; notes: string }>) => {
    setChecks((prev) => {
      const next = { ...prev, [i]: { asked: false, notes: "", ...prev[i], ...patch } };
      storageSet(storeKey, JSON.stringify(next));
      return next;
    });
  };
  const questions: string[] = c.validationQuestions || [];
  const asked = questions.filter((_, i) => checks[i]?.asked).length;
  const factors = (c.buyingFactors || []).map((f: any) => ({ name: f.factor, importance: Number(f.importance) || 0 }));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Customer Validation" title={t("Who buys from {name}?", { name: ai.businessOverview?.businessName })} subtitle="AI-identified customer segments, what they need, and a checklist to validate demand with real people before you invest." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Primary customers" icon={<Users className="h-4 w-4" />} action={<Tag kind="ai" />}>
          <div className="space-y-3">{(c.primaryCustomers || []).map((s: any, i: number) => <Segment key={i} s={s} primary />)}</div>
        </Card>
        <Card title="Secondary customers" icon={<Users className="h-4 w-4" />} action={<Tag kind="ai" />}>
          <div className="space-y-3">{(c.secondaryCustomers || []).map((s: any, i: number) => <Segment key={i} s={s} />)}</div>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Customer needs" icon={<Target className="h-4 w-4" />} action={<Tag kind="ai" />}>
          <BulletList items={c.customerNeeds} />
        </Card>
        <Card title="Buying factors" subtitle="Importance 1–5" action={<Tag kind="ai" />}>
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={factors} layout="vertical" margin={{ left: 10, right: 16 }}>
                <CartesianGrid horizontal={false} stroke="#eef0f6" />
                <XAxis type="number" domain={[0, 5]} tickCount={6} fontSize={11} />
                <YAxis type="category" dataKey="name" width={150} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="importance" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <Card title="Customer acquisition ideas" icon={<Megaphone className="h-4 w-4" />} action={<Tag kind="ai" />}>
        <BulletList items={c.acquisitionIdeas} className="grid gap-2 md:grid-cols-2 md:space-y-0" />
      </Card>
      <Card
        title="Validation interview checklist"
        subtitle={t("Ask these to at least 10 real prospective customers. Progress: {a}/{n} asked. Saved in this browser.", { a: asked, n: questions.length })}
        icon={<ClipboardList className="h-4 w-4" />}
        action={<Tag kind="user" label="Your tracking" />}
      >
        <div className="space-y-3">
          {questions.map((q, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-3">
              <button className="flex w-full items-start gap-3 text-left" onClick={() => update(i, { asked: !checks[i]?.asked })}>
                {checks[i]?.asked ? <CheckSquare className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <Square className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />}
                <span className={cx("text-sm", checks[i]?.asked ? "text-slate-500 line-through" : "text-slate-800")}>{q}</span>
              </button>
              <input className="input mt-2 py-1.5 text-xs" placeholder={t("What did customers say? (notes)")} value={checks[i]?.notes || ""} onChange={(e) => update(i, { notes: e.target.value })} />
            </div>
          ))}
        </div>
      </Card>
      <Card title="Low-cost validation experiments" action={<Tag kind="ai" />}>
        <div className="grid gap-4 md:grid-cols-2">
          {(c.validationExperiments || []).map((x: any, i: number) => (
            <div key={i} className="rounded-xl border border-slate-200 p-4">
              <div className="font-semibold text-slate-900">{x.name}</div>
              <p className="mt-1 text-sm text-slate-600">{x.how}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span><b>{t("Success metric:")}</b> {x.successMetric}</span>
                <span><b>{t("Cost:")}</b> {x.cost}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
