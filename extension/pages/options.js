(async function () {
  "use strict";

  const G = globalThis.AIGuard;
  const $ = (id) => document.getElementById(id);
  const MODE_LABELS = { enforce: "Work accounts only", block: "Block entirely", off: "Not managed" };
  const TEXT_FIELDS = ["OrganizationName", "SsoPortalUrl", "SupportMessage", "MicrosoftTenantId", "TenantRestrictionScope"];
  const CHECK_FIELDS = ["AllowGoogleSignIn", "AllowMicrosoftSignIn"];

  for (const p of G.PROVIDERS) {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = p.name;
    const cell = document.createElement("td");
    const select = document.createElement("select");
    select.id = "mode-" + p.id;
    select.setAttribute("aria-label", p.name);
    for (const mode of G.MODES) select.add(new Option(MODE_LABELS[mode], mode));
    cell.append(select);
    row.append(name, cell);
    $("providers").append(row);
  }

  function render({ config, source }) {
    $("AllowedDomains").value = config.AllowedDomains.join("\n");
    for (const f of TEXT_FIELDS) $(f).value = config[f];
    for (const f of CHECK_FIELDS) $(f).checked = config[f];
    for (const p of G.PROVIDERS) $("mode-" + p.id).value = config.ProviderModes[p.id];

    $("fields").disabled = source === "managed";
    $("source").textContent = {
      managed: "These settings are managed by your organization and can't be changed here.",
      local: "Using settings saved on this computer.",
      default: "Using default settings. Save to customize them for this computer.",
    }[source];

    const warnings = [];
    if (!config.AllowedDomains.length) warnings.push("No allowed domains are set, so every sign-in on covered AI services is blocked.");
    if (config.AllowMicrosoftSignIn && !config.MicrosoftTenantId) warnings.push("Microsoft sign-in stays blocked until a tenant ID is set.");
    $("warning").textContent = warnings.join(" ");
    $("warning").hidden = !warnings.length;
  }

  render(await G.loadConfig());

  $("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const settings = { AllowedDomains: $("AllowedDomains").value.split(/[\s,]+/).filter(Boolean), ProviderModes: {} };
    for (const f of TEXT_FIELDS) settings[f] = $(f).value;
    for (const f of CHECK_FIELDS) settings[f] = $(f).checked;
    for (const p of G.PROVIDERS) settings.ProviderModes[p.id] = $("mode-" + p.id).value;

    await chrome.storage.local.set({ settings: G.normalizeConfig(settings) });
    render(await G.loadConfig());
    $("status").textContent = "Saved";
    setTimeout(() => ($("status").textContent = ""), 2000);
  });
})();
