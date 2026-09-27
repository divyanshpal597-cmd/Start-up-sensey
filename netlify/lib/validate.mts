import { HttpError } from "./http.mts";

export const CURRENCIES: Record<string, { symbol: string; locale: string }> = {
  INR: { symbol: "₹", locale: "en-IN" },
  USD: { symbol: "$", locale: "en-US" },
  EUR: { symbol: "€", locale: "de-DE" },
  GBP: { symbol: "£", locale: "en-GB" },
  AED: { symbol: "AED ", locale: "en-AE" },
  SGD: { symbol: "S$", locale: "en-SG" },
  AUD: { symbol: "A$", locale: "en-AU" },
  CAD: { symbol: "C$", locale: "en-CA" },
  NPR: { symbol: "Rs ", locale: "en-NP" },
  BDT: { symbol: "৳", locale: "en-BD" },
  PKR: { symbol: "Rs ", locale: "en-PK" },
  LKR: { symbol: "Rs ", locale: "en-LK" },
};

export const LANGUAGES = ["en", "hi", "hinglish"] as const;
export type Lang = (typeof LANGUAGES)[number];
export function cleanLanguage(v: unknown): Lang {
  return (LANGUAGES as readonly string[]).includes(String(v)) ? (String(v) as Lang) : "en";
}

export const BUSINESS_TYPES = ["Product", "Service", "Let AI decide"] as const;

export interface IdeaInput {
  businessIdea: string;
  businessName: string;
  businessType: (typeof BUSINESS_TYPES)[number];
  area: string;
  city: string;
  state: string;
  country: string;
  location: string;
  budget: number;
  currency: string;
  expectedCustomers: string;
  targetCustomer: string;
  sellingPrice: string;
  category: string;
  additionalInfo: string;
  language: Lang;
  simulateFailure?: boolean;
}

function clean(v: unknown, max: number): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string" && typeof v !== "number") throw new HttpError(400, "invalid_input", "Invalid field type.");
  // strip control characters (keep newlines/tabs) and collapse whitespace runs
  const s = String(v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  return s.slice(0, max);
}

function required(name: string, label: string, v: string, min: number) {
  if (v.length < min) {
    throw new HttpError(400, "invalid_input", `${label} is required${min > 1 ? ` (at least ${min} characters)` : ""}.`);
  }
}

export function validateIdea(body: any): IdeaInput {
  if (!body || typeof body !== "object") throw new HttpError(400, "invalid_input", "Invalid request.");
  const businessIdea = clean(body.businessIdea, 300);
  required("businessIdea", "Business idea", businessIdea, 3);

  const businessTypeRaw = clean(body.businessType, 20) || "Let AI decide";
  if (!(BUSINESS_TYPES as readonly string[]).includes(businessTypeRaw)) {
    throw new HttpError(400, "invalid_input", "Business type must be Product, Service or Let AI decide.");
  }

  const city = clean(body.city, 80);
  required("city", "City", city, 2);
  const state = clean(body.state, 80);
  const country = clean(body.country, 60) || "India";
  required("country", "Country", country, 2);
  const area = clean(body.area, 120);

  const budgetNum = typeof body.budget === "number" ? body.budget : Number(String(body.budget ?? "").replace(/[,\s₹$€£]/g, ""));
  if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
    throw new HttpError(400, "invalid_input", "Starting budget must be a positive number.");
  }
  if (budgetNum > 1e11) throw new HttpError(400, "invalid_input", "Starting budget is unrealistically large.");

  const currency = clean(body.currency, 3).toUpperCase() || "INR";
  if (!CURRENCIES[currency]) throw new HttpError(400, "invalid_input", "Unsupported currency.");

  const location = [area, city, state, country].filter(Boolean).join(", ");

  return {
    businessIdea,
    businessName: businessIdea.length > 80 ? businessIdea.slice(0, 77) + "…" : businessIdea,
    businessType: businessTypeRaw as IdeaInput["businessType"],
    area,
    city,
    state,
    country,
    location,
    budget: Math.round(budgetNum * 100) / 100,
    currency,
    expectedCustomers: clean(body.expectedCustomers, 500),
    targetCustomer: clean(body.targetCustomer, 500),
    sellingPrice: clean(body.sellingPrice, 200),
    category: clean(body.category, 100),
    additionalInfo: clean(body.additionalInfo, 2000),
    language: cleanLanguage(body.language),
    simulateFailure: body.simulateFailure === true,
  };
}
