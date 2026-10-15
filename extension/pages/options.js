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

    const locked = source === "managed" || source === "awaiting-policy";
    $("fields").disabled = locked;
    $("source").textContent = {
      managed: "These settings are managed by your organization and can't be changed here.",
      "awaiting-policy": "Your IT team installed AI Account Guard but hasn't sent its settings yet. " +
        "Until they do, sign-ins on AI services are blocked, and these settings can't be changed here.",
      local: "Using settings saved on this computer.",
      default: "Using default settings. Save to customize them for this computer.",
    }[source];

    const warnings = [];
    if (!config.AllowedDomains.length && !locked) {
      warnings.push("Add your organization's email domain to get started. Until one is set, every sign-in on covered AI services is blocked.");
    }
    if (config.AllowMicrosoftSignIn && !config.MicrosoftTenantId) warnings.push("Microsoft sign-in stays blocked until a tenant ID is set.");
    $("warning").textContent = warnings.join(" ");
    $("warning").hidden = !warnings.length;
  }

  let current = await G.loadConfig();
  render(current);

  $("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    // Settings from IT (or IT's install without settings yet) always win; never save over them.
    if (current.source === "managed" || current.source === "awaiting-policy") return;
    const settings = { AllowedDomains: $("AllowedDomains").value.split(/[\s,]+/).filter(Boolean), ProviderModes: {} };
    for (const f of TEXT_FIELDS) settings[f] = $(f).value;
    for (const f of CHECK_FIELDS) settings[f] = $(f).checked;
    for (const p of G.PROVIDERS) settings.ProviderModes[p.id] = $("mode-" + p.id).value;

    await chrome.storage.local.set({ settings: G.normalizeConfig(settings) });
    current = await G.loadConfig();
    render(current);
    $("status").textContent = "Saved";
    setTimeout(() => ($("status").textContent = ""), 2000);
  });
})();
