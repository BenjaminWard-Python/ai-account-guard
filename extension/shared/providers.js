// Catalog of AI services and third-party identity providers the extension knows about.
// Shared by the background worker, content script, and extension pages (classic script,
// attaches to globalThis.AIGuard so it also loads via importScripts and <script>).
(function (root) {
  "use strict";

  // mode: default enforcement for the service. Admins override per service with the
  //   ProviderModes policy.
  //   "enforce" - allow the service, but only for accounts in AllowedDomains
  //   "block"   - block the service entirely
  // domains: hostnames (subdomains included) where the service and its own login pages live.
  // signInVia: "own" if the service has its own email login we can inspect on-page;
  //   "google"/"microsoft" if sign-in happens entirely on that identity provider.
  // clearSessionsOnInstall: false for services whose cookies live on a shared parent
  //   domain (clearing them would sign the user out of all of Google or Microsoft).
  const PROVIDERS = [
    {
      id: "chatgpt",
      name: "ChatGPT",
      domains: ["chatgpt.com", "chat.openai.com", "auth.openai.com", "auth0.openai.com", "platform.openai.com"],
      signInVia: "own",
      mode: "enforce",
      clearSessionsOnInstall: true,
    },
    {
      id: "claude",
      name: "Claude",
      domains: ["claude.ai", "console.anthropic.com", "platform.claude.com"],
      signInVia: "own",
      mode: "enforce",
      clearSessionsOnInstall: true,
    },
    {
      id: "gemini",
      name: "Gemini",
      domains: ["gemini.google.com", "aistudio.google.com", "notebooklm.google.com"],
      signInVia: "google",
      mode: "enforce",
      clearSessionsOnInstall: false,
    },
    {
      id: "copilot",
      name: "Microsoft Copilot (consumer)",
      domains: ["copilot.microsoft.com"],
      signInVia: "microsoft",
      mode: "enforce",
      clearSessionsOnInstall: false,
    },
    {
      id: "perplexity",
      name: "Perplexity",
      domains: ["perplexity.ai"],
      signInVia: "own",
      mode: "enforce",
      clearSessionsOnInstall: true,
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      domains: ["deepseek.com"],
      signInVia: "own",
      mode: "enforce",
      clearSessionsOnInstall: true,
    },
    {
      id: "grok",
      name: "Grok",
      domains: ["grok.com", "x.ai"],
      signInVia: "own",
      mode: "enforce",
      clearSessionsOnInstall: true,
    },
    {
      id: "mistral",
      name: "Mistral Le Chat",
      domains: ["mistral.ai"],
      signInVia: "own",
      mode: "enforce",
      clearSessionsOnInstall: true,
    },
    {
      id: "poe",
      name: "Poe",
      domains: ["poe.com"],
      signInVia: "own",
      mode: "enforce",
      clearSessionsOnInstall: true,
    },
    {
      // Meta AI only supports personal Facebook/Instagram accounts, so there is no
      // company account to allow. Blocked by default.
      id: "meta",
      name: "Meta AI",
      domains: ["meta.ai"],
      signInVia: "own",
      mode: "block",
      clearSessionsOnInstall: true,
    },
  ];

  // Third-party "Sign in with ..." identity providers.
  // controllable: the provider supports tenant-restriction headers, so it can be allowed
  //   for company accounts only. Everything else is always blocked from AI sites.
  // match: patterns for the text or aria-label of on-page sign-in buttons.
  // requestDomains / urlFilter: network-level backstop for sign-in navigations that start
  //   on an AI site.
  const IDENTITY_PROVIDERS = [
    {
      id: "google",
      name: "Google",
      controllable: true,
      match: /\bgoogle\b/i,
      requestDomains: ["accounts.google.com"],
    },
    {
      id: "microsoft",
      name: "Microsoft",
      controllable: true,
      match: /\b(microsoft|outlook|office\s*365|entra)\b/i,
      requestDomains: ["login.microsoftonline.com", "login.microsoft.com", "login.windows.net"],
    },
    {
      // Personal Microsoft accounts (Outlook.com, Hotmail, Xbox). Never a company account.
      id: "microsoft-personal",
      name: "Microsoft personal account",
      controllable: false,
      match: null,
      requestDomains: ["login.live.com"],
    },
    { id: "apple", name: "Apple", controllable: false, match: /\bapple\b/i, requestDomains: ["appleid.apple.com"] },
    { id: "github", name: "GitHub", controllable: false, match: /\bgithub\b/i, requestDomains: ["github.com"], urlFilter: "/login/oauth" },
    { id: "facebook", name: "Facebook", controllable: false, match: /\b(facebook|meta)\b/i, requestDomains: ["facebook.com"], urlFilter: "oauth" },
    { id: "x", name: "X (Twitter)", controllable: false, match: /(\bx\b|\btwitter\b|\bx\.com\b)/i, requestDomains: ["x.com", "twitter.com"], urlFilter: "oauth" },
    { id: "discord", name: "Discord", controllable: false, match: /\bdiscord\b/i, requestDomains: ["discord.com"], urlFilter: "oauth2/authorize" },
    { id: "wechat", name: "WeChat", controllable: false, match: /\bwechat\b/i, requestDomains: ["open.weixin.qq.com"] },
    { id: "phone", name: "Phone number", controllable: false, match: /\b(phone|mobile|sms)\b/i, requestDomains: [] },
  ];

  function hostMatches(host, domain) {
    host = String(host || "").toLowerCase();
    return host === domain || host.endsWith("." + domain);
  }

  function providerForHost(host) {
    return PROVIDERS.find((p) => p.domains.some((d) => hostMatches(host, d))) || null;
  }

  function identityProviderForHost(host) {
    return IDENTITY_PROVIDERS.find((p) => p.requestDomains.some((d) => hostMatches(host, d))) || null;
  }

  root.AIGuard = Object.assign(root.AIGuard || {}, {
    PROVIDERS,
    IDENTITY_PROVIDERS,
    hostMatches,
    providerForHost,
    identityProviderForHost,
  });
})(globalThis);
