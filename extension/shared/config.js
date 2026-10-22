// Loading, normalizing, and evaluating the extension's configuration.
//
// Precedence: if IT has pushed any managed policy (Intune, Jamf, Google Admin), the managed
// values are used on top of DEFAULTS and local settings are ignored entirely. If IT installed
// the extension but its policy hasn't arrived, DEFAULTS are used (every sign-in blocked) and
// local settings are still ignored, so users can't fill the gap. Otherwise the settings saved
// on the options page (chrome.storage.local) are used on top of DEFAULTS.
(function (root) {
  "use strict";

  const DEFAULTS = Object.freeze({
    // Email domains whose accounts may sign in. "*.example.org" also allows subdomains.
    // Empty until an admin sets it; an empty list blocks every sign-in on covered AI services.
    AllowedDomains: [],
    OrganizationName: "",
    // Where to send people when a sign-in is blocked (e.g. Okta/Entra/Google app portal).
    SsoPortalUrl: "",
    SupportMessage: "",
    // Allow "Sign in with Google", restricted to Google Workspace accounts in AllowedDomains.
    AllowGoogleSignIn: true,
    // Allow "Sign in with Microsoft", restricted to your Entra tenant. Needs MicrosoftTenantId.
    AllowMicrosoftSignIn: false,
    MicrosoftTenantId: "",
    // Where Google/Microsoft tenant restrictions apply:
    //   "ai-sites"     - only sign-ins that start from a covered AI service
    //   "all-browsing" - all Google/Microsoft sign-ins in this browser
    TenantRestrictionScope: "ai-sites",
    // Per-service override: { "<provider id>": "enforce" | "block" | "off" }
    ProviderModes: {},
    // On first install, sign users out of covered AI services so existing personal
    // sessions do not survive the rollout.
    SignOutOnInstall: false,
  });

  const POLICY_KEYS = Object.keys(DEFAULTS);
  const MODES = ["enforce", "block", "off"];
  const SCOPES = ["ai-sites", "all-browsing"];

  // Normalizes a domain to lowercase ASCII (punycode), so look-alike Unicode domains
  // cannot sneak past a comparison. Returns "" for anything that is not a valid hostname.
  function normalizeDomain(value) {
    let d = String(value || "").trim().toLowerCase().replace(/^@/, "").replace(/\.$/, "");
    if (!d || /[\s/@:?#]/.test(d)) return "";
    try {
      return new URL("http://" + d).hostname;
    } catch (_) {
      return "";
    }
  }

  function normalizeAllowedDomain(value) {
    const raw = String(value || "").trim().toLowerCase().replace(/^@/, "");
    if (raw.startsWith("*.")) {
      const base = normalizeDomain(raw.slice(2));
      return base ? "*." + base : "";
    }
    return normalizeDomain(raw);
  }

  function emailDomain(email) {
    const s = String(email || "").trim();
    const at = s.lastIndexOf("@");
    if (at <= 0 || at === s.length - 1) return "";
    return normalizeDomain(s.slice(at + 1));
  }

  function isDomainAllowed(domain, allowedDomains) {
    if (!domain) return false;
    return allowedDomains.some((entry) =>
      entry.startsWith("*.")
        ? domain === entry.slice(2) || domain.endsWith(entry.slice(1))
        : domain === entry
    );
  }

  function isEmailAllowed(email, config) {
    return isDomainAllowed(emailDomain(email), config.AllowedDomains);
  }

  // Domains for tenant-restriction headers, which take plain domains (no wildcards).
  function headerDomains(config) {
    return [...new Set(config.AllowedDomains.map((d) => d.replace(/^\*\./, "")))];
  }

  function normalizeConfig(input) {
    const src = input || {};
    const c = {};
    for (const key of POLICY_KEYS) {
      c[key] = src[key] !== undefined && src[key] !== null ? src[key] : DEFAULTS[key];
    }

    const list = Array.isArray(c.AllowedDomains) ? c.AllowedDomains : String(c.AllowedDomains).split(/[,\s]+/);
    c.AllowedDomains = [...new Set(list.map(normalizeAllowedDomain).filter(Boolean))];

    c.OrganizationName = String(c.OrganizationName || "").trim();
    c.SupportMessage = String(c.SupportMessage || "").trim();
    c.SsoPortalUrl = safeHttpUrl(c.SsoPortalUrl);
    c.MicrosoftTenantId = String(c.MicrosoftTenantId || "").trim();
    c.AllowGoogleSignIn = c.AllowGoogleSignIn === true;
    c.AllowMicrosoftSignIn = c.AllowMicrosoftSignIn === true;
    c.SignOutOnInstall = c.SignOutOnInstall === true;
    if (!SCOPES.includes(c.TenantRestrictionScope)) c.TenantRestrictionScope = DEFAULTS.TenantRestrictionScope;

    const modes = {};
    const overrides = c.ProviderModes && typeof c.ProviderModes === "object" ? c.ProviderModes : {};
    for (const p of root.AIGuard.PROVIDERS) {
      modes[p.id] = MODES.includes(overrides[p.id]) ? overrides[p.id] : p.mode;
    }
    c.ProviderModes = modes;
    return c;
  }

  // Only http(s) URLs are allowed for the portal link, so a policy value can never
  // become a javascript: link on the block page.
  function safeHttpUrl(value) {
    try {
      const u = new URL(String(value || "").trim());
      return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
    } catch (_) {
      return "";
    }
  }

  // Which sign-in methods are usable under this config.
  function identityProviderAllowed(idpId, config) {
    if (idpId === "google") return config.AllowGoogleSignIn && headerDomains(config).length > 0;
    if (idpId === "microsoft") {
      return config.AllowMicrosoftSignIn && !!config.MicrosoftTenantId && headerDomains(config).length > 0;
    }
    return false;
  }

  function hasAnyKey(obj) {
    return !!obj && POLICY_KEYS.some((k) => obj[k] !== undefined);
  }

  // How the extension was installed: "admin" (force-installed by IT), "normal" (Chrome Web
  // Store), "development" (unpacked), "sideload", "other", or "" if unknown. getSelf needs no
  // "management" permission.
  async function getInstallType() {
    const management = root.chrome && root.chrome.management;
    if (!management || !management.getSelf) return "";
    try {
      return (await management.getSelf()).installType || "";
    } catch (_) {
      return "";
    }
  }

  // True when IT force-installed the extension (ExtensionInstallForcelist).
  async function isAdminInstalled() {
    return (await getInstallType()) === "admin";
  }

  // Policy as IT deployed it. For unpacked (developer) installs only, chrome.storage.local
  // "devManaged" stands in for device management, so the dashboard connection can be tested
  // without administrator rights; store-installed copies never read it.
  async function readManaged(storage) {
    let managed = {};
    try {
      managed = (await storage.managed.get(null)) || {};
    } catch (_) {
      // storage.managed throws when no schema/policy is available; treat as unmanaged.
    }
    if ((await getInstallType()) === "development") {
      try {
        const dev = ((await storage.local.get("devManaged")) || {}).devManaged;
        if (dev && typeof dev === "object") managed = { ...managed, ...dev };
      } catch (_) {}
    }
    return managed;
  }

  // Returns { config, source, dashboard? } where source is "dashboard", "awaiting-dashboard",
  // "managed", "awaiting-policy", "local", or "default".
  async function loadConfig() {
    const storage = root.chrome && root.chrome.storage;
    let managed = {};
    let local = {};
    if (storage) {
      managed = await readManaged(storage);
      try {
        local = ((await storage.local.get("settings")) || {}).settings || {};
      } catch (_) {}
      // Connected to a dashboard: its signed settings (with any deployed floor) win.
      if (root.AIGuard.dashboardConfig) {
        const fromDashboard = await root.AIGuard.dashboardConfig(managed, storage);
        if (fromDashboard) return fromDashboard;
      }
    }
    if (hasAnyKey(managed)) return { config: normalizeConfig(managed), source: "managed" };
    if (await isAdminInstalled()) return { config: normalizeConfig({}), source: "awaiting-policy" };
    if (hasAnyKey(local)) return { config: normalizeConfig(local), source: "local" };
    return { config: normalizeConfig({}), source: "default" };
  }

  const SETUP_URL = "https://stratitsolutions.com/ai-account-guard/setup/";

  // Plain-language health check for the settings page. Returns rows to show, problems with
  // their fixes (for IT), and a text summary to paste into a support ticket.
  function statusReport({ config, source, installType, version, extensionId, dashboard }) {
    const rows = [];
    const problems = [];
    const add = (label, value, state) => rows.push({ label, value, state: state || "" });

    const fromOrg = source === "managed" || source === "dashboard";
    add("Settings", {
      dashboard: `From your organization's dashboard (revision ${dashboard && dashboard.revision})`,
      "awaiting-dashboard": "Waiting for settings from your organization's dashboard",
      managed: "From your organization",
      "awaiting-policy": "Waiting for your IT team's settings",
      local: "Saved on this computer",
      default: "Not set up",
    }[source] || source, fromOrg ? "ok" : source === "local" ? "" : "bad");
    if (dashboard) {
      const checked = dashboard.checkedAt ? new Date(dashboard.checkedAt).toLocaleString() : "not yet";
      add("Dashboard", `${dashboard.origin || "not an approved dashboard"} · last checked ${checked}`,
        dashboard.invalid || dashboard.error ? "warn" : "ok");
      add("Coverage reporting", dashboard.coverage ? "On: this computer sends its status to the dashboard" : "Off");
    }

    add("Installed by", {
      admin: "Your organization (staff can't remove it)",
      normal: "This browser's user, from the Chrome Web Store",
      development: "A developer (loaded unpacked)",
      sideload: "Another program on this computer",
    }[installType] || "Unknown", installType === "admin" ? "ok" : fromOrg ? "warn" : "");

    add("Version", version || "Unknown");

    const domains = config.AllowedDomains;
    add("Approved email domains", domains.length ? domains.map((d) => "@" + d).join(", ") : "None, so every sign-in is blocked",
      domains.length ? "ok" : "bad");

    const ms = identityProviderAllowed("microsoft", config);
    add("Sign in with Microsoft", ms ? `Allowed for tenant ${config.MicrosoftTenantId}` : "Blocked",
      config.AllowMicrosoftSignIn && !ms ? "warn" : "");
    const google = identityProviderAllowed("google", config);
    add("Sign in with Google", google ? `Allowed for ${headerDomains(config).join(", ")}` : "Blocked");

    const counts = { enforce: 0, block: 0, off: 0 };
    for (const p of root.AIGuard.PROVIDERS) counts[config.ProviderModes[p.id]]++;
    add("AI services", `${counts.enforce} work accounts only, ${counts.block} blocked, ${counts.off} not managed`,
      counts.off === root.AIGuard.PROVIDERS.length ? "warn" : "");

    if (dashboard && dashboard.invalid) {
      problems.push({
        code: "dashboard-not-allowed",
        text: "The dashboard address or organization key deployed to this computer isn't valid, so no settings can arrive and every sign-in is blocked.",
        fix: "Download the deployment file again from the dashboard's Deploy page and redeploy it.",
      });
    } else if (source === "awaiting-dashboard") {
      problems.push({
        code: "awaiting-dashboard",
        text: "Settings from your organization's dashboard haven't arrived yet. Until they do, every sign-in on AI services is blocked.",
        fix: "Check this computer can reach the dashboard, and that settings have been saved there. The extension checks again within a few minutes.",
      });
    }
    if (dashboard && dashboard.error === "unreachable") {
      problems.push({
        code: "dashboard-unreachable",
        text: "The last attempt to reach the dashboard failed.",
        fix: "This computer keeps using the last settings it received. Check its internet access and firewall.",
      });
    }
    if (dashboard && dashboard.error === "unknown-organization") {
      problems.push({
        code: "dashboard-not-allowed",
        text: "The dashboard doesn't recognize the organization key deployed to this computer.",
        fix: "The key may have been replaced. Download the deployment file again from the dashboard's Deploy page and redeploy it.",
      });
    }
    if (dashboard && dashboard.error === "bad-signature") {
      problems.push({
        code: "bad-signature",
        text: "Settings received from the dashboard failed the signature check and were ignored.",
        fix: "Contact StratIT support. This computer keeps using the last good settings.",
      });
    }
    if (source === "awaiting-policy") {
      problems.push({
        code: "awaiting-policy",
        text: "Your IT team installed AI Account Guard, but its settings haven't arrived. Until they do, every sign-in on AI services is blocked.",
        fix: `Open chrome://policy and click Reload policies. If there's no section for ${extensionId || "the extension"}, the settings were never sent: installing the extension doesn't send them. Make the settings file at ${SETUP_URL} and push it with the same tool that installs the extension.`,
      });
    } else if (source === "default") {
      problems.push({
        code: "not-set-up",
        text: "AI Account Guard isn't set up, so every sign-in on AI services is blocked.",
        fix: `Organizations: push the settings with Intune, Jamf or Google Admin (${SETUP_URL}). On your own: add your email domain below and save.`,
      });
    } else if (!domains.length && source !== "awaiting-dashboard") {
      problems.push({
        code: "no-domains",
        text: "The settings don't list any approved email domains, so every sign-in is blocked.",
        fix: "Add your organization's email domains to AllowedDomains.",
      });
    }
    if (config.AllowMicrosoftSignIn && !config.MicrosoftTenantId) {
      problems.push({
        code: "microsoft-no-tenant",
        text: '"Sign in with Microsoft" is turned on, but there\'s no tenant ID, so it stays blocked.',
        fix: "Add MicrosoftTenantId (Entra admin center > Overview > Tenant ID), or use the setup page, which looks it up.",
      });
    }
    if (fromOrg && installType && installType !== "admin" && installType !== "development") {
      problems.push({
        code: "not-force-installed",
        text: "Settings come from your organization, but the extension isn't force-installed, so staff can remove it.",
        fix: `Force-install it with ExtensionInstallForcelist. The files from ${SETUP_URL} include this.`,
      });
    }
    if (counts.off === root.AIGuard.PROVIDERS.length) {
      problems.push({ code: "all-off", text: "Every AI service is set to Not managed, so nothing is checked.", fix: "Set the services you use to Work accounts only." });
    }

    const text = [
      "AI Account Guard status",
      ...rows.map((r) => `${r.label}: ${r.value}`),
      ...problems.map((p) => `Problem: ${p.text}`),
      `Extension ID: ${extensionId || "unknown"}`,
    ].join("\n");
    return { rows, problems, text };
  }

  root.AIGuard = Object.assign(root.AIGuard || {}, {
    DEFAULTS,
    POLICY_KEYS,
    MODES,
    SCOPES,
    normalizeDomain,
    normalizeAllowedDomain,
    emailDomain,
    isDomainAllowed,
    isEmailAllowed,
    headerDomains,
    normalizeConfig,
    safeHttpUrl,
    identityProviderAllowed,
    getInstallType,
    readManaged,
    statusReport,
    SETUP_URL,
    loadConfig,
  });
})(globalThis);
