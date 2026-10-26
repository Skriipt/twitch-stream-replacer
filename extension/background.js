import "./config.js";
import { discoverLiveStream } from "./resolver.js";
import { detectSubscription } from "./subscriber.js";

const CONFIG = globalThis.StylerzBridgeConfig;
const cached = new Map();
const pending = new Map();
let ruleQueue = Promise.resolve();

const overrideKey = (tabId) => `twitchOverride:${tabId}`;
async function autoSwitchSettings(tabId, login) {
  const [settings, overrides] = await Promise.all([
    chrome.storage.local.get({ autoSwitchToYouTube: false, autoSwitchRevision: "" }),
    chrome.storage.session.get(overrideKey(tabId)),
  ]);
  const override = overrides[overrideKey(tabId)];
  const suppressed = override?.login === login && override.revision === settings.autoSwitchRevision;
  return { enabled: settings.autoSwitchToYouTube === true, suppressed };
}

function isChannel(url) {
  return Boolean(CONFIG.channelForUrl(url));
}

async function subscription(tabId, expectedLogin) {
  const tab = await chrome.tabs.get(tabId);
  const channel = CONFIG.channelForUrl(tab.url);
  if (!channel || channel.twitchLogin !== expectedLogin) throw new Error("Der Twitch-Kanal hat sich geändert. Bitte erneut prüfen.");
  let result;
  try {
    const frames = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] }, world: "MAIN",
      func: detectSubscription, args: [expectedLogin],
    });
    result = frames.find((frame) => frame.frameId === 0)?.result;
  } catch {
    // A missing page, changed Twitch implementation or injection failure is
    // never evidence that the viewer has no subscription.
  }
  const currentTab = await chrome.tabs.get(tabId);
  if (CONFIG.channelForUrl(currentTab.url)?.twitchLogin !== expectedLogin) throw new Error("Der Twitch-Kanal hat sich geändert. Bitte erneut prüfen.");
  const state = result?.twitchLogin === expectedLogin &&
    ["subscribed", "not-subscribed"].includes(result.state) ? result.state : "unknown";
  return { state, twitchLogin: expectedLogin, checkedAt: Date.now() };
}

async function lookup(channel, force = false, links = []) {
  // The DOM is untrusted input; only canonical YouTube channel URLs may leave
  // the worker. Include links in the cache key as panels can load late/change.
  const urls = [...new Set((Array.isArray(links) ? links : []).filter((url) => typeof url === "string")
    .map(CONFIG.youtubeChannelUrl).filter(Boolean))].sort();
  if (urls.length > 5) throw new Error("Zu viele YouTube-Kanäle verlinkt. Bitte direkt auf YouTube auswählen.");
  // Configured channels ignore profile links, so they must not split the cache.
  const key = JSON.stringify([channel.twitchLogin, channel.channelId ? [] : urls]);
  const previous = cached.get(key);
  if (!force && previous && Date.now() - previous.checkedAt < 30_000) return previous;
  if (!pending.has(key)) {
    pending.set(key, discoverLiveStream(channel, urls).then((result) => {
      const value = { ...result, twitchLogin: channel.twitchLogin, checkedAt: Date.now() };
      cached.set(key, value);
      if (!channel.channelId) void rememberLinks(channel.twitchLogin, urls);
      return value;
    }).finally(() => { pending.delete(key); }));
  }
  return pending.get(key);
}

// Profile links are only readable once Twitch has rendered the page. Remember
// them per channel so a later visit can start the YouTube lookup immediately.
const KNOWN_LINKS_KEY = "knownProfileLinks";
const KNOWN_LINKS_LIMIT = 25;
async function knownLinks() {
  try { return (await chrome.storage.local.get({ [KNOWN_LINKS_KEY]: {} }))[KNOWN_LINKS_KEY] || {}; } catch { return {}; }
}
async function rememberLinks(login, urls) {
  if (urls.length === 0) return;
  try {
    const known = await knownLinks();
    if (JSON.stringify(known[login]) === JSON.stringify(urls)) return;
    delete known[login];
    const entries = Object.entries({ ...known, [login]: urls }).slice(-KNOWN_LINKS_LIMIT);
    await chrome.storage.local.set({ [KNOWN_LINKS_KEY]: Object.fromEntries(entries) });
  } catch {
    // Remembering links only speeds up later visits.
  }
}

// Fill the lookup cache while Twitch is still loading, before the content
// script and player exist. The page's own LOOKUP then finds it ready.
async function prewarm(url) {
  const channel = CONFIG.channelForUrl(url);
  if (!channel) return;
  const urls = channel.channelId ? [] : (await knownLinks())[channel.twitchLogin];
  if (!Array.isArray(urls) || (!channel.channelId && urls.length === 0)) return;
  await lookup(channel, false, urls);
}

