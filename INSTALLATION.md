# Stream Bridge · Prototyp 0.3.0

1. ZIP vollständig entpacken.
2. `chrome://extensions` öffnen (Edge: `edge://extensions`, Brave: `brave://extensions`).
3. **Entwicklermodus** einschalten, **Entpackte Erweiterung laden** wählen und den Ordner auswählen, in dem `manifest.json` liegt.
4. Im selben Browserprofil `https://www.youtube.com/` öffnen und das Konto mit **YouTube Premium** auswählen. Eine eventuelle YouTube-Cookie-Abfrage selbst abschließen.
5. Eine Twitch-Kanalseite öffnen oder neu laden. Im Videobereich erscheint der kanalbezogene **Stream Bridge**-Umschalter. Das Add-on sucht im geladenen Profil und in den Infopanels nach verlinkten YouTube-Kanälen. Falls keine Links gefunden werden, den **Info-/About-Bereich** des Kanals öffnen; nachgeladene Links werden automatisch geprüft.
6. Wenn der ausgewählte Streamer auf YouTube live ist, **YouTube ansehen** klicken. Falls nötig anschließend im Player auf Play klicken. Der Twitch-Chat bleibt auf der Seite. YouTube nutzt die gesamte ursprüngliche Playerfläche.

Über das Erweiterungsicon in der Browserleiste öffnest du das externe Menü. Dort lässt sich **Automatisch zu YouTube** ein- und ausschalten. Die Einstellung ist anfangs aus, wird lokal im Browserprofil gespeichert und gilt auch für bereits geöffnete Twitch-Tabs. Bei eingeschalteter Automatik öffnet das Add-on einen eindeutig erkannten, öffentlichen YouTube-Livestream selbstständig. Ausschalten beendet einen bereits geöffneten YouTube-Player nicht; weitere Wechsel erfolgen wieder manuell. Eine regelmäßige Hintergrundabfrage kommt dadurch nicht hinzu.

Der Abo-Schutz gilt auch für die Automatik: Bei einem aktiven oder noch unklaren Kanal-Abo bleibt Twitch aktiv. Erst wenn Twitch bestätigt, dass kein Kanal-Abo besteht, ist ein Wechsel möglich.

Während der YouTube-Wiedergabe ersetzt ein kleiner **⋯-Knopf oben rechts** den bisherigen Banner. Darüber sind **Zurück zu Twitch**, **Auf YouTube öffnen** und **YouTube-Konto & Premium** erreichbar. Das Menü liegt über dem Video und verkleinert es nicht. Mit **×**, **Escape** oder einem Klick in den Chat lässt es sich schließen.

Twitchs kleine Vorschau über dem Chat, die bei Werbepausen erscheinen kann, wird im YouTube-Modus ausgeblendet und ihr Platz freigegeben. Beim Verlassen des YouTube-Modus gilt wieder Twitchs eigener Zustand.

Wenn kein öffentlicher YouTube-Livestream läuft, bleibt Twitch aktiv. **Erneut prüfen** sucht erneut; eine regelmäßige Hintergrundabfrage findet nicht statt. Der Pfeil im Panel klappt es zu einem kleinen Kanalhinweis ein. STYLERZ und ColtHavok bleiben zusätzlich fest eingerichtet.

## Update von einer älteren Version

Die Dateien im bisher geladenen Erweiterungsordner durch die neuen Dateien ersetzen und unter `chrome://extensions` die Erweiterung **neu laden ↻**. Alternativ die alte Version deaktivieren und den neuen entpackten Ordner laden. **Nicht beide Versionen gleichzeitig aktiv lassen.** Anschließend die Twitch-Seite neu laden.

## Dein Premium-Konto

Der normale YouTube-Player nutzt die YouTube-Anmeldung deines Browserprofils. Das Add-on verlangt keine Passwörter und liest keine Cookie-Werte aus.

**Premium lässt sich vom Add-on nicht automatisch bestätigen oder erzwingen.** Falls im eingebetteten Player trotz Premium Werbung erscheint, auf YouTube das richtige Konto prüfen und auf der Twitch-Seite YouTube-Drittanbieter-Cookies erlauben. Dafür eine Ausnahme für diese Seite verwenden; nicht global den Cookie-Schutz ausschalten. Danach Twitch neu laden und erneut wechseln.

YouTube beschreibt diese Voraussetzung in seiner offiziellen Hilfe: https://support.google.com/youtube/answer/7437519?hl=de

**Auf YouTube öffnen** öffnet den Stream alternativ direkt auf YouTube. Im aktiven YouTube-Modus wird dabei der eingebettete Player entfernt, um doppelte Wiedergabe zu vermeiden. Twitch-Video bleibt angehalten, der Chat steht im Twitch-Tab weiter zur Verfügung.

**Zurück zu Twitch ↻** hebt die temporäre Videosperre auf und lädt Twitch neu. Ungesendeter Chattext kann beim Neuladen verloren gehen.

Auch bei eingeschalteter Automatik bleibt dieser Kanal danach im selben Tab auf Twitch, einschließlich weiterer Neuladungen. Andere Kanäle und Tabs nutzen weiterhin die Automatik. Schalte die Automatik im externen Menü aus und wieder ein, um den automatischen Wechsel auch für diesen Kanal im Tab erneut zu erlauben. Beim Schließen des Tabs wird diese Ausnahme gelöscht.

## Umfang

- Automatische Zuordnung über YouTube-Kanallinks im geladenen Twitch-Profil: `@Handle`, `/channel/UC…`, `/c/Name`, `/user/Name` und ältere direkte Kanalnamen. Keine Namenssuche, Link-Aggregatoren oder einzelnen Videolinks. Chatlinks und Empfehlungen zählen nicht als Kanalzuordnung.
- Bis zu fünf verschiedene Kanal-URLs werden geprüft. Sind mehrere Kanäle live oder ist eine Prüfung nicht möglich, erfolgt keine automatische Auswahl. Twitch spielt weiter.
- Die bisherigen festen Zuordnungen für STYLERZ und ColtHavok bleiben erhalten.
- Suchergebnisse und Player werden zwischen Streamern getrennt; ein Kanalwechsel beendet den vorherigen Player.
- Twitch-Videodaten werden im umgeschalteten Tab angehalten. Andere Tabs bleiben verfügbar.
- Zurückwechseln, Neuladen und Kanalwechsel entfernen die Videosperre.
- Der Player bietet seine normalen YouTube-Funktionen. Im Player-Vollbild ist der Twitch-Chat nicht sichtbar.
- Keine Zeitanpassung oder automatische Synchronisation; das folgt später.
- Kein Werbeblocker. Werbung/Sponsoring im eigentlichen Stream bleibt sichtbar.
- Kein Backend, keine Telemetrie, keine Zugangsdaten im Add-on, keine dauernde Hintergrundabfrage.

Die Erweiterung benötigt Zugriff auf Twitch für den Umschalter, auf YouTube für die Stream-Erkennung und auf `*.ttvnw.net` samt temporären Chromium-Netzwerkregeln, um Twitch-Videodaten in diesem Tab anzuhalten. Die Berechtigung `storage` speichert den Automatik-Schalter lokal sowie die Rückkehr zu Twitch je Tab für die Browsersitzung. Der Browser darf für die Kanalabfrage seine vorhandene YouTube-Sitzung mitsenden. Ausgewertet werden nur Kanal- und Stream-Metadaten. Keine Cookie-Berechtigung und kein Auslesen von Passwörtern oder Tokens.

Ein unabhängiger, lokal installierter Prototyp; keine Verbindung zu Twitch, YouTube oder den Streamern.
