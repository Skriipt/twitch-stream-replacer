# Channel subscription detection

Stream Bridge keeps Twitch playback when the viewer has an active subscription to the supported channel currently open. A confirmed missing subscription permits the manual YouTube switch and the optional automatic switch configured in the toolbar popup.

## State contract

The service worker handles `SUBSCRIPTION` messages from the extension's top-level Twitch content script. Results contain `state`, `twitchLogin`, and `checkedAt` (the snapshot time, not the server's data refresh time). The detector has no cache or persistent storage.

| State | Evidence | Replacement policy |
| --- | --- | --- |
| `subscribed` | Matching channel, identified viewer, and a nonempty `self.subscriptionBenefit.id`. | Keep Twitch; skip the YouTube lookup. |
| `not-subscribed` | Matching channel with an explicit null benefit for the identified viewer, or loaded signed-out `currentUser: null` data without a benefit. | Allow manual or opted-in automatic switching after checking for a live YouTube stream. |
| `unknown` | Missing/loading/error data, conflicting viewer or benefit states, unavailable React internals, navigation, or failed script execution. | Block new replacement attempts and retry the subscription check. |

Prime, gifted, paid, and nonrenewing subscriptions use the same active benefit. Prime eligibility, Turbo, follower/moderator flags, another viewer's chat badges, and subscribe-button text do not establish a channel subscription. An active benefit continues to count until Twitch removes it; disabling renewal alone does not mean it has expired.

## Data source and lifecycle

`subscriber.js` runs on demand through `chrome.scripting.executeScript` in the top-level page's `MAIN` world. It finds the Twitch player's React root and reads only its committed tree, including `data.currentUser` and `data.user.{login,self.subscriptionBenefit}`. Traversal is bounded and returns `unknown` for incomplete or conflicting evidence. It requires the player to belong to that committed tree and both the page route and data's broadcaster login to match the requested channel. Viewer IDs stay inside the injected function and are used only to reject mixed-account snapshots.

No OAuth setup, token/cookie reads, additional Twitch API requests, fetch interception, or page event bridge is involved. The additional `scripting` permission uses the existing `www.twitch.tv` host permission. The official [Check User Subscription API](https://dev.twitch.tv/docs/api/reference#check-user-subscription) would require a separate user authorization with `user:read:subscriptions`; this implementation uses the player's existing session data instead.

The content script checks on entry, on manual retry, before switching, every five seconds in a visible supported tab, and immediately after the tab becomes visible. The service worker repeats the check inside the serialized `SUSPEND` operation before adding any network rule. A late response from a previous channel is discarded. Navigation removes the polling timer and resets subscription state; different tabs do not share viewer results.

A subscription detected during YouTube playback releases the tab's blocking rule and reloads Twitch using the existing return-to-Twitch path. Unknown results during an already active replacement block new switches; they do not repeatedly interrupt playback. Hidden tabs skip polling and recheck on becoming visible.

## Source evidence and limits

Static inspection on 2026-10-26 of Twitch's publicly served [player tracking bundle](https://assets.twitch.tv/assets/54826-2b829d3f51f1b0efa879.js) confirmed `PlayerTrackingContextQuery`, `currentUser.id`, the broadcaster's `login`, and `user.self.subscriptionBenefit.id`. The tracker computes `subscriber` from that benefit through `this.props.data`. This establishes the data shape used by the detector, rather than relying on localized button labels.

This is a private Twitch/React integration, not a supported Twitch API. A future website change can leave the status `unknown` and keep replacement disabled. Re-reading the committed tree sees the latest data Twitch has loaded; it does not force Twitch to refresh its backend subscription data. A subscription bought in another tab or an expiration is visible only once Twitch updates the current page's data. Reloading Twitch requests fresh page data.

A live public-page check on 2026-10-26 with a fresh signed-out Chromium profile confirmed `not-subscribed` on the running ColtHavok stream, using the real extension and Twitch's actual player data. STYLERZ was offline and lacked the channel-specific player data, so the detector correctly stayed `unknown` there. Offline/missing player data is not treated as proof of a missing subscription.

The policy follows the channel subscription itself. Ad-free viewing is a benefit creators can enable, rather than a guarantee for every subscription; see [Twitch's subscription documentation](https://help.twitch.tv/s/article/how-to-subscribe?language=en_US). This feature does not independently verify ad immunity or YouTube Premium.

`npm test` covers the detector, the background message/rule guard, and the content-script lifecycle using synthetic React data, mocked Chrome APIs, and JSDOM. It includes paid/Prime/gift benefit shapes, explicit negatives, partial/error states, stale alternates, mixed accounts, channel races, two tabs, visibility, delayed responses, and restoration requests. `npm run check` checks all extension JavaScript files.

`npm run test:browser` additionally loads the actual unpacked Manifest V3 extension in Chromium with synthetic Twitch/YouTube responses. It checks real Chrome messaging, `MAIN`-world script execution, tab-scoped network rule creation, subscriber restoration/reload, and unknown-state blocking. The GitHub Actions workflow runs both suites.

These checks do not establish behavior in an authenticated Twitch session, a real purchase/expiration, or actual ad playback. Manually validate with a subscribed account, a nonsubscribed account, and signed-out playback on supported channels after reloading the extension and Twitch. The expected result is respectively a blocked switch, an available manual switch, and an available manual switch once the player data has loaded.
