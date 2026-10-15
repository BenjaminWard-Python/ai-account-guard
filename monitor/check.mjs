// Daily login-page check: loads each AI service's real sign-in page in Chrome with the
// extension from ../extension and reports anything that would let a personal sign-in through.
// Nothing is ever submitted: any request carrying the test address is cancelled.
//
//   npm run check                  all sites
//   npm run check -- chatgpt poe   only these
//   HEADFUL=1 npm run check        watch it run
//
// Exits 1 if a site fails, or if no site could be checked at all.
import puppeteer from "puppeteer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { SITES } from "./sites.mjs";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const EXTENSION = path.resolve(DIR, "../extension");
const OUT = path.join(DIR, "output");
const PERSONAL = "aag.monitor.test@gmail.com";
const LEAK = /aag\.monitor\.test|aag(%2E|\.)monitor/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The extension's own recognition rules (shared/providers.js), so the check can't drift from them.
createRequire(import.meta.url)(path.join(EXTENSION, "shared/providers.js"));
const G = globalThis.AIGuard;

const only = process.argv.slice(2);
const sites = only.length ? SITES.filter((s) => only.includes(s.id)) : SITES;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "aag-monitor-"));
const browser = await puppeteer.launch({
  headless: !process.env.HEADFUL,
  enableExtensions: [EXTENSION],
  userDataDir: profile,
  defaultViewport: { width: 1280, height: 900 },
  args: process.env.CI ? ["--no-sandbox"] : [],
});

const worker = await (await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"))).worker();
await worker.evaluate(() => chrome.storage.local.set({
  settings: { AllowedDomains: ["example.org"], OrganizationName: "Login check", AllowGoogleSignIn: true },
}));
await sleep(1000);
for (const p of await browser.pages()) if (p.url().includes("options.html")) await p.close();

// Text of the extension's block notice, which lives in a closed shadow root (the DevTools
// DOM tree pierces it). null if no notice is showing.
async function noticeText(page) {
  const cdp = await page.createCDPSession();
  try {
    const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
    let host = null;
    const find = (n) => {
      if (host) return;
      if (n.nodeName === "AI-ACCOUNT-GUARD") host = n;
      for (const c of [...(n.children || []), ...(n.shadowRoots || [])]) find(c);
    };
    find(root);
    if (!host) return null;
    const text = [];
    const walk = (n) => {
      if (n.nodeName === "STYLE") return;
      if (n.nodeType === 3 && n.nodeValue.trim()) text.push(n.nodeValue.trim());
      for (const c of [...(n.children || []), ...(n.shadowRoots || [])]) walk(c);
    };
    walk(host);
    return text.join(" ");
  } finally {
    await cdp.detach().catch(() => {});
  }
}

const BUTTONS = 'button, [role="button"], a[href], input[type="submit"], input[type="button"]';

function pageSnapshot(page, emailSelector) {
  return page.evaluate((sel, buttonSel) => {
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const text = (document.title + " " + (document.body ? document.body.innerText.slice(0, 400) : "")).replace(/\s+/g, " ");
    return {
      url: location.href,
      botCheck: /just a moment|security verification|verify you are human|human verification|attention required|are you a robot|403 error|request blocked|access denied/i.test(text),
      emailFields: [...document.querySelectorAll(sel)].filter(visible).length,
      textFields: [...document.querySelectorAll('input:not([type]), input[type="text"], input[type="email"]')].filter(visible).length,
      labels: [...document.querySelectorAll(buttonSel)].filter(visible)
        .map((b) => [b.getAttribute("aria-label"), b.getAttribute("title"), b.value, b.textContent].filter(Boolean).join(" ")),
    };
  }, emailSelector, BUTTONS);
}

async function clickLabel(page, source) {
  const re = new RegExp(source, "iu");
  for (const h of await page.$$(BUTTONS)) {
    const label = await h.evaluate((b) => (b.getAttribute("aria-label") || b.textContent || b.value || "").replace(/\s+/g, " ").trim());
    if (re.test(label) && (await h.isVisible())) {
      await h.click();
      return true;
    }
  }
  return false;
}

async function checkSite(site) {
  // problems: a personal sign-in could get through. changes: the page no longer matches
  // what sites.mjs expects. Both fail the run.
  const r = { id: site.id, name: site.name, status: "ok", problems: [], changes: [], notes: [] };
  const page = await browser.newPage();
  const leaks = [];
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (req.isInterceptResolutionHandled()) return;
    if (LEAK.test(req.url()) || LEAK.test(req.postData() || "")) {
      leaks.push(req.url().slice(0, 100));
      return req.abort("blockedbyclient");
    }
    req.continue();
  });

  try {
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await sleep(site.wait || 6000);
    let snap = await pageSnapshot(page, G.EMAIL_SELECTOR);

    if (site.blockedPage) {
      if (!/^chrome-extension:\/\/.*\/pages\/blocked\.html/.test(snap.url)) r.problems.push(`Site should be blocked, but it loaded ${snap.url}`);
      return r;
    }
    if (snap.botCheck) {
      r.status = "bot-check";
      r.notes.push("The site showed a bot check, so it wasn't checked today.");
      return r;
    }

    // Sign-in buttons, read before any click changes the page.
    const labels = new Set(snap.labels.map(G.normalizeLabel).filter(Boolean));
    if (site.pre) {
      if (await clickLabel(page, site.pre)) {
        await sleep(4000);
        if (site.preBlocked) {
          if (/^chrome-extension:\/\/.*\/pages\/blocked\.html/.test(page.url())) r.notes.push(`"${site.pre}" led to a sign-in provider, and it was blocked.`);
          else r.problems.push(`"${site.pre}" led to ${page.url().slice(0, 90)} and it was NOT blocked.`);
          return r;
        }
        snap = await pageSnapshot(page, G.EMAIL_SELECTOR);
        snap.labels.map(G.normalizeLabel).filter(Boolean).forEach((l) => labels.add(l));
      } else {
        r.notes.push(`No "${site.pre}" button, so the page was checked as it loaded.`);
      }
    }
    const found = new Set();
    for (const label of labels) {
      const method = G.classifySignInLabel(label);
      if (method && method.id) found.add(method.id);
      if (G.isUnrecognizedSignIn(label)) r.problems.push(`New sign-in button the extension doesn't recognize, so it isn't blocked: "${label}"`);
    }
    const missing = (site.signIns || []).filter((id) => !found.has(id));
    if (missing.length) r.changes.push(`Expected sign-in buttons not found: ${missing.join(", ")}. The sign-in page may have changed; update monitor/sites.mjs if so.`);
    r.notes.push(`Sign-in buttons recognized: ${[...found].join(", ") || "none"}.`);

    if (site.email) {
      if (!snap.emailFields) {
        r.problems.push(snap.textFields
          ? `There's a text field, but the extension doesn't recognize it as an email field (${snap.textFields} text field(s) on the page).`
          : "No email field found. The sign-in page may have changed.");
      } else {
        // Behavior: a personal address must be stopped before it's sent.
        let typed = false;
        for (const h of await page.$$(G.EMAIL_SELECTOR)) {
          if (await h.isVisible()) {
            await h.click();
            await h.type(PERSONAL, { delay: 15 });
            typed = true;
            break;
          }
        }
        await sleep(400);
        const clicked = site.submit ? await clickLabel(page, site.submit) : false;
        if (!clicked) await page.keyboard.press("Enter");
        await sleep(3000);
        const notice = await noticeText(page);
        if (!notice) r.problems.push("A personal email address was NOT blocked." + (leaks.length ? " The site tried to send it (the check cancelled the request)." : ""));
        else r.notes.push(`Personal email blocked${clicked ? "" : " (submitted with Enter)"}.`);
        if (!typed) r.notes.push("The email field disappeared before the check could type in it.");
      }
    }
  } catch (err) {
    r.status = "error";
    r.problems.push("Check didn't finish: " + err.message.split("\n")[0]);
  } finally {
    await page.screenshot({ path: path.join(OUT, `${site.id}.png`) }).catch(() => {});
    await page.close().catch(() => {});
  }
  return r;
}

