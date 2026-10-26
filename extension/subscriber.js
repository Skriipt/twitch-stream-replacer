// Runs in Twitch's MAIN world via chrome.scripting.executeScript. Keep this
// function self-contained: Chrome serializes it without its module scope.
export function detectSubscription(expectedLogin) {
  const unknown = () => ({ state: "unknown", twitchLogin: expectedLogin });
  const login = /^\/([a-zA-Z0-9_]{3,25})(?:\/about)?\/?$/.exec(location.pathname)?.[1].toLowerCase();
  if (location.origin !== "https://www.twitch.tv" || login !== expectedLogin) return unknown();

  // Use the committed React tree, never a DOM node's possibly stale alternate.
  // Twitch's PlayerTrackingContextQuery supplies data.currentUser and
  // data.user.{login,self.subscriptionBenefit}; no tokens or cookies are read.
  const player = document.querySelector('[data-a-target="video-player"], .video-player, .channel-root__player');
  if (!player) return unknown();
  const key = Object.keys(player).find((name) => name.startsWith("__reactFiber$") || name.startsWith("__reactInternalInstance$"));
  let root = key && player[key];
  let depth = 0;
  while (root?.return && depth++ < 200) root = root.return;
  const current = root?.stateNode?.current;
  if (!current || root.return) return unknown();

  const stack = [current];
  const visited = new Set();
  const states = new Set();
  const viewers = new Set();
  let foundPlayer = false;
  while (stack.length) {
    const fiber = stack.pop();
    if (visited.has(fiber)) return unknown();
    visited.add(fiber);
    if (visited.size > 20_000) return unknown();
    if (fiber.stateNode === player) foundPlayer = true;
    const data = fiber.memoizedProps?.data;
    const user = data?.user;
    if (typeof user?.login === "string" && user.login.toLowerCase() === expectedLogin &&
        Object.hasOwn(data, "currentUser")) {
      if (data.loading || data.error || data.errors?.length) return unknown();
      const viewer = data.currentUser;
      if (viewer === null) {
        viewers.add("signed-out");
        // A stale signed-in benefit during logout is not a negative result.
        if (user.self?.subscriptionBenefit != null) return unknown();
        states.add("not-subscribed");
      } else if (typeof viewer?.id === "string" && viewer.id) {
        viewers.add(viewer.id);
        if (user.self && Object.hasOwn(user.self, "subscriptionBenefit")) {
          const benefit = user.self.subscriptionBenefit;
          if (benefit === null) states.add("not-subscribed");
          else if (typeof benefit?.id === "string" && benefit.id) states.add("subscribed");
          else return unknown();
        }
      }
    }
    if (fiber.sibling) stack.push(fiber.sibling);
    if (fiber.child) stack.push(fiber.child);
  }
  if (!foundPlayer || viewers.size !== 1 || states.size !== 1) return unknown();
  return { state: [...states][0], twitchLogin: expectedLogin };
}
