# Projektstand: Stream Bridge 0.2.1

Stand: 26. Oktober 2026. Ausgangspunkt dieses Repositorys sind die sieben Dateien des bereitgestellten Release-Ordners `stream-bridge-prototype-0.2.1`. Der Erweiterungscode wurde bei der Übernahme unverändert kopiert. README, Projektzusammenfassung, Git-Konfiguration und das vorhandene Projekt-Icon wurden ergänzt.

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
- Weitere Kanalzuordnungen und eine Oberfläche für deren Verwaltung ergänzen.
- Ursprüngliche Tests und Fixtures wiederherstellen oder eine reproduzierbare Testsuite aufbauen.

Die aktuell implementierten Funktionen und die Installation beschreibt die [README](../README.md).