const results = [];
for (const site of sites) {
  const r = await checkSite(site);
  if (r.status === "ok") r.status = r.problems.length ? "fail" : r.changes.length ? "changed" : "ok";
  results.push(r);
  console.log(`${r.status.toUpperCase().padEnd(9)} ${r.name}`);
  for (const p of r.problems) console.log(`          ✗ ${p}`);
  for (const c of r.changes) console.log(`          ~ ${c}`);
  for (const n of r.notes) console.log(`          · ${n}`);
  await sleep(3000);
}
await browser.close();
fs.rmSync(profile, { recursive: true, force: true });

const ICON = { ok: "✅", fail: "❌", changed: "🔶", error: "⚠️", "bot-check": "⏸️" };
const report = [
  `## AI Account Guard login check, ${new Date().toISOString().slice(0, 10)}`,
  "",
  "| Service | Result | Details |",
  "|---|---|---|",
  ...results.map((r) => `| ${r.name} | ${ICON[r.status]} ${r.status} | ${[...r.problems.map((p) => "**" + p + "**"), ...r.changes, ...r.notes].join("<br>").replace(/\|/g, "\\|")} |`),
  "",
  "Screenshots of each page are attached to the workflow run.",
].join("\n");
fs.writeFileSync(path.join(OUT, "report.md"), report + "\n");
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");

const failed = results.filter((r) => ["fail", "changed", "error"].includes(r.status));
const checked = results.filter((r) => r.status !== "bot-check");
if (!checked.length) console.log("\nNo site could be checked (all showed bot checks).");
process.exit(failed.length || !checked.length ? 1 : 0);