// All tabs share the rule ID space. Serialize updates globally so simultaneous
// activation in two streamer tabs cannot overwrite the other's video rule.
function setSuspended(tabId, suspended, expectedLogin, automatic = false) {
  const operation = ruleQueue.catch(() => {}).then(async () => {
    if (suspended && automatic) {
      const settings = await autoSwitchSettings(tabId, expectedLogin);
      if (!settings.enabled || settings.suppressed) return false;
    }
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    const owned = rules.filter((rule) => rule.condition.tabIds?.includes(tabId));
    if (!suspended && owned.length === 0) return;
    const removeRuleIds = owned.map((rule) => rule.id);
    const addRules = [];
    if (suspended) {
      const tab = await chrome.tabs.get(tabId);
      const channel = CONFIG.channelForUrl(tab.url);
      if (!channel || channel.twitchLogin !== expectedLogin) throw new Error("Der Twitch-Kanal hat sich geändert. Bitte erneut prüfen.");
      // Enforce this in the serialized operation, immediately before blocking
      // media. A stale content-script result must never bypass the guard.
      const viewer = await subscription(tabId, expectedLogin);
      if (viewer.state === "subscribed") throw new Error("Aktives Kanal-Abo erkannt. Twitch läuft weiter.");
      if (viewer.state !== "not-subscribed") throw new Error("Abo-Status noch unklar. Twitch läuft weiter; bitte erneut prüfen.");
      const used = new Set(rules.filter((rule) => !removeRuleIds.includes(rule.id)).map((rule) => rule.id));
      let id = 1;
      while (used.has(id)) id += 1;
      addRules.push({
        id, priority: 1, action: { type: "block" },
        condition: {
          tabIds: [tabId], requestDomains: ["ttvnw.net"],
          resourceTypes: ["media", "xmlhttprequest", "other"],
        },
      });
    }
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds, addRules });
    return true;
  });
  ruleQueue = operation.catch(() => {});
  return operation;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.tab) return;
  try { if (new URL(sender.url).origin !== "https://www.twitch.tv") return; } catch { return; }
  const task = async () => {
    // MessageSender.url is the original document URL after history.pushState.
    // The tab URL tracks Twitch's current SPA route.
    if (message?.type === "LOOKUP") {
      const tab = await chrome.tabs.get(sender.tab.id);
      const channel = CONFIG.channelForUrl(tab.url);
      if (!channel || channel.twitchLogin !== message.twitchLogin) throw new Error("Der Twitch-Kanal hat sich geändert. Bitte erneut prüfen.");
      const [result, settings] = await Promise.all([
        lookup(channel, message.force === true, message.youtubeLinks),
        autoSwitchSettings(sender.tab.id, channel.twitchLogin),
      ]);
      return { ...result, autoSwitchSuppressed: settings.suppressed };
    }
    if (message?.type === "SUBSCRIPTION") return subscription(sender.tab.id, message.twitchLogin);
    if (message?.type === "SUSPEND") {
      const suspended = await setSuspended(sender.tab.id, true, message.twitchLogin, message.automatic === true);
      return { state: suspended ? "suspended" : "cancelled" };
    }
    if (message?.type === "RESUME") {
      if (message.keepTwitch === true) {
        const tab = await chrome.tabs.get(sender.tab.id);
        const channel = CONFIG.channelForUrl(tab.url);
        if (!channel || channel.twitchLogin !== message.twitchLogin) throw new Error("Der Twitch-Kanal hat sich geändert. Bitte erneut prüfen.");
        const settings = await chrome.storage.local.get({ autoSwitchRevision: "" });
        await chrome.storage.session.set({ [overrideKey(sender.tab.id)]: { login: channel.twitchLogin, revision: settings.autoSwitchRevision } });
      }
      await setSuspended(sender.tab.id, false);
      return { state: "resumed" };
    }
    throw new Error("Unbekannte Anfrage.");
  };
  task().then((result) => respond({ ok: true, result }), (error) => respond({ ok: false, error: error.message }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url?.startsWith("https://www.twitch.tv/")) {
    void chrome.tabs.sendMessage(tabId, { type: "ROUTE_CHANGED" }, { frameId: 0 }).catch(() => {});
  }
  const url = change.url ?? (change.status === "loading" ? tab?.url : undefined);
  if (url?.startsWith("https://www.twitch.tv/")) void prewarm(url).catch(() => {});
  // Clear on any real navigation/reload, including a reload of /stylerz itself.
  if (change.status === "loading" || (change.url && !isChannel(change.url))) {
    void setSuspended(tabId, false).catch(() => {});
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void setSuspended(tabId, false).catch(() => {});
  void chrome.storage.session.remove(overrideKey(tabId)).catch(() => {});
});
