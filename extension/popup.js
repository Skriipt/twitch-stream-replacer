const toggle = document.getElementById("auto-switch");
const status = document.getElementById("setting-status");
let saved = false;
let revision = 0;

function show(enabled) {
  saved = enabled;
  toggle.checked = enabled;
  status.textContent = enabled ? "Ein · Erkannte Livestreams automatisch öffnen." : "Aus · Du wechselst manuell zu YouTube.";
}

const list = document.getElementById("favorites");
const empty = document.getElementById("favorites-empty");

function showFavorites(logins) {
  const names = Array.isArray(logins) ? logins.filter((name) => typeof name === "string") : [];
  list.replaceChildren(...names.map((name) => {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.title = remove.ariaLabel = `${name} aus Favoriten entfernen`;
    remove.addEventListener("click", async () => {
      try {
        const stored = (await chrome.storage.local.get({ favorites: [] })).favorites;
        await chrome.storage.local.set({ favorites: (Array.isArray(stored) ? stored : []).filter((entry) => entry !== name) });
      } catch {
        status.textContent = "Speichern fehlgeschlagen. Bitte erneut versuchen.";
      }
    });
    item.append(label, remove);
    return item;
  }));
  empty.hidden = names.length > 0;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.favorites) showFavorites(changes.favorites.newValue);
  if (area !== "local" || !changes.autoSwitchToYouTube) return;
  revision += 1;
  show(changes.autoSwitchToYouTube.newValue === true);
});

try {
  const token = revision;
  const settings = await chrome.storage.local.get({ autoSwitchToYouTube: false, favorites: [] });
  if (token === revision) show(settings.autoSwitchToYouTube === true);
  showFavorites(settings.favorites);
  toggle.disabled = false;
} catch {
  status.textContent = "Einstellung konnte nicht geladen werden. Menü bitte erneut öffnen.";
}

toggle.addEventListener("change", async () => {
  const enabled = toggle.checked;
  toggle.disabled = true;
  try {
    // A new revision also releases a deliberate per-tab return to Twitch.
    await chrome.storage.local.set({ autoSwitchToYouTube: enabled, autoSwitchRevision: crypto.randomUUID() });
    show(enabled);
  } catch {
    toggle.checked = saved;
    status.textContent = "Speichern fehlgeschlagen. Bitte erneut versuchen.";
  } finally {
    toggle.disabled = false;
  }
});
