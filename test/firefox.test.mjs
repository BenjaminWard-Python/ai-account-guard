// Firefox build tests. No dependencies: `node --test test/firefox.test.mjs` (Node 18+).
//
// Covers what the in-browser pages in this folder can't: the generated Firefox manifest, and the
// shared scripts running as Firefox would load them (no importScripts, moz-extension:// URLs).
// It does not run a real Firefox; load dist/firefox as a temporary add-on for that.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const readJson = (p) => JSON.parse(read(p));

execFileSync("sh", [path.join(ROOT, "scripts/package-firefox.sh")], { cwd: ROOT, stdio: "pipe" });
const chromeManifest = readJson("extension/manifest.json");
const ff = readJson("dist/firefox/manifest.json");
const zipFiles = execFileSync("unzip", ["-Z1", `dist/ai-account-guard-firefox-${ff.version}.zip`], { cwd: ROOT })
  .toString().split("\n").filter(Boolean);

// ---- manifest -------------------------------------------------------------------------------

test("manifest: Firefox background uses scripts, not a service worker", () => {
  assert.equal(ff.background.service_worker, undefined);
  assert.equal(ff.background.scripts.at(-1), "background.js");
});

test("manifest: no Chrome-only keys", () => {
  assert.equal(ff.minimum_chrome_version, undefined);
  assert.equal(ff.storage, undefined);
});

test("manifest: extension ID is valid for Firefox and pinned", () => {
  const gecko = ff.browser_specific_settings.gecko;
  // Firefox accepts a GUID in braces or name@domain. A bare name is rejected.
  assert.match(gecko.id, /^(\{[0-9a-f-]{36}\}|[a-z0-9._-]+@[a-z0-9.-]+)$/i);
  // The ID can never change after release; changing it here must be deliberate.
  assert.equal(gecko.id, "ai-account-guard@stratitsolutions.com");
});

test("manifest: data collection declaration needs Firefox 140+", () => {
  const gecko = ff.browser_specific_settings.gecko;
  assert.ok(gecko.data_collection_permissions);
  assert.ok(parseFloat(gecko.strict_min_version) >= 140);
});

test("manifest: everything else matches the Chrome manifest", () => {
  const strip = (m) => {
    const c = structuredClone(m);
    for (const k of ["background", "browser_specific_settings", "minimum_chrome_version", "storage"]) delete c[k];
    return c;
  };
  assert.deepEqual(strip(ff), strip(chromeManifest));
});

test("manifest: the Firefox background loads the same scripts the Chrome worker imports", () => {
  const imported = read("extension/background.js").match(/importScripts\(([^)]*)\)/)[1]
    .match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
  assert.deepEqual(ff.background.scripts.slice(0, -1), imported);
});

test("package: every file the manifest references is in the zip", () => {
  const refs = [
    ...ff.background.scripts,
    ...ff.content_scripts.flatMap((c) => c.js),
    ff.options_ui.page,
    ...Object.values(ff.icons),
    ...Object.values(ff.action.default_icon),
    ...ff.web_accessible_resources.flatMap((r) => r.resources),
  ];
  for (const f of new Set(refs)) assert.ok(zipFiles.includes(f), `${f} missing from zip`);
  assert.ok(!zipFiles.some((f) => f.endsWith(".DS_Store")));
  assert.ok(zipFiles.includes("manifest.json"));
});

test("package: the Chrome sources are not modified by the Firefox build", () => {
  assert.ok(chromeManifest.background.service_worker);
  assert.equal(chromeManifest.browser_specific_settings, undefined);
});

// ---- shared scripts as Firefox loads them ---------------------------------------------------

