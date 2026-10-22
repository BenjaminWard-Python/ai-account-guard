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

  function render({ config, source, dashboard }) {
    $("AllowedDomains").value = config.AllowedDomains.join("\n");
    for (const f of TEXT_FIELDS) $(f).value = config[f];
    for (const f of CHECK_FIELDS) $(f).checked = config[f];
    for (const p of G.PROVIDERS) $("mode-" + p.id).value = config.ProviderModes[p.id];

    const locked = ["managed", "awaiting-policy", "dashboard", "awaiting-dashboard"].includes(source);
    $("fields").disabled = locked;
    $("source").textContent = {
      dashboard: "These settings come from your organization's dashboard and can't be changed here.",
      "awaiting-dashboard": "These settings will come from your organization's dashboard and can't be changed here.",
      managed: "These settings are managed by your organization and can't be changed here.",
      "awaiting-policy": "These settings will come from your IT team and can't be changed here.",
      local: "Using settings saved on this computer.",
      default: "Using default settings. Save to customize them for this computer.",
    }[source];
    renderStatus({ config, source, dashboard });
    $("sync-now").hidden = !dashboard;
  }

  let statusText = "";
  async function renderStatus({ config, source, dashboard }) {
    const report = G.statusReport({
      config,
      source,
      dashboard,
      installType: await G.getInstallType(),
      version: chrome.runtime.getManifest().version,
      extensionId: chrome.runtime.id,
    });
    statusText = report.text;

    $("problems").replaceChildren(...report.problems.map((p) => {
      const box = document.createElement("div");
      box.className = "problem";
      box.setAttribute("role", "alert");
      const text = document.createElement("p");
      text.textContent = p.text;
      const fix = document.createElement("p");
      fix.textContent = "How to fix: " + p.fix;
      box.append(text, fix);
      return box;
    }));

    $("status-rows").replaceChildren(...report.rows.flatMap((r) => {
      const dt = document.createElement("dt");
      dt.textContent = r.label;
      const dd = document.createElement("dd");
      dd.textContent = r.value;
      if (r.state) dd.className = r.state;
      return [dt, dd];
    }));
  }

  $("open-policy").addEventListener("click", () => chrome.tabs.create({ url: "chrome://policy" }));
  $("sync-now").addEventListener("click", async () => {
    $("sync-now").disabled = true;
    $("copy-result").textContent = "Checking…";
    await chrome.runtime.sendMessage({ type: "syncDashboard" });
    render((current = await G.loadConfig()));
    $("copy-result").textContent = "Checked.";
    $("sync-now").disabled = false;
  });
  $("copy-status").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(statusText);
      $("copy-result").textContent = "Copied. Paste it into your help-desk ticket.";
    } catch (_) {
      $("copy-result").textContent = "Couldn't copy.";
    }
  });

  // Settings pushed by IT can arrive while this page is open.
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === "managed" || (area === "local" && (changes.dashboard || changes.devManaged))) render((current = await G.loadConfig()));
  });

  let current = await G.loadConfig();
  render(current);

  $("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    // Settings from IT (or IT's install without settings yet) always win; never save over them.
    if (["managed", "awaiting-policy", "dashboard", "awaiting-dashboard"].includes(current.source)) return;
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
