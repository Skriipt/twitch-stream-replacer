import "./config.js";

const CONFIG = globalThis.StylerzBridgeConfig;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

// Read only JSON literals from public HTML. Never evaluate YouTube's scripts.
export function extractJson(html, variable) {
  const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:var\\s+${escaped}|window\\["${escaped}"\\]|${escaped})\\s*=\\s*`).exec(html);
  if (!match) return null;
  const start = match.index + match[0].length;
  if (html[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escapedChar = false;
  for (let i = start; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (escapedChar) escapedChar = false;
      else if (char === "\\") escapedChar = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) {
      try { return JSON.parse(html.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

function visit(value, fn) {
  if (!value || typeof value !== "object") return;
  fn(value);
  for (const child of Object.values(value)) visit(child, fn);
}

function hasLiveBadge(renderer) {
  let live = false;
  visit(renderer, (node) => {
    // "animatedText: Läuft gerade" is also present on archived broadcasts.
    // Only machine-readable live badge styles identify an active stream.
    if (node.style === "LIVE" || node.style === "BADGE_STYLE_TYPE_LIVE_NOW" ||
        node.badgeStyle === "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE") live = true;
  });
  return live;
}

export function findLiveCandidates(data, channel = CONFIG.channels[0]) {
  const owner = data?.metadata?.channelMetadataRenderer?.externalId;
  if (owner !== channel.channelId) throw new Error("Der YouTube-Kanal konnte nicht sicher bestätigt werden.");
  const ids = new Set();
  let cards = 0;
  visit(data.contents, (node) => {
    const renderer = node.videoRenderer || node.gridVideoRenderer || node.lockupViewModel;
    if (!renderer) return;
    cards += 1;
    if (!hasLiveBadge(renderer)) return;
    const id = renderer.videoId || renderer.contentId;
    if (VIDEO_ID.test(id)) ids.add(id);
  });
  if (cards === 0) throw new Error("Die Stream-Liste hat ein unbekanntes Format. Bitte direkt auf YouTube prüfen.");
  return [...ids];
}

export function validateLivePlayer(player, channel = CONFIG.channels[0]) {
  const video = player?.videoDetails;
  if (!video && player?.playabilityStatus?.status === "LOGIN_REQUIRED") {
    throw new Error("YouTube verlangt für die Wiedergabe eine Anmeldung oder Browser-Bestätigung. Bitte YouTube direkt öffnen und danach erneut prüfen.");
  }
  if (!video || !VIDEO_ID.test(video.videoId) || video.channelId !== channel.channelId) {
    throw new Error(`Dieser Stream gehört nicht zum bestätigten ${channel.displayName}-Kanal.`);
  }
  const live = player.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
  if (live?.isLiveNow !== true || live.endTimestamp) return null;
  if (player.playabilityStatus?.status !== "OK") {
    throw new Error("YouTube erlaubt die Wiedergabe derzeit nicht. Öffne den Stream direkt auf YouTube.");
  }
  if (player.playabilityStatus.playableInEmbed === false) {
    throw new Error("Dieser Livestream darf nicht eingebettet werden.");
  }
  return { videoId: video.videoId, title: video.title || `${channel.displayName} Live`, channelId: video.channelId };
}

async function fetchPublicPage(url) {
  let response;
  try {
    response = await fetch(url, {
      // The browser attaches its existing YouTube consent/login session. The
      // extension never reads cookie values or extracts account information.
      credentials: "include",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: { "Accept-Language": "en-US,en;q=0.9" },
    });
  } catch {
    throw new Error("YouTube ist nicht erreichbar. Bitte YouTube direkt öffnen und anschließend erneut prüfen.");
  }
  if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
    throw new Error("Bitte YouTube direkt öffnen und eine eventuelle Cookie-/Anmelde-Abfrage abschließen. Danach erneut prüfen.");
  }
  if (!response.ok) throw new Error(`YouTube ist gerade nicht erreichbar (HTTP ${response.status}).`);
  if (new URL(response.url).hostname !== "www.youtube.com") {
    throw new Error("YouTube verlangt eine Bestätigung. Öffne YouTube einmal direkt im Browser.");
  }
  const html = await response.text();
  if (html.length > 5_000_000) throw new Error("Die YouTube-Antwort ist unerwartet groß.");
  return html;
}

export async function resolveLiveStream(channel = CONFIG.channels[0]) {
  // /live normally redirects to a watch page, but redirects to a consent host
  // would need unrelated host access. /streams has a stable channel identity.
  const html = await fetchPublicPage(channel.youtubeStreams);
  const data = extractJson(html, "ytInitialData");
  if (!data) throw new Error("Die YouTube-Seite konnte nicht gelesen werden. Bitte später erneut prüfen.");
  const candidates = findLiveCandidates(data, channel);
  if (candidates.length > 1) throw new Error(`Mehrere ${channel.displayName}-Livestreams gefunden. Bitte direkt auf YouTube auswählen.`);
  if (candidates.length === 0) return { state: "offline" };
  const candidate = extractJson(await fetchPublicPage(`https://www.youtube.com/watch?v=${candidates[0]}`), "ytInitialPlayerResponse");
  if (!candidate) throw new Error("Der Livestream konnte nicht bestätigt werden. Bitte direkt auf YouTube prüfen.");
  const stream = validateLivePlayer(candidate, channel);
  return stream ? { state: "live", ...stream } : { state: "offline" };
}
