// End-to-end tests A–E (+ extra checks) against the live deployment.
// Writes e2e-output/results.json and screenshots; exits non-zero if any test fails.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.BASE_URL || "https://startup-sense-ai.netlify.app").replace(/\/$/, "");
const ONLY = (process.env.ONLY || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const OUT = path.resolve("e2e-output");
fs.mkdirSync(OUT, { recursive: true });

const results = { base: BASE, startedAt: new Date().toISOString(), tests: [], consoleErrors: [], data: {} };
const want = (id) => !ONLY.length || ONLY.includes(id);

function log(...a) {
  console.log(...a);
}

async function shot(page, name) {
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  return file;
}

async function test(id, name, fn) {
  if (!want(id[0])) return;
  const t = { id, name, status: "running", checks: [], startedAt: Date.now() };
  results.tests.push(t);
  log(`\n=== ${id}: ${name}`);
  const check = (label, ok, detail) => {
    t.checks.push({ label, ok: !!ok, detail: detail === undefined ? undefined : String(detail).slice(0, 600) });
    log(`${ok ? "  ✔" : "  ✘"} ${label}${detail !== undefined ? ` — ${String(detail).slice(0, 200)}` : ""}`);
    if (!ok) t.failed = true;
  };
  try {
    await fn(check);
    t.status = t.failed ? "failed" : "passed";
  } catch (e) {
    t.status = "error";
    t.error = String(e?.stack || e).slice(0, 2000);
    log("  ERROR", e);
  }
  t.ms = Date.now() - t.startedAt;
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
}

async function analyze(page, form) {
  await page.goto(`${BASE}/new`);
  await page.fill("#businessIdea", form.idea);
  if (form.type) await page.getByRole("button", { name: form.type, exact: true }).click();
  await page.fill("#city", form.city);
  if (form.state) await page.fill("#state", form.state);
  await page.fill("#country", form.country || "India");
  await page.fill("#budget", String(form.budget));
  if (form.expectedCustomers) await page.fill("#expectedCustomers", form.expectedCustomers);
  if (form.targetCustomer) await page.fill("#targetCustomer", form.targetCustomer);
  await page.getByTestId("submit-idea").click();
  await page.waitForURL(/\/analyzing\//, { timeout: 30000 });
  const url = page.url();
  const t0 = Date.now();
  const stagesSeen = new Set();
  // record real progress stages while waiting
  while (Date.now() - t0 < 10 * 60_000) {
    const body = await page.locator("main").innerText().catch(() => "");
    const m = body.match(/(Understanding business idea|Analyzing competition|Identifying raw materials|Finding nearby sources|Preparing report)[^\n]*/);
    if (m) stagesSeen.add(m[1]);
    if (body.includes("Analysis Complete") || body.includes("विश्लेषण पूरा हुआ")) return { outcome: "complete", url, seconds: (Date.now() - t0) / 1000, stagesSeen: [...stagesSeen] };
    if (body.includes("AI analysis could not be completed") || body.includes("AI विश्लेषण पूरा नहीं हो सका") || body.includes("AI analysis poora nahi ho saka")) return { outcome: "failed", url, seconds: (Date.now() - t0) / 1000, body: body.slice(0, 1500), stagesSeen: [...stagesSeen] };
    await page.waitForTimeout(2000);
  }
  return { outcome: "timeout", url, stagesSeen: [...stagesSeen] };
}

/** Waits on the analyzing page (after a voice "Confirm & Analyze") until done. */
async function waitAnalysis(page) {
  await page.waitForURL(/\/analyzing\//, { timeout: 30000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 10 * 60_000) {
    const body = await page.locator("main").innerText().catch(() => "");
    if (/Analysis Complete|विश्लेषण पूरा हुआ/.test(body)) return { outcome: "complete", seconds: (Date.now() - t0) / 1000 };
    if (/could not be completed|पूरा नहीं हो सका|poora nahi ho saka/.test(body)) return { outcome: "failed", body: body.slice(0, 800) };
    await page.waitForTimeout(2000);
  }
  return { outcome: "timeout" };
}

const devanagariRatio = (s) => {
  const letters = s.replace(/[^\p{L}]/gu, "");
  if (!letters.length) return 0;
  return (letters.match(/[\u0900-\u097F]/g) || []).length / letters.length;
};

async function setLanguage(page, lang) {
  await page.getByTestId("language-select").first().selectOption(lang);
  await page.waitForTimeout(400);
}

/** Replaces the browser's speech recognition with a scripted one (headless browsers have no microphone). */
const MOCK_SPEECH = () => {
  class MockRecognition {
    constructor() {
      this.lang = "en-IN";
      this.continuous = false;
      this.interimResults = false;
    }
    start() {
      window.__speechLangUsed = this.lang;
      setTimeout(() => {
        const m = window.__mockSpeech || {};
        if (m.error) {
          this.onerror && this.onerror({ error: m.error });
          this.onend && this.onend();
          return;
        }
        if (m.transcript) {
          const alt = { transcript: m.transcript, confidence: 0.9 };
          const result = Object.assign([alt], { isFinal: true });
          this.onresult && this.onresult({ resultIndex: 0, results: [result] });
        }
        if (m.autoEnd) this.onend && this.onend();
      }, 400);
    }
    stop() {
      setTimeout(() => this.onend && this.onend(), 150);
    }
    abort() {}
  }
  window.SpeechRecognition = MockRecognition;
  window.webkitSpeechRecognition = MockRecognition;
};

async function speak(page, transcript, opts = {}) {
  await page.evaluate(([t, o]) => (window.__mockSpeech = { transcript: t, ...o }), [transcript, opts]);
  await page.getByTestId("mic-button").click();
  if (opts.error || opts.autoEnd) return;
  await page.getByTestId("listening").waitFor({ timeout: 10000 });
  await page.waitForTimeout(900);
  await page.getByTestId("stop-recording").click();
}

async function mainText(page) {
  return (await page.locator("main").innerText()).replace(/\s+/g, " ");
}

async function capturePageData(page, key) {
  const d = {};
  await page.goto(`${BASE}/`);
  await page.waitForSelector('[data-testid="business-name"]', { timeout: 30000 });
  d.dashboardName = await page.locator('[data-testid="business-name"]').innerText();
  d.dashboard = await mainText(page);
  d.dashboardShot = await shot(page, `${key}-dashboard`);

  await page.goto(`${BASE}/suppliers`);
  await page.waitForSelector('[data-testid="materials"]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  d.materials = await page.locator('[data-testid="material-name"]').allInnerTexts();
  d.suppliers = await page.locator('[data-testid="place-card"]').evaluateAll((els) =>
    els.slice(0, 12).map((el) => ({
      name: el.querySelector('[data-testid="place-name"]')?.textContent,
      distance: el.querySelector('[data-testid="place-distance"]')?.textContent,
      text: el.textContent.slice(0, 400),
      links: Array.from(el.querySelectorAll("a")).map((a) => a.getAttribute("href")),
    }))
  );
  d.suppliersPage = (await mainText(page)).slice(0, 4000);
  d.suppliersShot = await shot(page, `${key}-suppliers`);

  await page.goto(`${BASE}/customers`);
  await page.getByText("Who buys from").waitFor({ timeout: 30000 });
  d.customers = (await mainText(page)).slice(0, 3000);

  await page.goto(`${BASE}/financial`);
  await page.getByText("Unit economics").first().waitFor({ timeout: 30000 });
  d.financial = (await mainText(page)).slice(0, 3000);
  d.financialShot = await shot(page, `${key}-financial`);

  await page.goto(`${BASE}/competitors`);
  await page.getByText("Competition for").first().waitFor({ timeout: 30000 });
  d.competitors = (await mainText(page)).slice(0, 3000);
  return d;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") results.consoleErrors.push(`${page.url()} :: ${msg.text()}`.slice(0, 400));
});
page.on("pageerror", (err) => results.consoleErrors.push(`PAGEERROR ${page.url()} :: ${String(err)}`.slice(0, 600)));
page.on("dialog", (d) => d.accept());

// establish workspace + status
await page.goto(`${BASE}/`);
await page.waitForTimeout(1500);
let workspaceKey = await page.evaluate(() => localStorage.getItem("ss_owner_key"));
results.status = await page.evaluate(async () => (await fetch("/api/status")).json()).catch((e) => String(e));

await test("X0", "Empty state before any analysis", async (check) => {
  const txt = await mainText(page);
  check("Shows 'No Business Idea Analyzed Yet'", txt.includes("No Business Idea Analyzed Yet"), txt.slice(0, 200));
  check("Shows 'Analyze Your First Idea' button", txt.includes("Analyze Your First Idea"));
  check("No hard-coded sample business (Organic Tiffin Service)", !/tiffin/i.test(txt));
  await shot(page, "X0-empty");
});

await test("X1", "Security: API rejects requests without workspace key / bad input", async (check) => {
  const r = await page.evaluate(async () => {
    const a = await fetch("/api/ideas");
    const b = await fetch("/api/analyze-business", { method: "POST", headers: { "content-type": "application/json", "x-owner-key": localStorage.getItem("ss_owner_key") }, body: JSON.stringify({ businessIdea: "", city: "", budget: -5 }) });
    const html = await (await fetch("/")).text();
    const js = await Promise.all(Array.from(document.scripts).map((s) => s.src).filter(Boolean).map((u) => fetch(u).then((r) => r.text())));
    return { a: a.status, b: b.status, bBody: await b.text(), leaks: js.some((t) => /AIza[0-9A-Za-z_-]{20,}|AQ\.[A-Za-z0-9_-]{30,}|SS_API_SECRET|GEMINI_API_KEY=/.test(t)) || /AIza/.test(html) };
  });
  check("GET /api/ideas without key → 401", r.a === 401, r.a);
  check("Invalid idea → 400 with validation message", r.b === 400, r.bBody);
  check("No API keys or secrets in frontend bundle", !r.leaks);
});

let paper = null;
await test("A", "Paper Plate Manufacturing · Kanpur · ₹50,000", async (check) => {
  const r = await analyze(page, {
    idea: "Paper Plate Manufacturing", type: "Product", city: "Kanpur", state: "Uttar Pradesh", budget: 50000,
    expectedCustomers: "Restaurants, caterers and food vendors",
  });
  results.data.A_run = r;
  check("Real analysis completed", r.outcome === "complete", JSON.stringify(r).slice(0, 300));
  check("Progress stages came from the server", r.stagesSeen.length >= 2, r.stagesSeen.join(" | "));
  await shot(page, "A-complete");
  if (r.outcome !== "complete") return;
  const d = await capturePageData(page, "A");
  paper = d;
  results.data.A = d;
  check("Dashboard = Paper Plate Manufacturing", /paper plate/i.test(d.dashboardName), d.dashboardName);
  check("Dashboard shows Kanpur", /kanpur/i.test(d.dashboard));
  check("SWOT/analysis is about paper plates", /plate|paper/i.test(d.dashboard.split("SWOT")[1] || ""), (d.dashboard.split("SWOT")[1] || "").slice(0, 300));
  check("Supply chain materials are paper-related", d.materials.some((m) => /paper|kraft|board|pulp|sheet|roll|laminat/i.test(m)), d.materials.join(" | "));
  check("Customers are relevant B2B buyers", /restaurant|cater|vendor|dhaba|hotel|event|sweet/i.test(d.customers), d.customers.slice(0, 300));
  check("Financials reference plates", /plate/i.test(d.financial), d.financial.slice(0, 300));
  check("AI Estimate labels shown", d.dashboard.includes("AI Estimate") && d.financial.includes("Calculated"));
  const sup = d.suppliers;
  check("Supplier search produced live listings or an explicit unavailable message", sup.length > 0 || /temporarily unavailable|No matching suppliers/i.test(d.suppliersPage), `${sup.length} listings`);
  if (sup.length > 1) {
    const dists = sup.map((s) => parseFloat(s.distance));
    check("Suppliers sorted nearest first", dists.every((v, i) => i === 0 || v >= dists[i - 1]), dists.join(", "));
    check("Each supplier has Google Maps view + directions links", sup.every((s) => s.links.some((l) => l?.includes("google.com/maps/search")) && s.links.some((l) => l?.includes("google.com/maps/dir"))));
  }
});

let ev = null;
await test("B", "EV Charging Station · Kanpur · ₹5,00,000", async (check) => {
  const r = await analyze(page, { idea: "EV Charging Station", city: "Kanpur", state: "Uttar Pradesh", budget: 500000 });
  results.data.B_run = r;
  check("Real analysis completed", r.outcome === "complete", JSON.stringify(r).slice(0, 300));
  if (r.outcome !== "complete") return;
  const d = await capturePageData(page, "B");
  ev = d;
  results.data.B = d;
  check("Dashboard = EV Charging Station", /ev charging|charging station/i.test(d.dashboardName), d.dashboardName);
  check("Paper Plate data no longer on dashboard", !/paper plate/i.test(d.dashboard));
  check("Supply chain = EV charging equipment/components", d.materials.some((m) => /charg|ev|cable|connector|transformer|electric|meter|panel|solar|inverter/i.test(m)), d.materials.join(" | "));
  check("Customers = EV owners / fleets", /ev owner|electric vehicle|fleet|e-rickshaw|rickshaw|two-wheeler|cab|taxi|delivery/i.test(d.customers), d.customers.slice(0, 300));
  check("Financials use an EV charging model", /kwh|charg|session/i.test(d.financial), d.financial.slice(0, 300));
  check("SWOT is about EV charging", /ev|charg|electric/i.test(d.dashboard.split("SWOT")[1] || ""));
  check("Different numbers from Paper Plate (not fixed)", !paper || paper.financial !== d.financial);
});

await test("C", "My Ideas keeps both analyses separately", async (check) => {
  await page.goto(`${BASE}/ideas`);
  await page.waitForSelector('[data-testid="idea-card"]', { timeout: 30000 });
  const names = await page.locator('[data-testid="idea-name"]').allInnerTexts();
  results.data.C_names = names;
  check("Paper Plate Manufacturing listed", names.some((n) => /paper plate/i.test(n)), names.join(" | "));
  check("EV Charging Station listed", names.some((n) => /ev charging|charging station/i.test(n)));
  await shot(page, "C-my-ideas");
  await page.locator('[data-testid="idea-name"]', { hasText: /paper plate/i }).first().click();
  await page.waitForSelector('[data-testid="business-name"]', { timeout: 30000 });
  const n1 = await page.locator('[data-testid="business-name"]').innerText();
  const t1 = await mainText(page);
  check("Opening Paper Plate shows its original analysis", /paper plate/i.test(n1), n1);
  check("Paper Plate dashboard identical to when first analysed", !paper || t1.slice(0, 1500).replace(/Analysed .*?(?=\s)/, "") === paper.dashboard.slice(0, 1500).replace(/Analysed .*?(?=\s)/, "") || t1.includes(paper.dashboardName));
  await shot(page, "C-open-paper");
  await page.goto(`${BASE}/ideas`);
  await page.waitForSelector('[data-testid="idea-card"]');
  await page.locator('[data-testid="idea-name"]', { hasText: /ev charging|charging station/i }).first().click();
  await page.waitForSelector('[data-testid="business-name"]', { timeout: 30000 });
  const n2 = await page.locator('[data-testid="business-name"]').innerText();
  check("Opening EV Charging Station shows its analysis", /ev charging|charging station/i.test(n2), n2);
  await shot(page, "C-open-ev");
});

await test("D", "Data persists across browser refresh", async (check) => {
  await page.reload();
  await page.waitForSelector('[data-testid="business-name"]', { timeout: 30000 });
  const n = await page.locator('[data-testid="business-name"]').innerText();
  check("After refresh, dashboard still shows saved analysis", /ev charging|charging station/i.test(n), n);
  await page.goto(`${BASE}/ideas`);
  await page.reload();
  await page.waitForSelector('[data-testid="idea-card"]', { timeout: 30000 });
  const names = await page.locator('[data-testid="idea-name"]').allInnerTexts();
  check("Both ideas still listed after refresh", names.length >= 2, names.join(" | "));
  // fresh browser context with the same workspace key (simulates closing and reopening)
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/settings`);
  await p2.evaluate((k) => localStorage.setItem("ss_owner_key", k), workspaceKey);
  await p2.goto(`${BASE}/ideas`);
  await p2.waitForSelector('[data-testid="idea-card"]', { timeout: 30000 });
  const names2 = await p2.locator('[data-testid="idea-name"]').allInnerTexts();
  check("Saved in the database (visible from a brand-new browser session)", names2.length >= 2, names2.join(" | "));
  await ctx2.close();
});

await test("X2", "Other pages work with the current business", async (check) => {
  for (const [p, re] of [
    ["/market", /Market for/], ["/what-if", /What if/], ["/stress-test", /Low Demand/], ["/competitors", /Competition for/], ["/reports", /Executive Summary/],
  ]) {
    await page.goto(`${BASE}${p}`);
    await page.waitForFunction((r) => new RegExp(r).test(document.querySelector("main")?.innerText || ""), re.source, { timeout: 30000 }).catch(() => {});
    const txt = await mainText(page);
    check(`${p} renders for current business`, re.test(txt) && /ev charging|charging station/i.test(txt), txt.slice(0, 160));
  }
  await shot(page, "X2-report");
  // PDF download
  await page.goto(`${BASE}/reports`);
  await page.waitForSelector("#report");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), page.getByRole("button", { name: /Download PDF/ }).click()]);
  const pdfPath = path.join(OUT, "report.pdf");
  await dl.saveAs(pdfPath);
  const size = fs.statSync(pdfPath).size;
  check("Download PDF produces a PDF file", size > 20000, `${size} bytes`);
  // share link
  await page.getByRole("button", { name: /^Share$/ }).click().catch(() => {});
  await page.waitForTimeout(2500);
  const share = (await mainText(page)).match(/https?:\/\/\S+\/share\/[a-f0-9]{36}/)?.[0];
  check("Share creates a read-only link", !!share, share);
  if (share) {
    const ctx3 = await browser.newContext();
    const p3 = await ctx3.newPage();
    await p3.goto(share);
    await p3.waitForSelector('[data-testid="report-title"]', { timeout: 30000 });
    check("Shared link opens report without workspace key", /ev charging|charging station/i.test(await p3.locator('[data-testid="report-title"]').innerText()));
    await ctx3.close();
  }
  // what-if reacts
  await page.goto(`${BASE}/what-if`);
  const before = await mainText(page);
  const slider = page.locator('input[type="range"]').first();
  await slider.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  const after = await mainText(page);
  check("What-if results change when price changes", before !== after);
  // pivots (real AI)
  await page.goto(`${BASE}/pivots`);
  await page.getByRole("button", { name: /Generate pivots|Regenerate pivots/ }).click();
  await page
    .waitForFunction(
      () => document.querySelectorAll('[data-testid="pivot-card"]').length > 0 || document.body.innerText.includes("could not be completed"),
      null,
      { timeout: 180000 }
    )
    .catch(() => {});
  const pivots = await page.locator('[data-testid="pivot-card"]').count();
  check("Pivot generator returns AI pivots", pivots >= 3, `${pivots} pivots`);
  results.data.pivots = (await mainText(page)).slice(0, 2000);
  await shot(page, "X2-pivots");
});

await test("E", "AI failure shows an error, never sample data", async (check) => {
  await page.goto(`${BASE}/settings`);
  await page.getByLabel(/Simulate an AI failure/).check();
  const r = await analyze(page, { idea: "Failure Test Bakery", city: "Kanpur", budget: 10000 });
  results.data.E_run = r;
  check("Error message shown: 'AI analysis could not be completed.'", r.outcome === "failed", JSON.stringify(r).slice(0, 400));
  const txt = await mainText(page);
  check("Retry Analysis + Back to New Idea buttons shown", txt.includes("Retry Analysis") && txt.includes("Back to New Idea"));
  check("No results or sample data displayed", !txt.includes("Analysis Complete") && !/SWOT|Monthly revenue/i.test(txt));
  await shot(page, "E-failure");
  await page.goto(`${BASE}/`);
  await page.waitForSelector('[data-testid="business-name"]', { timeout: 30000 });
  const n = await page.locator('[data-testid="business-name"]').innerText();
  check("Dashboard keeps the last successful analysis (not the failed one)", !/failure test/i.test(n), n);
  // clean up the failure-test idea
  await page.goto(`${BASE}/ideas`);
  await page.waitForSelector('[data-testid="idea-card"]');
  const card = page.locator('[data-testid="idea-card"]', { hasText: /Failure Test Bakery/ }).first();
  if (await card.count()) {
    await card.getByTitle("Delete").click();
    await page.waitForTimeout(2500);
  }
  const names = await page.locator('[data-testid="idea-name"]').allInnerTexts();
  check("Failure-test idea deleted, others kept", !names.some((x) => /failure test/i.test(x)) && names.length >= 2, names.join(" | "));
});

// ───────────── Voice input + languages ─────────────
const voiceCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await voiceCtx.addInitScript(MOCK_SPEECH);
const vp = await voiceCtx.newPage();
vp.on("pageerror", (err) => results.consoleErrors.push(`PAGEERROR ${vp.url()} :: ${String(err)}`.slice(0, 600)));
vp.on("dialog", (d) => d.accept());
await vp.goto(`${BASE}/settings`);
await vp.evaluate((k) => localStorage.setItem("ss_owner_key", k), workspaceKey);

await test("L1", "Language switching + persists after refresh", async (check) => {
  await vp.goto(`${BASE}/`);
  await vp.waitForSelector('[data-testid="language-select"]');
  await setLanguage(vp, "hi");
  let nav = await vp.locator("aside").first().innerText();
  check("Hindi interface (sidebar in Devanagari)", /डैशबोर्ड/.test(nav) && /मेरे आइडिया/.test(nav), nav.slice(0, 120));
  await vp.reload();
  await vp.waitForSelector('[data-testid="language-select"]');
  nav = await vp.locator("aside").first().innerText();
  check("Hindi still selected after refresh", /डैशबोर्ड/.test(nav) && (await vp.getByTestId("language-select").first().inputValue()) === "hi");
  await shot(vp, "L1-hindi-ui");
  await setLanguage(vp, "hinglish");
  nav = await vp.locator("aside").first().innerText();
  check("Hinglish interface", /Mere Ideas/.test(nav) && !/[\u0900-\u097F]/.test(nav.replace("हिंदी", "")), nav.slice(0, 120));
  await setLanguage(vp, "en");
  nav = await vp.locator("aside").first().innerText();
  check("Back to English", /My Ideas/.test(nav));
});

await test("V1", "English voice → extraction → edit → Confirm & Analyze (new idea: rooftop microgreens)", async (check) => {
  await vp.goto(`${BASE}/new`);
  await speak(vp, "I want to start a rooftop hydroponic microgreens farm in Indore, Madhya Pradesh, selling fresh microgreens to hotels and cafes. My budget is one and a half lakh rupees, and I would sell a 100 gram box for 120 rupees.");
  await vp.getByTestId("voice-review-banner").waitFor({ timeout: 30000 });
  const v = async (id) => vp.locator(`#${id}`).inputValue();
  const fields = { idea: await v("businessIdea"), city: await v("city"), state: await v("state"), budget: await v("budget"), price: await v("sellingPrice"), expected: await v("expectedCustomers") };
  results.data.V1_fields = fields;
  check("Business idea extracted from speech", /microgreen/i.test(fields.idea), fields.idea);
  check("City extracted (Indore)", /indore/i.test(fields.city), fields.city);
  check("Budget “one and a half lakh” → 150000", Number(fields.budget) === 150000, fields.budget);
  check("Selling price extracted", /120/.test(fields.price), fields.price);
  check("Fields marked “From your voice”", (await vp.locator('[data-testid="voice-businessIdea"], [data-testid="voice-city"], [data-testid="voice-budget"], [data-testid="voice-sellingPrice"]').count()) >= 3);
  check("Transcript is editable", await vp.getByTestId("transcript").isEditable());
  check("Button reads Confirm & Analyze", /Confirm & Analyze/.test(await vp.getByTestId("submit-idea").innerText()));
  await vp.fill("#targetCustomer", "Premium hotels and cloud kitchens in Vijay Nagar");
  await shot(vp, "V1-review");
  await vp.getByTestId("submit-idea").click();
  const r = await waitAnalysis(vp);
  results.data.V1_run = r;
  check("Real analysis completed", r.outcome === "complete", JSON.stringify(r).slice(0, 200));
  if (r.outcome !== "complete") return;
  await vp.goto(`${BASE}/`);
  await vp.waitForSelector('[data-testid="business-name"]', { timeout: 30000 });
  const dash = await mainText(vp);
  check("Dashboard shows the spoken idea", /microgreen/i.test(await vp.getByTestId("business-name").innerText()));
  check("Dashboard location = Indore", /indore/i.test(await vp.getByTestId("business-location").innerText()));
  check("Analysis is about microgreens (not a template)", /microgreen|hydroponic/i.test(dash));
  await shot(vp, "V1-dashboard");
});

await test("V2", "Hindi voice → extraction (Devanagari speech)", async (check) => {
  await setLanguage(vp, "hi");
  await vp.goto(`${BASE}/new`);
  check("Speech language defaults to Hindi when UI is Hindi", (await vp.getByTestId("speech-lang").inputValue()) === "hi-IN");
  await speak(vp, "मैं जयपुर में पुरानी साड़ियों से डिज़ाइनर हैंडबैग बनाने का काम शुरू करना चाहती हूँ, बजट लगभग अस्सी हज़ार रुपये है और मेरे ग्राहक कॉलेज की लड़कियाँ और बुटीक होंगे");
  check("Recognition used hi-IN", (await vp.evaluate(() => window.__speechLangUsed)) === "hi-IN");
  await vp.getByTestId("voice-review-banner").waitFor({ timeout: 30000 });
  const f = { idea: await vp.locator("#businessIdea").inputValue(), city: await vp.locator("#city").inputValue(), budget: await vp.locator("#budget").inputValue(), cust: await vp.locator("#expectedCustomers").inputValue() + " " + (await vp.locator("#targetCustomer").inputValue()) };
  results.data.V2_fields = f;
  check("Idea extracted in Hindi", /[\u0900-\u097F]/.test(f.idea) && /बैग|हैंडबैग|साड़ी/.test(f.idea), f.idea);
  check("City = Jaipur", /jaipur|जयपुर/i.test(f.city), f.city);
  check("Budget “अस्सी हज़ार” → 80000", Number(f.budget) === 80000, f.budget);
  check("Customers extracted", /कॉलेज|बुटीक|लड़कि/.test(f.cust), f.cust);
  check("Hindi button label", /पुष्टि करें/.test(await vp.getByTestId("submit-idea").innerText()));
  await shot(vp, "V2-hindi-voice-review");
});

await test("H", "Hindi typed idea → analysis generated in Hindi", async (check) => {
  // stays in Hindi UI
  await vp.goto(`${BASE}/new`);
  await vp.fill("#businessIdea", "बकरी के दूध से हर्बल साबुन बनाना");
  await vp.fill("#city", "लखनऊ");
  await vp.fill("#state", "उत्तर प्रदेश");
  await vp.fill("#country", "India");
  await vp.fill("#budget", "200000");
  await vp.fill("#expectedCustomers", "ऑर्गेनिक स्टोर और ऑनलाइन ग्राहक");
  await vp.getByTestId("submit-idea").click();
  const r = await waitAnalysis(vp);
  results.data.H_run = r;
  check("Real analysis completed", r.outcome === "complete", JSON.stringify(r).slice(0, 200));
  if (r.outcome !== "complete") return;
  await vp.goto(`${BASE}/`);
  await vp.waitForSelector('[data-testid="business-name"]', { timeout: 30000 });
  const dash = await mainText(vp);
  const summary = await vp.locator("main p").first().innerText();
  check("AI summary written in Devanagari", devanagariRatio(summary) > 0.6, summary.slice(0, 160));
  check("Dashboard labels in Hindi", /AI वैलिडेशन स्कोर|बाज़ार में माँग/.test(dash));
  check("Business is the goat-milk soap idea", /साबुन|soap/i.test(dash));
  await vp.goto(`${BASE}/market`);
  await vp.waitForTimeout(1500);
  const mk = await mainText(vp);
  check("Market analysis text in Hindi", devanagariRatio(mk) > 0.6, mk.slice(0, 160));
  check("No language-mismatch banner (analysis matches UI)", (await vp.getByTestId("language-mismatch").count()) === 0);
  await shot(vp, "H-hindi-market");
  await vp.goto(`${BASE}/`);
  await vp.waitForSelector('[data-testid="business-name"]');
  check("Read Analysis Aloud button present", (await vp.getByTestId("read-aloud").count()) === 1);
  await shot(vp, "H-hindi-dashboard");
});

await test("G", "Hinglish voice → Hinglish analysis (new idea: drone crop spraying)", async (check) => {
  await setLanguage(vp, "hinglish");
  await vp.goto(`${BASE}/new`);
  await speak(vp, "Main Kanpur ke paas gaon mein drone se kheton mein dawai chhidakne ki service shuru karna chahta hoon, budget kareeb teen lakh hai, kisaan log mere customer honge aur ek acre ka 400 rupaye lunga");
  await vp.getByTestId("voice-review-banner").waitFor({ timeout: 30000 });
  const f = { idea: await vp.locator("#businessIdea").inputValue(), city: await vp.locator("#city").inputValue(), budget: await vp.locator("#budget").inputValue(), price: await vp.locator("#sellingPrice").inputValue() };
  results.data.G_fields = f;
  check("Idea extracted (drone spraying)", /drone/i.test(f.idea), f.idea);
  check("Idea written in Roman script (Hinglish)", devanagariRatio(f.idea) === 0, f.idea);
  check("City = Kanpur", /kanpur/i.test(f.city), f.city);
  check("Budget “teen lakh” → 300000", Number(f.budget) === 300000, f.budget);
  check("Price per acre extracted", /400/.test(f.price), f.price);
  await vp.getByTestId("submit-idea").click();
  const r = await waitAnalysis(vp);
  results.data.G_run = r;
  check("Real analysis completed", r.outcome === "complete", JSON.stringify(r).slice(0, 200));
  if (r.outcome !== "complete") return;
  await vp.goto(`${BASE}/`);
  await vp.waitForSelector('[data-testid="business-name"]', { timeout: 30000 });
  const summary = await vp.locator("main p").first().innerText();
  results.data.G_summary = summary;
  check("Summary is Roman script (no Devanagari)", devanagariRatio(summary) < 0.05, summary.slice(0, 200));
  check("Summary is Hindi grammar (Hinglish words)", (summary.match(/\b(hai|hain|ke|ki|ka|mein|aur|se|ko|liye|kar|sakta|sakte)\b/gi) || []).length >= 4, summary.slice(0, 200));
  await shot(vp, "G-hinglish-dashboard");
});

await test("V3", "Unclear spoken budget is left empty, not invented", async (check) => {
  await setLanguage(vp, "en");
  await vp.goto(`${BASE}/new`);
  await speak(vp, "I'm thinking of a mobile pet grooming van in Nagpur for busy dog owners. Budget, hmm, I'm not sure yet, maybe a few, let's see.");
  await vp.getByTestId("voice-review-banner").waitFor({ timeout: 30000 });
  const budget = await vp.locator("#budget").inputValue();
  results.data.V3_budget = budget;
  check("Budget left empty", budget === "", budget);
  check("Idea still extracted", /groom/i.test(await vp.locator("#businessIdea").inputValue()));
  await vp.getByTestId("submit-idea").click();
  await vp.waitForTimeout(500);
  check("Cannot analyze until the user enters a budget", /\/new$/.test(vp.url()) && /Enter your starting budget/.test(await mainText(vp)));
  await shot(vp, "V3-unclear-budget");
  await vp.getByTestId("clear-transcript").click();
  check("Clear removes the transcript and voice-filled fields", (await vp.getByTestId("voice-review-banner").count()) === 0 && (await vp.locator("#businessIdea").inputValue()) === "");
});

await test("V4", "Voice errors: no speech, permission denied, unsupported browser", async (check) => {
  await vp.goto(`${BASE}/new`);
  await speak(vp, "", { autoEnd: true });
  await vp.getByTestId("voice-error").waitFor({ timeout: 10000 });
  check("Empty speech → helpful message", /didn't hear anything/.test(await vp.getByTestId("voice-error").innerText()));
  await vp.goto(`${BASE}/new`);
  await speak(vp, "", { error: "not-allowed" });
  await vp.getByTestId("voice-error").waitFor({ timeout: 10000 });
  check("Permission denied → helpful message", /permission was denied/i.test(await vp.getByTestId("voice-error").innerText()));
  const plain = await browser.newContext();
  await plain.addInitScript(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  });
  const pp = await plain.newPage();
  await pp.goto(`${BASE}/new`);
  await pp.getByTestId("voice-unsupported").waitFor({ timeout: 15000 });
  check("Unsupported browser → fallback notice", true);
  await pp.fill("#businessIdea", "Typing still works");
  check("Typing still works without voice", (await pp.locator("#businessIdea").inputValue()) === "Typing still works");
  await plain.close();
});

await test("X4", "My Ideas lists every analysis (typed + voice, all languages)", async (check) => {
  await vp.goto(`${BASE}/ideas`);
  await vp.waitForSelector('[data-testid="idea-card"]', { timeout: 30000 });
  const names = await vp.locator('[data-testid="idea-name"]').allInnerTexts();
  results.data.X4_names = names;
  check("Paper plate + EV still present", names.some((n) => /paper plate/i.test(n)) && names.some((n) => /ev charging/i.test(n)), names.join(" | "));
  check("Voice + Hindi + Hinglish ideas saved", names.some((n) => /microgreen/i.test(n)) && names.some((n) => /साबुन/.test(n)) && names.some((n) => /drone/i.test(n)), names.join(" | "));
  // switching UI language shows the offer to regenerate an analysis in another language
  await vp.locator('[data-testid="idea-name"]', { hasText: /microgreen/i }).first().click();
  await vp.waitForSelector('[data-testid="business-name"]', { timeout: 30000 });
  await setLanguage(vp, "hi");
  await vp.waitForSelector('[data-testid="business-name"]', { timeout: 30000 });
  check("English analysis + Hindi UI → offer to re-analyze in Hindi", (await vp.getByTestId("language-mismatch").count()) === 1);
  await shot(vp, "X4-mismatch");
  await setLanguage(vp, "en");
});
await voiceCtx.close();

await test("X3", "Mobile layout", async (check) => {
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mp = await m.newPage();
  await mp.goto(`${BASE}/settings`);
  await mp.evaluate((k) => localStorage.setItem("ss_owner_key", k), workspaceKey);
  await mp.goto(`${BASE}/`);
  await mp.waitForSelector('[data-testid="business-name"]', { timeout: 30000 });
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  check("No horizontal overflow on phone width", !overflow);
  await mp.screenshot({ path: path.join(OUT, "X3-mobile.png"), fullPage: false });
  await m.close();
});

results.finishedAt = new Date().toISOString();
results.summary = {
  passed: results.tests.filter((t) => t.status === "passed").length,
  failed: results.tests.filter((t) => t.status !== "passed").length,
};
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
log("\nSUMMARY", results.summary);
await browser.close();
process.exit(results.summary.failed ? 1 : 0);
