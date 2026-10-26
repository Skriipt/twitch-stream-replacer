<div align="center">
  <img src="assets/icon.svg" width="80" height="80" alt="Twitch Stream Replacer">

# Twitch Stream Replacer

**YouTube-Livestreams auf Twitch ansehen und den Twitch-Chat behalten.**

[Projektidee](#projektidee) · [Ziel](#ziel) · [Installation](#installation) · [Entwicklung](#entwicklung)
</div>

## Projektidee

Viele Streamer übertragen gleichzeitig auf Twitch und YouTube. Twitch Stream Replacer verbindet die YouTube-Wiedergabe mit der gewohnten Twitch-Seite: Der YouTube-Livestream wird im Videobereich abgespielt, während der native Twitch-Chat daneben erhalten bleibt.

Die Aufgabe der Browser-Erweiterung ist es, den passenden YouTube-Livestream zu finden, einen einfachen Wechsel zwischen den Playern zu ermöglichen und die parallele Twitch-Wiedergabe anzuhalten. Die Twitch-Seite bleibt der zentrale Ort zum Zuschauen und Chatten.

## Ziel

Das Projekt soll die Wahl der Videoplattform vom verwendeten Chat trennen. Wer die Wiedergabe auf YouTube bevorzugt, soll dafür die Twitch-Community und die vertraute Chat-Oberfläche nicht verlassen müssen.

Zum angestrebten Funktionsumfang gehören:

- **Passende Livestreams finden:** Twitch- und YouTube-Kanäle zuverlässig zuordnen und laufende Übertragungen erkennen.
- **Einfach wechseln:** Den YouTube-Player auf der Twitch-Seite verwenden und jederzeit zur Twitch-Wiedergabe zurückkehren.
- **Die vorhandene YouTube-Anmeldung nutzen:** Die Wiedergabe über den normalen YouTube-Player und die Sitzung des Browserprofils ermöglichen.
- **Doppelte Wiedergabe vermeiden:** Twitch-Video und -Ton während der YouTube-Wiedergabe anhalten.
- **Video und Chat zeitlich abstimmen:** Künftig eine manuelle Zeitanpassung anbieten, um den Versatz zwischen beiden Plattformen zu reduzieren.

> [!NOTE]
> Das Projekt befindet sich in Entwicklung. Den aktuellen Implementierungsstand, Prüfergebnisse und offene Arbeiten beschreibt der [Projektstand](docs/PROJECT_STATUS.md).

## Funktionsprinzip

1. Die Erweiterung erkennt den geöffneten Twitch-Kanal.
2. Sie prüft den zugeordneten YouTube-Kanal auf einen laufenden Livestream.
3. Nach dem Wechsel wird der YouTube-Player in den Twitch-Videobereich eingesetzt; der native Chat bleibt verfügbar.
4. Über ein kompaktes Menü lässt sich zur Twitch-Wiedergabe zurückkehren oder der Stream direkt auf YouTube öffnen.

## Installation

Die Erweiterung basiert auf Chromium Manifest V3. Voraussetzung ist Chrome ab Version 120 oder ein kompatibler Chromium-Browser. Für den aktuellen Quellcode sind kein Build, kein Backend und kein API-Schlüssel erforderlich.

1. Repository herunterladen und entpacken oder klonen:

   ```sh
   git clone https://github.com/Skriipt/twitch-stream-replacer.git
   ```

2. `chrome://extensions` öffnen; in Edge `edge://extensions`, in Brave `brave://extensions`.
3. **Entwicklermodus** aktivieren und **Entpackte Erweiterung laden** wählen.
4. Den Projektordner auswählen, in dem `manifest.json` liegt.
5. Im selben Browserprofil auf YouTube anmelden und anschließend die Twitch-Seite neu laden.

Die [Installationsanleitung](INSTALLATION.md) erklärt die Bedienung des aktuellen Prototyps, Updates und die nötigen Cookie-Einstellungen.

## YouTube-Anmeldung und Premium

Der normale YouTube-Player verwendet die YouTube-Sitzung des Browserprofils. Die Erweiterung verlangt dafür keine Zugangsdaten und liest keine Cookie-Werte aus.

> [!IMPORTANT]
> YouTube Premium wird von der Erweiterung weder geprüft noch erzwungen. Ob die Anmeldung im eingebetteten Player verfügbar ist, hängt unter anderem von den Cookie-Einstellungen ab. Das Projekt garantiert keine Werbefreiheit.

## Berechtigungen und Daten

| Zugriff | Zweck |
| --- | --- |
| `www.twitch.tv` | Kanal erkennen sowie Umschalter und Player einfügen. |
| `www.youtube.com` | Kanal- und Stream-Metadaten abrufen. |
| `*.ttvnw.net` und `declarativeNetRequestWithHostAccess` | Twitch-Videodaten vorübergehend im jeweiligen Tab anhalten. |

Die Erweiterung verwendet kein eigenes Backend und keine Telemetrie. Sie besitzt keine Cookie-Leseberechtigung. Der Browser kann seine bestehende YouTube-Sitzung bei Abfragen mitsenden; der eingebettete Player verbindet sich direkt mit YouTube.

## Entwicklung

Das Projekt besteht aus JavaScript und HTML ohne externe Laufzeitabhängigkeiten.

| Datei | Aufgabe |
| --- | --- |
| `manifest.json` | Manifest V3, Berechtigungen und Einstiegspunkte. |
| `config.js` | Zuordnungen zwischen Twitch- und YouTube-Kanälen. |
| `resolver.js` | YouTube-Metadaten lesen und Livestreams validieren. |
| `background.js` | Service Worker, Suchergebnis-Cache und tabbezogene Netzwerkregeln. |
| `content.js` | Player-Austausch, Menü, Mediensteuerung und Kanalwechsel. |
| `popup.html` | Einstieg über das Erweiterungssymbol. |

Nach Änderungen die Erweiterung auf der Erweiterungsseite neu laden und Twitch aktualisieren. Technische Einschränkungen und der bisherige Prüfstand sind in [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) dokumentiert.

Ein unabhängiges Projekt ohne Verbindung zu Twitch, YouTube oder den jeweiligen Streamern.
