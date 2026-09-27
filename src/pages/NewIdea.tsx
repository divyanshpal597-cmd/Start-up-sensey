import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, MapPin, Sparkles, Wallet } from "lucide-react";
import { Api, storageGet, storageSet } from "../lib/api";
import { getLang, t } from "../lib/i18n";
import { Card, ErrorBox, PageHeader, SIZE, Spinner, cx } from "../components/ui";
import { useCurrentIdea } from "../context/CurrentIdea";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "NPR", "BDT", "PKR", "LKR"];
// Suggestions only — the category field accepts any text.
const CATEGORY_SUGGESTIONS = [
  "Manufacturing", "Food & Beverage", "Retail", "E-commerce", "Services", "Energy & EV", "Agriculture", "Education",
  "Health & Wellness", "Technology / SaaS", "Logistics", "Hospitality & Travel", "Fashion & Textiles", "Construction & Real Estate",
];

type Form = {
  businessIdea: string; businessType: string; area: string; city: string; state: string; country: string;
  budget: string; currency: string; expectedCustomers: string; targetCustomer: string; sellingPrice: string;
  category: string; additionalInfo: string;
};
type Key = keyof Form;

const EMPTY: Form = {
  businessIdea: "", businessType: "Let AI decide", area: "", city: "", state: "", country: "India",
  budget: "", currency: "INR", expectedCustomers: "", targetCustomer: "", sellingPrice: "", category: "", additionalInfo: "",
};

export const SIMULATE_KEY = "ss_simulate_failure_once";

