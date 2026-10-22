// Background service worker: keeps declarativeNetRequest rules in sync with the current
// config and tracks which tabs are part of an AI sign-in flow.
importScripts("shared/providers.js", "shared/config.js", "shared/dashboard.js", "shared/rules.js");

const G = globalThis.AIGuard;
const TAGGED_TABS_KEY = "taggedTabs";

// Serialize all rule updates so overlapping events cannot interleave remove/add calls.
let queue = Promise.resolve();
function enqueue(task) {
  queue = queue.then(task).catch((err) => console.error("[AI Account Guard]", err));
  return queue;
}

async function getTaggedTabs() {
  const data = await chrome.storage.session.get(TAGGED_TABS_KEY);
  return data[TAGGED_TABS_KEY] || [];
}

async function setTaggedTabs(tabIds) {
  await chrome.storage.session.set({ [TAGGED_TABS_KEY]: tabIds });
}

async function replaceRules(getExisting, update, rules) {
  const existing = await getExisting();
  await update({ removeRuleIds: existing.map((r) => r.id), addRules: rules });
}

async function syncDynamicRules() {
  const { config } = await G.loadConfig();
  await replaceRules(
    () => chrome.declarativeNetRequest.getDynamicRules(),
    (u) => chrome.declarativeNetRequest.updateDynamicRules(u),
    G.buildDynamicRules(config)
  );
}

async function syncSessionRules() {
  const { config } = await G.loadConfig();
  await replaceRules(
    () => chrome.declarativeNetRequest.getSessionRules(),
    (u) => chrome.declarativeNetRequest.updateSessionRules(u),
    G.buildSessionRules(config, await getTaggedTabs())
  );
}

function syncAll() {
  return enqueue(async () => {
    await syncDynamicRules();
    await syncSessionRules();
  });
}

function updateTag(tabId, tagged) {
  return enqueue(async () => {
    const tabs = await getTaggedTabs();
    const has = tabs.includes(tabId);
    if (tagged === has) return;
    await setTaggedTabs(tagged ? [...tabs, tabId] : tabs.filter((t) => t !== tabId));
    await syncSessionRules();
  });
}

async function isEnforcedAiHost(host) {
  const provider = G.providerForHost(host);
  if (!provider) return false;
  const { config } = await G.loadConfig();
  return config.ProviderModes[provider.id] === "enforce";
}

// A tab stays tagged while it moves between an AI service and identity-provider pages
// (the sign-in round trip), and is untagged once it goes anywhere else.
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  let host;
  try {
    host = new URL(details.url).hostname;
  } catch (_) {
    return;
  }
  if (await isEnforcedAiHost(host)) {
    updateTag(details.tabId, true);
  } else if (!G.identityProviderForHost(host) && !G.hostMatches(host, "google.com")) {
    updateTag(details.tabId, false);
  }
});

// Sign-in popups opened from a tagged tab inherit the tag.
chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
  if ((await getTaggedTabs()).includes(details.sourceTabId)) updateTag(details.tabId, true);
});

chrome.tabs.onRemoved.addListener((tabId) => updateTag(tabId, false));

chrome.tabs.onReplaced.addListener(async (addedTabId, removedTabId) => {
  if ((await getTaggedTabs()).includes(removedTabId)) {
    await updateTag(removedTabId, false);
    await updateTag(addedTabId, true);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "managed" || area === "local") syncAll();
  // New or changed dashboard connection: fetch its settings now. (Not for the extension's own
  // writes of the fetched settings or the device id.)
  if (area === "managed" || (area === "local" && changes.devManaged)) syncDashboard();
});

chrome.runtime.onStartup.addListener(async () => {
  syncAll();
  if (!(await chrome.alarms.get(SYNC_ALARM))) chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_MINUTES });
  syncDashboard();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  await setTaggedTabs([]);
  await syncAll();
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_MINUTES });
  await syncDashboard();
  if (details.reason === "install") {
    await signOutIfConfigured();
    // Self-installed and not configured yet: open settings so the user can add a domain.
    if ((await G.loadConfig()).source === "default") chrome.runtime.openOptionsPage();
  }
});

