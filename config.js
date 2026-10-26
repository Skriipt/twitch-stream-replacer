(() => {
  const channels = Object.freeze([
    Object.freeze({ displayName: "STYLERZ", twitchLogin: "stylerz", channelId: "UC6NBwF9A5P2ni8YRvVHgvsA", youtubeHandle: "@STYLERZlive", youtubeStreams: "https://www.youtube.com/@STYLERZlive/streams" }),
    Object.freeze({ displayName: "ColtHavok", twitchLogin: "colthavok", channelId: "UCu96Aisal2MrRF0fDKGLuoQ", youtubeHandle: "@ColtHavok", youtubeStreams: "https://www.youtube.com/@ColtHavok/streams" }),
  ]);
  const reserved = new Set(["directory", "downloads", "friends", "inventory", "jobs", "login", "logout", "messages", "moderator", "p", "payments", "prime", "products", "search", "settings", "signup", "store", "subscriptions", "team", "turbo", "videos", "wallet", "collections", "drops", "following", "creatorcamp"]);
  const youtubeReserved = new Set(["watch", "playlist", "feed", "results", "redirect", "embed", "shorts", "live", "gaming", "premium", "account", "signin", "logout", "reporthistory", "upload", "t", "channel", "c", "user"]);
  function youtubeChannelUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.port ||
          !["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) return null;
      const parts = url.pathname.split("/").filter(Boolean);
      let path;
      if (/^@[^/]+$/u.test(parts[0] || "")) path = parts[0];
      else if (parts[0] === "channel" && /^UC[A-Za-z0-9_-]{22}$/.test(parts[1] || "")) path = `channel/${parts[1]}`;
      else if (["c", "user"].includes(parts[0]) && /^[A-Za-z0-9_.-]+$/.test(parts[1] || "")) path = `${parts[0]}/${parts[1]}`;
      else if (/^[A-Za-z0-9_.-]{3,}$/.test(parts[0] || "") && !youtubeReserved.has(parts[0].toLowerCase())) path = parts[0];
      else return null;
      const baseLength = path.includes("/") ? 2 : 1;
      if (parts.length > baseLength && (parts.length !== baseLength + 1 ||
          !["streams", "live", "videos", "featured", "about", "shorts"].includes(parts[baseLength]))) return null;
      return `https://www.youtube.com/${path}/streams`;
    } catch { return null; }
  }
  globalThis.StylerzBridgeConfig = Object.freeze({
    channels,
    youtubeChannelUrl,
    channelForUrl(url) {
      try {
        const parsed = new URL(url);
        if (parsed.origin !== "https://www.twitch.tv") return null;
        const match = /^\/([a-zA-Z0-9_]{3,25})(?:\/about)?\/?$/.exec(parsed.pathname);
        const login = match?.[1].toLowerCase();
        if (!login || reserved.has(login)) return null;
        return channels.find((channel) => channel.twitchLogin === login) || { twitchLogin: login, displayName: login };
      } catch { return null; }
    },
  });
})();
