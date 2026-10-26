export const CHANNEL = "UCaaaaaaaaaaaaaaaaaaaaaa";
export const SECOND_CHANNEL = "UCbbbbbbbbbbbbbbbbbbbbbb";
export const VIDEO = "abcdefghijk";
export const SECOND_VIDEO = "lmnopqrstuv";
export function listing(channelId = CHANNEL, videos = [VIDEO]) {
  return {
    metadata: { channelMetadataRenderer: { externalId: channelId, title: "Creator" } },
    contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { content: { richGridRenderer: { contents:
      (videos.length ? videos : ["archived1234"]).map((videoId) => ({ richItemRenderer: { content: { videoRenderer: {
        videoId, thumbnailOverlays: [{ thumbnailOverlayTimeStatusRenderer: { style: videos.length ? "LIVE" : "DEFAULT" } }],
      } } } })),
    } } } }] } },
  };
}
export function player(channelId = CHANNEL, videoId = VIDEO, overrides = {}) {
  return {
    videoDetails: { videoId, channelId, title: "Creator live <test>" },
    microformat: { playerMicroformatRenderer: { liveBroadcastDetails: { isLiveNow: true } } },
    playabilityStatus: { status: "OK", playableInEmbed: true },
    ...overrides,
  };
}
export const pageJson = (name, data) => `<html><script>var ${name} = ${JSON.stringify(data)};</script></html>`;
export const profileUrl = "https://www.youtube.com/@creator/streams";
export function publicResponse(url, html, status = 200) {
  const response = new Response(html, { status });
  Object.defineProperty(response, "url", { value: url });
  return response;
}