// Clears cookies and site storage for covered AI services so personal sessions that
// existed before rollout are ended. Services hosted on shared Google/Microsoft domains
// are skipped (clearing would sign users out of everything); tenant restrictions cover them.
async function signOutIfConfigured() {
  const { config } = await G.loadConfig();
  if (!config.SignOutOnInstall) return;
  const origins = G.PROVIDERS
    .filter((p) => p.clearSessionsOnInstall && config.ProviderModes[p.id] !== "off")
    .flatMap((p) => p.domains.map((d) => "https://" + d));
  await chrome.browsingData.remove(
    { origins },
    { cookies: true, localStorage: true, indexedDB: true, cacheStorage: true, serviceWorkers: true }
  );
}

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// ---- Dashboard ------------------------------------------------------------------------------
// When IT deploys DashboardUrl + DashboardOrgKey, settings come from that dashboard: fetched
// at startup, when the policy changes, and every SYNC_MINUTES, verified, and kept in
// chrome.storage.local (loadConfig verifies them again on every read). Organizations that
// don't use a dashboard never reach any of this: the extension makes no requests of its own.

const SYNC_ALARM = "dashboard-sync";
const RETRY_ALARM = "dashboard-retry";
const SYNC_MINUTES = 360;
const RETRY_MINUTES = 5;

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM || alarm.name === RETRY_ALARM) syncDashboard();
});

let syncing = null;
function syncDashboard() {
  syncing = syncing || fetchDashboardSettings().finally(() => (syncing = null));
  return syncing;
}

async function fetchDashboardSettings() {
  const conn = G.dashboardFromPolicy(await G.readManaged(chrome.storage));
  if (!conn || conn.invalid) return;
  const STORE = G.DASHBOARD_STORE;
  const stored = (await chrome.storage.local.get(STORE))[STORE] || {};
  const current = await G.verifyDashboardDocument(stored, conn.orgKey, conn.origin);
  const next = { ...stored, checkedAt: new Date().toISOString(), error: null };

  try {
    const url = `${conn.origin}/api/v1/settings${current ? `?since=${current.revision}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${conn.orgKey}` }, cache: "no-store", credentials: "omit" });
    if (res.status === 200) {
      const body = await res.json();
      const doc = await G.verifyDashboardDocument(body, conn.orgKey, conn.origin);
      if (!doc) {
        next.error = "bad-signature";
      } else if (!current || doc.revision >= current.revision) {
        // Never step back to an older revision.
        next.payload = body.payload;
        next.signature = body.signature;
      }
      next.coverage = body.coverage === true;
    } else if (res.status === 204) {
      next.coverage = res.headers.get("X-AAG-Coverage") === "on";
    } else if (res.status === 401) {
      next.error = "unknown-organization";
    } else if (res.status !== 404) {
      next.error = "unreachable";
    }
  } catch (_) {
    next.error = "unreachable";
  }

  await chrome.storage.local.set({ [STORE]: next });
  // Until good settings arrive, every sign-in is blocked: try again soon rather than in 6 hours.
  if (!(await G.verifyDashboardDocument(next, conn.orgKey, conn.origin))) {
    chrome.alarms.create(RETRY_ALARM, { delayInMinutes: RETRY_MINUTES });
  }
  if (next.coverage) await sendCheckIn(conn);
}

// Coverage check-in: the extension's own state only (see the privacy policy). Sent only when
// the organization turned coverage reporting on in the dashboard.
async function sendCheckIn(conn) {
  try {
    const { config, source, dashboard } = await G.loadConfig();
    const installType = await G.getInstallType();
    const report = G.statusReport({ config, source, installType, dashboard });
    let { deviceId } = await chrome.storage.local.get("deviceId");
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      await chrome.storage.local.set({ deviceId });
    }
    const ua = navigator.userAgent;
    const edge = /\bEdg\//.test(ua);
    const browserVersion = (ua.match(edge ? /\bEdg\/([\d.]+)/ : /\bChrome\/([\d.]+)/) || [])[1] || "0";
    await fetch(`${conn.origin}/api/v1/checkin`, {
      method: "POST",
      headers: { Authorization: `Bearer ${conn.orgKey}`, "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({
        deviceId,
        browser: edge ? "edge" : "chrome",
        browserVersion,
        extensionVersion: chrome.runtime.getManifest().version,
        installType,
        settingsRevision: dashboard ? dashboard.revision : null,
        problems: report.problems.map((p) => p.code).filter(Boolean),
      }),
    });
  } catch (_) {
    // A missed check-in is fine; the next sync sends another.
  }
}

// Content scripts and extension pages ask the worker for the active config, so there is
// one place that decides between managed and local settings.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "syncDashboard") {
    syncDashboard().then(() => sendResponse({ done: true }));
    return true;
  }
  if (message && message.type === "getConfig") {
    G.loadConfig().then(sendResponse);
    return true;
  }
  return false;
});
