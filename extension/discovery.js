(() => {
  "use strict";
  const CONFIG = globalThis.StylerzBridgeConfig;
  // Only the broadcaster's profile/panels are evidence. Chat, recommendations
  // and arbitrary YouTube links elsewhere on the page are deliberately ignored.
  const PROFILE_LINKS = [
    '[data-a-target="social-media-link"]',
    '.social-media-link a[href]',
    '.about-section a[href]',
    '.channel-panels a[href]',
    '[data-a-target="channel-panel"] a[href]',
    '[data-a-target="about-panel"] a[href]',
  ].join(",");
  globalThis.StreamBridgeDiscovery = Object.freeze({
    collect(document, channel) {
      if (!channel) return [];
      // Twitch keeps old profile DOM briefly during SPA navigation. Wait until
      // its channel heading belongs to the route before trusting its links.
      const headings = [...document.querySelectorAll('[data-a-target="channel-home-link"], [data-a-target="channel-home-tab-About"], a:has(h1)')]
        .filter((link) => !link.closest('.chat-room, .stream-chat'));
      if (!headings.some((link) => CONFIG.channelForUrl(link.href)?.twitchLogin === channel.twitchLogin) ||
          headings.some((link) => CONFIG.channelForUrl(link.href)?.twitchLogin !== channel.twitchLogin)) return [];
      const profileHeading = document.querySelector('[data-a-target="about-panel"] h3');
      if (profileHeading && !new RegExp(`(?:^|[^a-z0-9_])${channel.twitchLogin}(?:$|[^a-z0-9_])`, "i").test(profileHeading.textContent)) return [];
      const urls = new Set();
      for (const link of document.querySelectorAll(PROFILE_LINKS)) {
        if (link.closest('.chat-room, .stream-chat, [data-a-target="chat-scroller"], .recommended-channels')) continue;
        const url = CONFIG.youtubeChannelUrl(link.href);
        if (url) urls.add(url);
        if (urls.size === 6) break;
      }
      return [...urls].sort();
    },
  });
})();