export default function NewIdea() {
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [simulate, setSimulate] = useState(false);
  const nav = useNavigate();
  const { refreshIdeas } = useCurrentIdea();

  useEffect(() => {
    setSimulate(storageGet(SIMULATE_KEY) === "1");
  }, []);

  const set = (k: Key) => (e: { target: { value: string } }) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };

  function validate(): boolean {
    const e: Partial<Record<Key, string>> = {};
    if (f.businessIdea.trim().length < 3) e.businessIdea = t("Describe your business idea (at least 3 characters).");
    if (f.city.trim().length < 2) e.city = t("City is required.");
    if (f.country.trim().length < 2) e.country = t("Country is required.");
    const b = Number(f.budget.replace(/[,\s]/g, ""));
    if (!Number.isFinite(b) || b <= 0) e.budget = t("Enter your starting budget as a number.");
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setServerError(null);
    if (!validate()) {
      document.querySelector("[data-invalid='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    try {
      const r = await Api.analyze({
        ...f,
        budget: Number(f.budget.replace(/[,\s]/g, "")),
        language: getLang(),
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

  const field = (k: Key) =>
    cx(
      "input",
      errors[k] && "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
    );

  const Lbl = ({ htmlFor, children }: { k: Key; htmlFor?: string; children: ReactNode }) => (
    <label className="label" htmlFor={htmlFor}>{children}</label>
  );
  const Err = ({ k }: { k: Key }) => (errors[k] ? <p className="mt-1 text-xs text-rose-600">{errors[k]}</p> : null);

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
            <b>{t("Failure test is ON.")}</b> {t("The next analysis will call the AI with an invalid model to demonstrate error handling.")}{" "}
            <button className="underline" onClick={() => { storageSet(SIMULATE_KEY, null); setSimulate(false); }}>{t("Turn off")}</button>
          </div>
        </div>
      )}

      <form onSubmit={submit} noValidate className="space-y-5">
        <Card title="Business idea" icon={<Sparkles className="h-4 w-4" />}>
          <div className="grid gap-4">
            <div data-invalid={!!errors.businessIdea}>
              <Lbl k="businessIdea" htmlFor="businessIdea">{t("Business Idea")} *</Lbl>
              <input id="businessIdea" className={field("businessIdea")} value={f.businessIdea} onChange={set("businessIdea")} placeholder={t("e.g. Paper Plate Manufacturing")} maxLength={300} />
              <Err k="businessIdea" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Lbl k="businessType">{t("Business Type")}</Lbl>
                <div className="grid grid-cols-3 gap-2">
                  {["Product", "Service", "Let AI decide"].map((ty) => (
                    <button
                      type="button"
                      key={ty}
                      onClick={() => setF((p) => ({ ...p, businessType: ty }))}
                      className={cx(
                        "rounded-xl border px-3 py-2.5 text-sm font-medium transition",
                        f.businessType === ty ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-4 ring-indigo-100" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {t(ty)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Lbl k="category" htmlFor="category">{t("Business Category")}</Lbl>
                <input id="category" list="category-suggestions" className={field("category")} value={f.category} onChange={set("category")} placeholder={t("Any category — or leave empty for AI to decide")} maxLength={100} />
                <datalist id="category-suggestions">
                  {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={t(c)} />)}
                </datalist>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Location" subtitle="Used for local market analysis and to find the nearest real suppliers." icon={<MapPin className="h-4 w-4" />}>
          <div className="grid gap-4 md:grid-cols-2">
            <div data-invalid={!!errors.city}>
              <Lbl k="city" htmlFor="city">{t("City")} *</Lbl>
              <input id="city" className={field("city")} value={f.city} onChange={set("city")} placeholder={t("e.g. Kanpur")} maxLength={80} />
              <Err k="city" />
            </div>
            <div>
              <Lbl k="state" htmlFor="state">{t("State")}</Lbl>
              <input id="state" className={field("state")} value={f.state} onChange={set("state")} placeholder={t("e.g. Uttar Pradesh")} maxLength={80} />
            </div>
            <div data-invalid={!!errors.country}>
              <Lbl k="country" htmlFor="country">{t("Country")} *</Lbl>
              <input id="country" className={field("country")} value={f.country} onChange={set("country")} maxLength={60} />
              <Err k="country" />
            </div>
            <div>
              <Lbl k="area" htmlFor="area">{t("Area / locality")} <span className="font-normal text-slate-400">{t("(optional, improves distances)")}</span></Lbl>
              <input id="area" className={field("area")} value={f.area} onChange={set("area")} placeholder={t("e.g. Kakadeo")} maxLength={120} />
            </div>
          </div>
        </Card>

        <Card title="Money & customers" icon={<Wallet className="h-4 w-4" />}>
          <div className="grid gap-4 md:grid-cols-2">
            <div data-invalid={!!errors.budget}>
              <Lbl k="budget" htmlFor="budget">{t("Starting Budget")} *</Lbl>
              <div className="flex gap-2">
                <select aria-label={t("Currency")} className="input w-28" value={f.currency} onChange={set("currency")}>
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <input id="budget" inputMode="decimal" className={field("budget")} value={f.budget} onChange={set("budget")} placeholder="50000" />
              </div>
              <Err k="budget" />
            </div>
            <div>
              <Lbl k="sellingPrice" htmlFor="sellingPrice">{t("Selling Price")}</Lbl>
              <input id="sellingPrice" className={field("sellingPrice")} value={f.sellingPrice} onChange={set("sellingPrice")} placeholder={t("e.g. ₹60 per pack of 50 plates")} maxLength={200} />
            </div>
            <div>
              <Lbl k="expectedCustomers" htmlFor="expectedCustomers">{t("Expected Customers")}</Lbl>
              <input id="expectedCustomers" className={field("expectedCustomers")} value={f.expectedCustomers} onChange={set("expectedCustomers")} placeholder={t("e.g. Restaurants, caterers and food vendors")} maxLength={500} />
            </div>
            <div>
              <Lbl k="targetCustomer" htmlFor="targetCustomer">{t("Target Customer")}</Lbl>
              <input id="targetCustomer" className={field("targetCustomer")} value={f.targetCustomer} onChange={set("targetCustomer")} placeholder={t("e.g. Wedding caterers within 20 km")} maxLength={500} />
            </div>
            <div className="md:col-span-2">
              <Lbl k="additionalInfo" htmlFor="additionalInfo">{t("Additional Information")}</Lbl>
              <textarea id="additionalInfo" rows={4} className={field("additionalInfo")} value={f.additionalInfo} onChange={set("additionalInfo")} placeholder={t("Your skills, space available, machines you already own, time commitment, anything else relevant…")} maxLength={2000} />
            </div>
          </div>
        </Card>

        {serverError && <ErrorBox title="AI analysis could not be started.">{serverError}</ErrorBox>}

        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            {t("Analysis usually takes 1–4 minutes. You can leave the page — results are saved.")}{" "}
            {t("The analysis will be written in {lang}.", { lang: getLang() === "hi" ? "हिंदी" : getLang() === "hinglish" ? "Hinglish" : "English" })}
          </p>
          <button type="submit" disabled={submitting} className={cx("btn-primary", SIZE.lg)} data-testid="submit-idea">
            {submitting ? <Spinner /> : <Sparkles className="h-5 w-5" />} {t("ANALYZE BUSINESS IDEA")}
          </button>
        </div>
      </form>
    </div>
  );
}
