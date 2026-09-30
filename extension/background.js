// Background service worker: keeps declarativeNetRequest rules in sync with the current
// config and tracks which tabs are part of an AI sign-in flow.
importScripts("shared/providers.js", "shared/config.js", "shared/rules.js");

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

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "managed" || area === "local") syncAll();
});

chrome.runtime.onStartup.addListener(() => syncAll());

chrome.runtime.onInstalled.addListener(async (details) => {
  await setTaggedTabs([]);
  await syncAll();
  if (details.reason === "install") await signOutIfConfigured();
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

// Content scripts and extension pages ask the worker for the active config, so there is
// one place that decides between managed and local settings.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "getConfig") {
    G.loadConfig().then(sendResponse);
    return true;
  }
  return false;
});
