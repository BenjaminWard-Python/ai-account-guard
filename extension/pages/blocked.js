(async function () {
  "use strict";

  const G = globalThis.AIGuard;
  const params = new URLSearchParams(location.search);
  const { config } = await G.loadConfig();
  const org = config.OrganizationName || "Your organization";
  const provider = G.PROVIDERS.find((p) => p.id === params.get("provider"));
  const idp = G.IDENTITY_PROVIDERS.find((p) => p.id === params.get("idp"));

  const $ = (id) => document.getElementById(id);

  if (params.get("reason") === "site" && provider) {
    $("title").textContent = `${provider.name} is blocked`;
    $("body").textContent = `${org} doesn't allow ${provider.name} on this browser.`;
  } else if (params.get("reason") === "sso" && idp) {
    $("title").textContent = `Signing in with ${idp.name} isn't allowed here`;
    $("body").textContent = `${org} only allows AI services with your work account.`;
  } else {
    $("body").textContent = `${org} only allows AI services with your work account.`;
  }

  if (params.get("reason") !== "site" && config.AllowedDomains.length) {
    $("domains").textContent = "Approved accounts: " + config.AllowedDomains.map((d) => "@" + d).join(", ");
  }
  if (config.SupportMessage) $("support").textContent = config.SupportMessage;

  if (config.SsoPortalUrl) {
    const link = document.createElement("a");
    link.className = "button";
    link.href = config.SsoPortalUrl;
    link.textContent = "Go to company sign-in";
    $("actions").prepend(link);
  }

  $("back").addEventListener("click", () => (history.length > 1 ? history.back() : window.close()));
})();
