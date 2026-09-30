// Loading, normalizing, and evaluating the extension's configuration.
//
// Precedence: if IT has pushed any managed policy (Intune, Jamf, Google Admin), the managed
// values are used on top of DEFAULTS and local settings are ignored entirely. Otherwise the
// settings saved on the options page (chrome.storage.local) are used on top of DEFAULTS.
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

  // Returns { config, source } where source is "managed", "local", or "default".
  async function loadConfig() {
    const storage = root.chrome && root.chrome.storage;
    let managed = {};
    let local = {};
    if (storage) {
      try {
        managed = (await storage.managed.get(null)) || {};
      } catch (_) {
        // storage.managed throws when no schema/policy is available; treat as unmanaged.
      }
      try {
        local = ((await storage.local.get("settings")) || {}).settings || {};
      } catch (_) {}
    }
    if (hasAnyKey(managed)) return { config: normalizeConfig(managed), source: "managed" };
    if (hasAnyKey(local)) return { config: normalizeConfig(local), source: "local" };
    return { config: normalizeConfig({}), source: "default" };
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
    loadConfig,
  });
})(globalThis);