function sandbox({ firefox, managed = {}, userAgent } = {}) {
  const calls = { removed: [], dynamicRules: [], sessionRules: [], listeners: {} };
  const listener = (name) => ({ addListener: (fn) => ((calls.listeners[name] ||= []).push(fn), undefined) });
  const store = (initial = {}) => {
    const data = { ...initial };
    return {
      get: async (k) => (k == null ? { ...data } : typeof k === "string" ? (k in data ? { [k]: data[k] } : {}) : {}),
      set: async (o) => void Object.assign(data, o),
    };
  };
  const ctx = {
    console, URL, URLSearchParams, TextEncoder, TextDecoder, crypto, setTimeout, clearTimeout, structuredClone,
    navigator: { userAgent: userAgent || (firefox ? "Mozilla/5.0 Firefox/142.0" : "Mozilla/5.0 Chrome/131.0") },
    fetch: async () => ({ status: 404, headers: new Headers() }),
    chrome: {
      runtime: {
        id: "test", getURL: (p) => `${firefox ? "moz-extension" : "chrome-extension"}://abc/${p}`,
        getManifest: () => ff, openOptionsPage() {}, onStartup: listener("onStartup"),
        onInstalled: listener("onInstalled"), onMessage: listener("onMessage"),
      },
      storage: {
        session: store(), local: store(), managed: { get: async () => managed },
        onChanged: listener("storage.onChanged"),
      },
      declarativeNetRequest: {
        getDynamicRules: async () => [], getSessionRules: async () => [],
        updateDynamicRules: async (u) => void calls.dynamicRules.push(u),
        updateSessionRules: async (u) => void calls.sessionRules.push(u),
      },
      webNavigation: { onCommitted: listener("nav"), onCreatedNavigationTarget: listener("navTarget") },
      tabs: { onRemoved: listener("tabsRemoved"), onReplaced: listener("tabsReplaced") },
      action: { onClicked: listener("action") },
      alarms: { create() {}, get: async () => null, onAlarm: listener("alarm") },
      browsingData: { remove: async (...args) => void calls.removed.push(args) },
      management: { getSelf: async () => ({ installType: "admin" }) },
    },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  return { ctx, calls };
}

function load(ctx, files) {
  for (const f of files) vm.runInContext(read(`extension/${f}`), ctx, { filename: f });
  return ctx.AIGuard;
}

const SHARED = ["shared/providers.js", "shared/config.js", "shared/dashboard.js", "shared/rules.js"];
const CONFIG = { AllowedDomains: ["example.org"], AllowMicrosoftSignIn: true, MicrosoftTenantId: "tenant" };

test("detection: moz-extension:// is Firefox, chrome-extension:// is not", () => {
  assert.equal(load(sandbox({ firefox: true }).ctx, SHARED).isFirefox, true);
  assert.equal(load(sandbox({ firefox: false }).ctx, SHARED).isFirefox, false);
});

test("detection: plain page without chrome.* (unit.html) is not Firefox", () => {
  const { ctx } = sandbox({ firefox: false });
  delete ctx.chrome;
  assert.equal(load(ctx, SHARED).isFirefox, false);
});

for (const [name, firefox] of [["Firefox", true], ["Chrome", false]]) {
  test(`rules (${name}): webtransport/webbundle ${firefox ? "are left out" : "are kept"}`, () => {
    const G = load(sandbox({ firefox }).ctx, SHARED);
    const config = G.normalizeConfig(CONFIG);
    const rules = [...G.buildDynamicRules(config), ...G.buildSessionRules(config, [1])];
    const types = new Set(rules.flatMap((r) => r.condition.resourceTypes || []));
    assert.ok(types.has("websocket") && types.has("main_frame"));
    assert.equal(types.has("webtransport"), !firefox);
    assert.equal(types.has("webbundle"), !firefox);
  });
}

test("rules (Firefox): every resource type is one Firefox supports", () => {
  // Firefox 113+ per mdn/browser-compat-data (webextensions/api/declarativeNetRequest.json,
  // checked 2026-11-02): "webbundle" and "webtransport" are version_added:false; all these are 113.
  const supported = new Set(["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object",
    "xmlhttprequest", "ping", "csp_report", "media", "websocket", "other"]);
  const G = load(sandbox({ firefox: true }).ctx, SHARED);
  const config = G.normalizeConfig(CONFIG);
  for (const r of [...G.buildDynamicRules(config), ...G.buildSessionRules(config, [1])]) {
    for (const t of r.condition.resourceTypes || []) assert.ok(supported.has(t), `unsupported type ${t}`);
  }
});

test("logo (Firefox): normalizeConfig keeps a valid PNG and drops anything else", () => {
  const G = load(sandbox({ firefox: true }).ctx, SHARED);
  const png = "iVBORw0KGgoAAAANSUhEUg==";
  assert.equal(G.normalizeConfig({ OrganizationLogo: png }).OrganizationLogo, "data:image/png;base64," + png);
  assert.equal(G.normalizeConfig({ OrganizationLogo: "data:image/svg+xml;base64,PHN2Zz4=" }).OrganizationLogo, "");
});

test("status (Firefox): points at about:policies, not chrome://policy", () => {
  const G = load(sandbox({ firefox: true }).ctx, SHARED);
  const config = G.normalizeConfig({});
  const text = JSON.stringify(G.statusReport({ config, source: "awaiting-policy", installType: "admin" }));
  assert.match(text, /about:policies/);
  assert.doesNotMatch(text, /chrome:\/\/policy/);
});

// ---- background script as an event page -----------------------------------------------------

async function installBackground() {
  const sb = sandbox({ firefox: true, managed: { ...CONFIG, SignOutOnInstall: true } });
  // Firefox has no importScripts; the manifest's background.scripts loads the files instead.
  assert.equal(sb.ctx.importScripts, undefined);
  load(sb.ctx, ff.background.scripts);
  for (const fn of sb.calls.listeners.onInstalled) await fn({ reason: "install" });
  return sb;
}

test("background (Firefox): loads with no importScripts and registers its listeners", async () => {
  const { calls } = await installBackground();
  for (const name of ["onInstalled", "onStartup", "nav", "navTarget", "tabsRemoved", "action", "onMessage"]) {
    assert.ok(calls.listeners[name]?.length, `no ${name} listener`);
  }
});

test("background (Firefox): install syncs rules and sign-out skips cacheStorage", async () => {
  const { calls } = await installBackground();
  assert.ok(calls.dynamicRules.some((u) => u.addRules.length > 0), "dynamic rules were not installed");
  assert.equal(calls.removed.length, 1);
  const [{ origins }, types] = calls.removed[0];
  assert.ok(origins.length > 0 && origins.every((o) => o.startsWith("https://")));
  assert.equal(types.cacheStorage, undefined);
  assert.deepEqual(Object.keys(types).sort(), ["cookies", "indexedDB", "localStorage", "serviceWorkers"]);
});

test("background (Chrome): sign-out still clears cacheStorage", async () => {
  const sb = sandbox({ firefox: false, managed: { ...CONFIG, SignOutOnInstall: true } });
  sb.ctx.importScripts = (...f) => load(sb.ctx, f);
  vm.runInContext(read("extension/background.js"), sb.ctx);
  for (const fn of sb.calls.listeners.onInstalled) await fn({ reason: "install" });
  assert.equal(sb.calls.removed[0][1].cacheStorage, true);
});

test("background (Firefox): getConfig message returns the managed config", async () => {
  const { calls } = await installBackground();
  const reply = await new Promise((resolve) => {
    const handled = calls.listeners.onMessage[0]({ type: "getConfig" }, {}, resolve);
    assert.equal(handled, true);
  });
  assert.equal(reply.source, "managed");
  assert.equal(JSON.stringify(reply.config.AllowedDomains), '["example.org"]'); // JSON: the vm realm has its own Array
});

// ---- templates ------------------------------------------------------------------------------

test("deploy: policies.json targets the same ID and only known settings", () => {
  const policies = readJson("deploy/firefox/policies.json").policies;
  const id = ff.browser_specific_settings.gecko.id;
  assert.ok(policies.ExtensionSettings[id]);
  const settings = policies["3rdparty"].Extensions[id];
  const known = Object.keys(readJson("extension/schema.json").properties);
  for (const k of Object.keys(settings)) assert.ok(known.includes(k), `unknown setting ${k}`);
  assert.ok(existsSync(path.join(ROOT, "deploy/firefox/policies.json")));
});

test("deploy: the template's logo survives normalization", () => {
  const G = load(sandbox({ firefox: true }).ctx, SHARED);
  const id = ff.browser_specific_settings.gecko.id;
  const logo = readJson("deploy/firefox/policies.json").policies["3rdparty"].Extensions[id].OrganizationLogo;
  assert.match(G.normalizeConfig({ OrganizationLogo: logo }).OrganizationLogo, /^data:image\/png;base64,iVBORw0KGgo/);
});
