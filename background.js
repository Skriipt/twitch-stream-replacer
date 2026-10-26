import "./config.js";
import { resolveLiveStream } from "./resolver.js";

const CONFIG = globalThis.StylerzBridgeConfig;
const cached = new Map();
const pending = new Map();
let ruleQueue = Promise.resolve();

function isChannel(url) {
  return Boolean(CONFIG.channelForUrl(url));
}

async function lookup(channel, force = false) {
  const key = channel.twitchLogin;
  const previous = cached.get(key);
  if (!force && previous && Date.now() - previous.checkedAt < 30_000) return previous;
  if (!pending.has(key)) {
    pending.set(key, resolveLiveStream(channel).then((result) => {
      const value = { ...result, twitchLogin: key, checkedAt: Date.now() };
      cached.set(key, value);
      return value;
    }).finally(() => { pending.delete(key); }));
  }
  return pending.get(key);
}

// All tabs share the rule ID space. Serialize updates globally so simultaneous
// activation in two streamer tabs cannot overwrite the other's video rule.
function setSuspended(tabId, suspended, expectedLogin) {
  const operation = ruleQueue.catch(() => {}).then(async () => {
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    const owned = rules.filter((rule) => rule.condition.tabIds?.includes(tabId));
    if (!suspended && owned.length === 0) return;
    const removeRuleIds = owned.map((rule) => rule.id);
    const addRules = [];
    if (suspended) {
      const tab = await chrome.tabs.get(tabId);
      const channel = CONFIG.channelForUrl(tab.url);
      if (!channel || channel.twitchLogin !== expectedLogin) throw new Error("Der Twitch-Kanal hat sich geändert. Bitte erneut prüfen.");
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
      return lookup(channel, message.force === true);
    }
    if (message?.type === "SUSPEND") {
      await setSuspended(sender.tab.id, true, message.twitchLogin);
      return { state: "suspended" };
    }
    if (message?.type === "RESUME") {
      await setSuspended(sender.tab.id, false);
      return { state: "resumed" };
    }
    throw new Error("Unbekannte Anfrage.");
  };
  task().then((result) => respond({ ok: true, result }), (error) => respond({ ok: false, error: error.message }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url?.startsWith("https://www.twitch.tv/")) {
    void chrome.tabs.sendMessage(tabId, { type: "ROUTE_CHANGED" }, { frameId: 0 }).catch(() => {});
  }
  // Clear on any real navigation/reload, including a reload of /stylerz itself.
  if (change.status === "loading" || (change.url && !isChannel(change.url))) {
    void setSuspended(tabId, false).catch(() => {});
  }
});
chrome.tabs.onRemoved.addListener((tabId) => { void setSuspended(tabId, false).catch(() => {}); });
