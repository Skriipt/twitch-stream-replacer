(() => {
  const channels = Object.freeze([
    Object.freeze({ displayName: "STYLERZ", twitchLogin: "stylerz", channelId: "UC6NBwF9A5P2ni8YRvVHgvsA", youtubeHandle: "@STYLERZlive", youtubeStreams: "https://www.youtube.com/@STYLERZlive/streams" }),
    Object.freeze({ displayName: "ColtHavok", twitchLogin: "colthavok", channelId: "UCu96Aisal2MrRF0fDKGLuoQ", youtubeHandle: "@ColtHavok", youtubeStreams: "https://www.youtube.com/@ColtHavok/streams" }),
  ]);
  globalThis.StylerzBridgeConfig = Object.freeze({
    channels,
    channelForUrl(url) {
      try {
        const parsed = new URL(url);
        if (parsed.origin !== "https://www.twitch.tv") return null;
        const login = parsed.pathname.replace(/\/$/, "").slice(1).toLowerCase();
        return channels.find((channel) => channel.twitchLogin === login) || null;
      } catch { return null; }
    },
  });
})();
