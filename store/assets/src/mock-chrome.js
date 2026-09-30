// Stand-in chrome.* APIs so extension pages render with demo settings outside the extension.
globalThis.DEMO_SETTINGS = {
  AllowedDomains: ["examplecounty.gov"],
  OrganizationName: "Example County",
  SsoPortalUrl: "https://myapps.microsoft.com",
  SupportMessage: "Questions? Contact the IT help desk at ext. 4357.",
  AllowGoogleSignIn: false,
  AllowMicrosoftSignIn: true,
  MicrosoftTenantId: "3f2a9c1e-7b44-4d0a-9e61-5c8d2b7f1a90",
  ProviderModes: { deepseek: "block" },
};
globalThis.chrome = {
  runtime: {
    lastError: undefined,
    sendMessage: (_msg, cb) => setTimeout(() => cb({ config: AIGuard.normalizeConfig(DEMO_SETTINGS), source: "managed" }), 0),
  },
  storage: {
    managed: { get: async () => DEMO_SETTINGS },
    local: { get: async () => ({}), set: async () => {} },
    onChanged: { addListener: () => {} },
  },
};
