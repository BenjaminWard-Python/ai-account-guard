// Settings from the AI Account Guard dashboard (optional, paid). Shared by the background
// worker and extension pages; attaches to globalThis.AIGuard like the other shared files.
//
// IT deploys two policy keys, DashboardUrl and DashboardOrgKey. The background worker fetches
// signed settings from that dashboard and keeps the last good copy in chrome.storage.local;
// loadConfig() verifies that copy every time it's read, so editing local storage by hand
// can't change the settings. Any other policy keys deployed alongside are a floor: the
// dashboard can make them stricter, never looser.
(function (root) {
  "use strict";

  // Dashboards this extension accepts settings from, with the public key that signs them
  // (ECDSA P-256, base64 SPKI). A DashboardUrl not listed here is ignored.
  const DASHBOARDS = {
    // Local development dashboard (aag-dashboard repo, `npm run dev`).
    "http://localhost:3200": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE60kyyjRDK0P2vTP05hCfqo5Sua6jK3vYBpSzfCVjPf9sYMTj4URHLAFXaFlulTiYqaMPW9H3iELFy4/WuoRUCw==",
  };

  const DASHBOARD_KEYS = ["DashboardUrl", "DashboardOrgKey"];
  const STORE = "dashboard"; // chrome.storage.local key for the last good signed settings
  const ORG_KEY = /^aag_[A-Za-z0-9_-]{43}$/;

  function dashboardOrigin(url) {
    try {
      const u = new URL(String(url || ""));
      const origin = u.origin;
      return DASHBOARDS[origin] ? origin : "";
    } catch (_) {
      return "";
    }
  }

  /** The dashboard connection from managed policy, or null if not configured or not trusted. */
  function dashboardFromPolicy(managed) {
    if (!managed || !managed.DashboardUrl || !managed.DashboardOrgKey) return null;
    const origin = dashboardOrigin(managed.DashboardUrl);
    const orgKey = String(managed.DashboardOrgKey);
    if (!origin || !ORG_KEY.test(orgKey)) return { origin: "", orgKey, invalid: true };
    return { origin, orgKey, invalid: false };
  }

  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const b64url = (s) => b64(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4));
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

  async function sha256Hex(text) {
    return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  }

  const verified = new Map(); // signature -> parsed document, so pages don't re-verify each read

  /**
   * Checks a signed settings document from the dashboard at `origin` for the organization with
   * `orgKey`. Returns the parsed document ({v, org, revision, issuedAt, settings}) or null.
   */
  async function verifyDocument(stored, orgKey, origin) {
    if (!stored || typeof stored.payload !== "string" || typeof stored.signature !== "string") return null;
    const spki = DASHBOARDS[origin];
    if (!spki) return null;
    // Keyed on the payload as well as the signature: a tampered payload reusing a good
    // signature must never hit the cache.
    const cacheKey = `${origin}|${stored.signature}|${stored.payload}`;
    if (verified.has(cacheKey)) {
      const doc = verified.get(cacheKey);
      return doc.org === (await sha256Hex(orgKey)) ? doc : null;
    }
    try {
      const key = await crypto.subtle.importKey("spki", b64(spki), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, b64url(stored.signature), new TextEncoder().encode(stored.payload));
      if (!ok) return null;
      const doc = JSON.parse(stored.payload);
      if (doc.v !== 1 || !Number.isInteger(doc.revision) || !doc.settings || typeof doc.settings !== "object") return null;
      if (doc.org !== (await sha256Hex(orgKey))) return null;
      verified.set(cacheKey, doc);
      return doc;
    } catch (_) {
      return null;
    }
  }

  // Strictness order for a service's mode: block is strictest, off the loosest.
  const MODE_RANK = { off: 0, enforce: 1, block: 2 };

  /**
   * Combines dashboard settings with a floor deployed through device management. Only keys
   * present in the floor constrain; the dashboard can tighten them, never loosen them.
   * Wording fields (name, portal, support message) come from the dashboard when set.
   */
  function applyFloor(dash, floorRaw) {
    const G = root.AIGuard;
    const floor = G.normalizeConfig(floorRaw);
    const has = (k) => floorRaw[k] !== undefined && floorRaw[k] !== null;
    const out = { ...dash, ProviderModes: { ...dash.ProviderModes } };
    if (has("AllowedDomains")) out.AllowedDomains = dash.AllowedDomains.filter((d) => floor.AllowedDomains.includes(d));
    if (has("AllowGoogleSignIn")) out.AllowGoogleSignIn = dash.AllowGoogleSignIn && floor.AllowGoogleSignIn;
    if (has("AllowMicrosoftSignIn")) out.AllowMicrosoftSignIn = dash.AllowMicrosoftSignIn && floor.AllowMicrosoftSignIn;
    if (has("MicrosoftTenantId")) out.MicrosoftTenantId = floor.MicrosoftTenantId;
    if (has("TenantRestrictionScope") && floor.TenantRestrictionScope === "all-browsing") out.TenantRestrictionScope = "all-browsing";
    if (has("SignOutOnInstall")) out.SignOutOnInstall = dash.SignOutOnInstall || floor.SignOutOnInstall;
    if (has("ProviderModes")) {
      for (const p of G.PROVIDERS) {
        if (floorRaw.ProviderModes[p.id] === undefined) continue;
        if (MODE_RANK[floor.ProviderModes[p.id]] > MODE_RANK[out.ProviderModes[p.id]]) out.ProviderModes[p.id] = floor.ProviderModes[p.id];
      }
    }
    for (const k of ["OrganizationName", "SsoPortalUrl", "SupportMessage"]) {
      if (!out[k] && floor[k]) out[k] = floor[k];
    }
    return out;
  }

  /**
   * The config when the extension is connected to a dashboard. Returns null when it isn't.
   * Source is "dashboard", or "awaiting-dashboard" until good settings have arrived (every
   * sign-in is blocked meanwhile).
   */
  async function dashboardConfig(managed, storage) {
    const conn = dashboardFromPolicy(managed);
    if (!conn) return null;
    const G = root.AIGuard;
    let state = {};
    try {
      state = ((await storage.local.get(STORE)) || {})[STORE] || {};
    } catch (_) {}
    const doc = conn.invalid ? null : await verifyDocument(state, conn.orgKey, conn.origin);
    const dashboard = {
      origin: conn.origin,
      invalid: conn.invalid,
      revision: doc ? doc.revision : null,
      checkedAt: state.checkedAt || null,
      error: state.error || null,
      coverage: !!state.coverage,
    };
    if (!doc) return { config: G.normalizeConfig({}), source: "awaiting-dashboard", dashboard };

    let config = G.normalizeConfig(doc.settings);
    const floorRaw = Object.fromEntries(Object.entries(managed).filter(([k]) => !DASHBOARD_KEYS.includes(k)));
    const hasFloor = G.POLICY_KEYS.some((k) => floorRaw[k] !== undefined);
    if (hasFloor) config = applyFloor(config, floorRaw);
    dashboard.floor = hasFloor;
    return { config, source: "dashboard", dashboard };
  }

  root.AIGuard = Object.assign(root.AIGuard || {}, {
    DASHBOARDS,
    DASHBOARD_STORE: STORE,
    dashboardFromPolicy,
    verifyDashboardDocument: verifyDocument,
    applyFloor,
    dashboardConfig,
    sha256Hex,
  });
})(globalThis);
