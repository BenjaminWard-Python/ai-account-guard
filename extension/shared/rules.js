// Builds declarativeNetRequest rules from a normalized config. Pure functions, no chrome.*
// calls, so they can be unit tested in a plain page.
//
// "AI context" means a request that either (a) was initiated by a covered AI service, or
// (b) happens in a tab the background worker has tagged as part of an AI sign-in flow
// (the AI tab itself or a sign-in popup it opened). (a) is a persistent dynamic rule so it
// is active from browser start; (b) is a session rule rebuilt as tabs are tagged.
(function (root) {
  "use strict";

  const G = root.AIGuard;
  const BLOCK_PAGE = "/pages/blocked.html";
  const SESSION_ID_OFFSET = 10000;
  const ALL_RESOURCE_TYPES = [
    "main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object",
    "xmlhttprequest", "ping", "csp_report", "media", "websocket", "webtransport",
    "webbundle", "other",
  ];

  function enforcedProviders(config) {
    return G.PROVIDERS.filter((p) => config.ProviderModes[p.id] === "enforce");
  }

  function blockedProviders(config) {
    return G.PROVIDERS.filter((p) => config.ProviderModes[p.id] === "block");
  }

  function aiDomains(config) {
    return enforcedProviders(config).flatMap((p) => p.domains);
  }

  function blockPagePath(params) {
    return BLOCK_PAGE + "?" + new URLSearchParams(params).toString();
  }

  // Rules that should apply only in an AI context. Returns the dynamic (initiator-based)
  // variants and session (tab-based) variants of each.
  function contextRules(config, tabIds) {
    const templates = [];

    for (const idp of G.IDENTITY_PROVIDERS) {
      if (!idp.requestDomains.length || G.identityProviderAllowed(idp.id, config)) continue;
      const base = { requestDomains: idp.requestDomains };
      if (idp.urlFilter) base.urlFilter = idp.urlFilter;
      templates.push({
        priority: 3,
        action: { type: "redirect", redirect: { extensionPath: blockPagePath({ reason: "sso", idp: idp.id }) } },
        condition: { ...base, resourceTypes: ["main_frame"] },
      });
      templates.push({
        priority: 3,
        action: { type: "block" },
        condition: { ...base, resourceTypes: ["sub_frame"] },
      });
    }

    if (config.TenantRestrictionScope === "ai-sites") templates.push(...headerRules(config));

    const domains = aiDomains(config);
    const dynamic = domains.length
      ? templates.map((r) => ({ ...r, condition: { ...r.condition, initiatorDomains: domains } }))
      : [];
    const session = tabIds && tabIds.length
      ? templates.map((r) => ({ ...r, condition: { ...r.condition, tabIds: [...tabIds] } }))
      : [];
    return { dynamic, session };
  }

  // Tenant-restriction headers for Google and Microsoft sign-in. Google and Microsoft
  // enforce these on their side: only accounts in the listed domains/tenant can sign in.
  function headerRules(config) {
    const rules = [];
    const domains = G.headerDomains(config);
    if (G.identityProviderAllowed("google", config)) {
      rules.push({
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "X-GoogApps-Allowed-Domains", operation: "set", value: domains.join(",") }],
        },
        condition: { requestDomains: ["google.com"], resourceTypes: ALL_RESOURCE_TYPES },
      });
    }
    if (G.identityProviderAllowed("microsoft", config)) {
      const msIdp = G.IDENTITY_PROVIDERS.find((p) => p.id === "microsoft");
      rules.push({
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            { header: "Restrict-Access-To-Tenants", operation: "set", value: domains.join(",") },
            { header: "Restrict-Access-Context", operation: "set", value: config.MicrosoftTenantId },
          ],
        },
        condition: { requestDomains: msIdp.requestDomains, resourceTypes: ALL_RESOURCE_TYPES },
      });
    }
    return rules;
  }

  function siteBlockRules(config) {
    const rules = [];
    for (const p of blockedProviders(config)) {
      rules.push({
        priority: 4,
        action: { type: "redirect", redirect: { extensionPath: blockPagePath({ reason: "site", provider: p.id }) } },
        condition: { requestDomains: p.domains, resourceTypes: ["main_frame"] },
      });
      rules.push({
        priority: 4,
        action: { type: "block" },
        condition: { requestDomains: p.domains, resourceTypes: ["sub_frame"] },
      });
    }
    return rules;
  }

  function withIds(rules, offset) {
    return rules.map((r, i) => ({ id: offset + i + 1, ...r }));
  }

  // Persistent rules: site blocks, AI-initiated sign-in rules, and (for "all-browsing")
  // browser-wide tenant-restriction headers.
  function buildDynamicRules(config) {
    const rules = [...siteBlockRules(config), ...contextRules(config, []).dynamic];
    if (config.TenantRestrictionScope === "all-browsing") rules.push(...headerRules(config));
    return withIds(rules, 0);
  }

  // Per-tab rules for tabs tagged as part of an AI sign-in flow.
  function buildSessionRules(config, tabIds) {
    return withIds(contextRules(config, tabIds).session, SESSION_ID_OFFSET);
  }

  root.AIGuard = Object.assign(root.AIGuard || {}, {
    BLOCK_PAGE,
    enforcedProviders,
    aiDomains,
    buildDynamicRules,
    buildSessionRules,
  });
})(globalThis);
