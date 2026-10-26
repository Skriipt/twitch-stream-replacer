# Projektstand: Stream Bridge 0.3.0

Stand: 26. Oktober 2026. Version 0.3.0 baut auf dem unverändert übernommenen Prototyp 0.2.1 auf und ergänzt automatische Kanalzuordnung sowie eine kompaktere Oberfläche. Die folgende Historie trennt frühere Prüfberichte von den jetzt reproduzierbaren Checks.

## Neu in 0.3.0

- Weitere Twitch-Kanäle werden über direkte YouTube-Kanallinks im geladenen Profil und in den Infopanels zugeordnet. Unterstützt werden Handles, Kanal-IDs und ältere Kanal-URLs. Die beiden bisherigen festen Zuordnungen bleiben erhalten.
- Die Erkennung berücksichtigt nachgeladene Links und verwirft alte Ergebnisse nach Kanal- oder Linkwechseln. Twitch-Kanalüberschrift und vorhandene Profilüberschrift müssen zum aktuellen Kanal passen. Chatlinks und Empfehlungen bleiben außen vor.
- YouTube-Kanal-ID, Live-Status und Einbettbarkeit werden geprüft. Bis zu fünf unterschiedliche Kanal-URLs sind möglich. Bei mehreren live sendenden Kanälen oder einer fehlgeschlagenen Prüfung wird kein Player ausgewählt. Der Wechsel bleibt manuell.
- Das dunkle Panel ist kleiner und einklappbar. Der aktive Player behält die ganze Videofläche; das ⋯-Menü bleibt über dem Video. Das Popup erklärt die Erkennung und die YouTube-Anmeldung.

### Aktuelle Prüfungen

`npm test`: **26/26 bestanden**, davon 20 Logiktests und sechs Chromium-Integrationstests mit tatsächlich geladener Manifest-V3-Erweiterung. Die Integrationstests verwenden kontrollierte Twitch-/YouTube-Fixtures und echte Chromium-Session-Regeln. Abgedeckt sind nachgeladene Profillinks, mehrdeutige und beendete Streams, Änderungen während einer laufenden Suche, Kanalwechsel mit veraltetem Profil, zwei gleichzeitige Tabs, Playergröße, Einklappen, Tastaturbedienung, Menüs und Rückkehr zu Twitch.

Die Oberfläche wurde zusätzlich anhand von Chromium-Screenshots bei normaler und kleiner Playergröße sowie im Popup visuell geprüft. Ein öffentlicher Twitch-Info-Bereich wurde live auf seine DOM-Struktur geprüft; dabei wurden die tatsächlich verwendeten Kanalüberschriften und eine ältere YouTube-Kanal-URL in die Erkennung aufgenommen. Der öffentliche YouTube-Resolver bestätigte den verlinkten Kanal bei einer separaten Node-Abfrage als offline.

Ein weiterer Versuch mit der geladenen Erweiterung auf der echten Twitch-Seite erkannte den Profillink, konnte YouTube im frischen Chromium-Profil jedoch nicht erreichen. Damit sind **echte YouTube-Wiedergabe, Premium-Anmeldung und Twitch-Werbepausen für 0.3.0 nicht live bestätigt**. Der erfolgreiche Offline-Metadatenabruf in Node ersetzt diese Prüfung nicht.

### Grenzen der ersten Erkennung

Es werden nur direkte Kanal-URLs im aktuell geladenen Profil ausgewertet. Bei fehlenden Links hilft der Info-/About-Bereich. Namenssuche, Link-Aggregatoren, Videolinks und eine dauernde Hintergrundabfrage sind nicht implementiert. Ein neuer Stream nach einer abgeschlossenen Suche wird über **Erneut prüfen** gesucht. Die Erkennung benötigt keine zusätzlichen Berechtigungen, kein Backend und keinen API-Schlüssel.

## Zusammenfassung der bisherigen Entwicklung

Ziel ist eine Chromium-Erweiterung, die den YouTube-Livestream einer Person auf deren Twitch-Seite abspielt, während der native Twitch-Chat erhalten bleibt. Hintergrund ist die bevorzugte Nutzung einer vorhandenen YouTube-Premium-Anmeldung. Eine Werbefreiheitsgarantie gehört nicht zum Funktionsumfang.

1. **0.1.0 – STYLERZ:** Feste Zuordnung zu `@STYLERZlive`, Erkennung eines bestätigten Livestreams, manueller Player-Wechsel und Rückkehr zu Twitch. Der reguläre YouTube-Player verwendet die Browser-Sitzung. Twitch-Videodaten werden im betroffenen Tab angehalten.
2. **0.2.0 – ColtHavok:** Zweite feste Zuordnung zu `@ColtHavok`. Getrennte Suchergebnisse und Bereinigung beim Wechsel zwischen Kanälen sowie Unterstützung mehrerer Tabs.
3. **0.2.1 – Playerfläche und Vorschau:** Ein Banner nahm dem Video in der damaligen Reproduktion rund 133 Pixel Höhe. Er wurde durch ein kleines ⋯-Menü über dem Video ersetzt. Twitchs Werbe-Minivorschau außerhalb des Hauptplayers belegte in der Testseite weitere 180 Pixel über dem Chat. Im YouTube-Modus wird ihr Container samt Platzbedarf ausgeblendet.

Im bisherigen Verlauf wurde vom Nutzer bestätigt, dass der grundlegende Austausch gegen den YouTube-Stream funktioniert. Die anschließenden Layoutkorrekturen wurden als Version 0.2.1 bereitgestellt.

## Überlieferte Prüfung und ihre Grenzen

Der ursprüngliche Entwicklungsthread meldet für 0.2.1 **10 bestandene Resolver-Tests und 27 bestandene Browserchecks**, einschließlich simulierter Werbevorschauen. Frühere Checks umfassten Kanalwechsel, mehrere Tabs, Netzwerkregeln und die Übertragung eines YouTube-Sitzungscookies an den eingebetteten Player.

Diese Ergebnisse stammen aus dem früheren Entwicklungsstand. Die zugehörigen Tests und Fixtures sind im bereitgestellten Release-Ordner nicht enthalten und wurden für diese Repository-Übernahme nicht erneut ausgeführt. Eine eigene Prüfung der tatsächlichen Premium-Anmeldung und verlässlichen Werbefreiheit im Nutzerprofil ist damit nicht belegt.

Bei der Repository-Übernahme wurden alle sieben Release-Dateien per SHA-256 mit der Vorlage verglichen: identisch. Die vier JavaScript-Dateien bestanden `node --check`; das Manifest wurde als JSON gelesen und seine Dateiverweise wurden geprüft. Diese statischen Prüfungen ersetzen keinen Live-Browsertest.

## Noch offen

- Version 0.2.1 unter echten Twitch-Werbepausen und mit dem verwendeten YouTube-Premium-Profil praktisch bestätigen.
- Manuelle Zeitanpassung des YouTube-Streams und spätere Synchronisationshilfen untersuchen.
- Automatische Zuordnung über weitere Quellen und eine Oberfläche für manuelle Zuordnungen untersuchen.

Die aktuell implementierten Funktionen und die Installation beschreibt die [README](../README.md).
