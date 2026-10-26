const toggle = document.getElementById("auto-switch");
const status = document.getElementById("setting-status");
let saved = false;
let revision = 0;

function show(enabled) {
  saved = enabled;
  toggle.checked = enabled;
  status.textContent = enabled ? "Ein · Erkannte Livestreams automatisch öffnen." : "Aus · Du wechselst manuell zu YouTube.";
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.autoSwitchToYouTube) return;
  revision += 1;
  show(changes.autoSwitchToYouTube.newValue === true);
});

try {
  const token = revision;
  const settings = await chrome.storage.local.get({ autoSwitchToYouTube: false });
  if (token === revision) show(settings.autoSwitchToYouTube === true);
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
