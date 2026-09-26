import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, MapPin, Sparkles, Wallet } from "lucide-react";
import { Api, storageGet, storageSet } from "../lib/api";
import { Card, ErrorBox, PageHeader, SIZE, Spinner, cx } from "../components/ui";
import { useCurrentIdea } from "../context/CurrentIdea";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "NPR", "BDT", "PKR", "LKR"];
const CATEGORIES = [
  "", "Manufacturing", "Food & Beverage", "Retail", "E-commerce", "Services", "Energy & EV", "Agriculture",
  "Education", "Health & Wellness", "Technology / SaaS", "Logistics", "Hospitality & Travel", "Fashion & Textiles",
  "Construction & Real Estate", "Other",
];

type Form = {
  businessIdea: string; businessType: string; area: string; city: string; state: string; country: string;
  budget: string; currency: string; expectedCustomers: string; targetCustomer: string; sellingPrice: string;
  category: string; additionalInfo: string;
};

const EMPTY: Form = {
  businessIdea: "", businessType: "Let AI decide", area: "", city: "", state: "", country: "India",
  budget: "", currency: "INR", expectedCustomers: "", targetCustomer: "", sellingPrice: "", category: "", additionalInfo: "",
};

export const SIMULATE_KEY = "ss_simulate_failure_once";

export default function NewIdea() {
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [simulate, setSimulate] = useState(false);
  const nav = useNavigate();
  const { refreshIdeas } = useCurrentIdea();

  useEffect(() => setSimulate(storageGet(SIMULATE_KEY) === "1"), []);

  const set = (k: keyof Form) => (e: { target: { value: string } }) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };

  function validate(): boolean {
    const e: Partial<Record<keyof Form, string>> = {};
    if (f.businessIdea.trim().length < 3) e.businessIdea = "Describe your business idea (at least 3 characters).";
    if (f.city.trim().length < 2) e.city = "City is required.";
    if (f.country.trim().length < 2) e.country = "Country is required.";
    const b = Number(f.budget.replace(/[,\s]/g, ""));
    if (!Number.isFinite(b) || b <= 0) e.budget = "Enter your starting budget as a number.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setServerError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const r = await Api.analyze({
        ...f,
        budget: Number(f.budget.replace(/[,\s]/g, "")),
        simulateFailure: simulate,
      });
      if (simulate) storageSet(SIMULATE_KEY, null);
      refreshIdeas();
      nav(`/analyzing/${r.ideaId}?analysisId=${r.analysisId}`);
    } catch (e) {
      setServerError((e as Error).message);
      setSubmitting(false);
    }
  }

  const field = (k: keyof Form) => cx("input", errors[k] && "border-rose-300 focus:border-rose-400 focus:ring-rose-100");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Analyze New Idea"
        title="Tell us about your business idea"
        subtitle="Your inputs are sent to a real AI model on our server. It analyses your specific idea, location and budget — nothing is pre-written."
      />
      {simulate && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div>
            <b>Failure test is ON.</b> The next analysis will call the AI with an invalid model to demonstrate error handling.{" "}
            <button className="underline" onClick={() => { storageSet(SIMULATE_KEY, null); setSimulate(false); }}>Turn off</button>
          </div>
        </div>
      )}
      <form onSubmit={submit} noValidate className="space-y-5">
        <Card title="Business idea" icon={<Sparkles className="h-4 w-4" />}>
          <div className="grid gap-4">
            <div>
              <label className="label" htmlFor="businessIdea">Business Idea *</label>
              <input id="businessIdea" className={field("businessIdea")} value={f.businessIdea} onChange={set("businessIdea")} placeholder="e.g. Paper Plate Manufacturing" maxLength={300} />
              {errors.businessIdea && <p className="mt-1 text-xs text-rose-600">{errors.businessIdea}</p>}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <span className="label">Business Type</span>
                <div className="grid grid-cols-3 gap-2">
                  {["Product", "Service", "Let AI decide"].map((t) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => setF((p) => ({ ...p, businessType: t }))}
                      className={cx(
                        "rounded-xl border px-3 py-2.5 text-sm font-medium transition",
                        f.businessType === t ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-4 ring-indigo-100" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label" htmlFor="category">Business Category</label>
                <select id="category" className="input" value={f.category} onChange={set("category")}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c || "Let AI determine"}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Location" subtitle="Used for local market analysis and to find the nearest real suppliers." icon={<MapPin className="h-4 w-4" />}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="city">City *</label>
              <input id="city" className={field("city")} value={f.city} onChange={set("city")} placeholder="e.g. Kanpur" maxLength={80} />
              {errors.city && <p className="mt-1 text-xs text-rose-600">{errors.city}</p>}
            </div>
            <div>
              <label className="label" htmlFor="state">State</label>
              <input id="state" className="input" value={f.state} onChange={set("state")} placeholder="e.g. Uttar Pradesh" maxLength={80} />
            </div>
            <div>
              <label className="label" htmlFor="country">Country *</label>
              <input id="country" className={field("country")} value={f.country} onChange={set("country")} maxLength={60} />
              {errors.country && <p className="mt-1 text-xs text-rose-600">{errors.country}</p>}
            </div>
            <div>
              <label className="label" htmlFor="area">Area / locality <span className="font-normal text-slate-400">(optional, improves distances)</span></label>
              <input id="area" className="input" value={f.area} onChange={set("area")} placeholder="e.g. Kakadeo" maxLength={120} />
            </div>
          </div>
        </Card>

        <Card title="Money & customers" icon={<Wallet className="h-4 w-4" />}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="budget">Starting Budget *</label>
              <div className="flex gap-2">
                <select aria-label="Currency" className="input w-28" value={f.currency} onChange={set("currency")}>
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <input id="budget" inputMode="decimal" className={field("budget")} value={f.budget} onChange={set("budget")} placeholder="50000" />
              </div>
              {errors.budget && <p className="mt-1 text-xs text-rose-600">{errors.budget}</p>}
            </div>
            <div>
              <label className="label" htmlFor="sellingPrice">Selling Price</label>
              <input id="sellingPrice" className="input" value={f.sellingPrice} onChange={set("sellingPrice")} placeholder="e.g. ₹60 per pack of 50 plates" maxLength={200} />
            </div>
            <div>
              <label className="label" htmlFor="expectedCustomers">Expected Customers</label>
              <input id="expectedCustomers" className="input" value={f.expectedCustomers} onChange={set("expectedCustomers")} placeholder="e.g. Restaurants, caterers and food vendors" maxLength={500} />
            </div>
            <div>
              <label className="label" htmlFor="targetCustomer">Target Customer</label>
              <input id="targetCustomer" className="input" value={f.targetCustomer} onChange={set("targetCustomer")} placeholder="e.g. Wedding caterers within 20 km" maxLength={500} />
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor="additionalInfo">Additional Information</label>
              <textarea id="additionalInfo" rows={4} className="input" value={f.additionalInfo} onChange={set("additionalInfo")} placeholder="Your skills, space available, machines you already own, time commitment, anything else relevant…" maxLength={2000} />
            </div>
          </div>
        </Card>

        {serverError && (
          <ErrorBox title="AI analysis could not be started.">{serverError}</ErrorBox>
        )}

        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Analysis usually takes 30–90 seconds. You can leave the page — results are saved.</p>
          <button type="submit" disabled={submitting} className={cx("btn-primary", SIZE.lg)}>
            {submitting ? <Spinner /> : <Sparkles className="h-5 w-5" />} ANALYZE BUSINESS IDEA
          </button>
        </div>
      </form>
    </div>
  );
}
