# Twelve Data API Explorer

Dieses Projekt ist eine Demo-Webseite zum Testen der wichtigsten Funktionen der Twelve Data API.

Mit dieser Seite kannst du:

- 📈 Aktuelle Aktienkurse anzeigen
- 📊 Zeitverläufe (1D, 1W, 1M, 1Y) darstellen
- 🔍 Ein Suchsystem (Symbol Search) testen
- 🏢 Unternehmensprofile abrufen
- 📚 Eine Aktienliste laden
- 📉 Technische Indikatoren (RSI, SMA, MACD) abrufen


# API Key


551db088d29044888daee527fe5da4b1

⚠️ Wichtig:
Dieser Key ist im Frontend sichtbar. Für Produktivsysteme sollte ein Backend verwendet werden. Eventuell noch umbauen aber nur wenn Zeit.

---


# Lokalen Server starten (VS Code)

## Terminal öffnen
- Menü: Terminal → New Terminal
oder
- Shortcut: CTRL + `


## Server starten
python3 -m http.server 5500


Falls python3 nicht funktioniert:
python -m http.server 5500


## Im Browser öffnen
http://localhost:5500/explorer.html



Server stoppen:
CTRL + C


# API Übersicht

Basis URL:

https://api.twelvedata.com


Alle Requests sind GET Requests und liefern JSON.

---

# Quote

## Endpoint
/quote



## Beispiel
https://api.twelvedata.com/quote?symbol=AAPL&apikey=551db088d29044888daee527fe5da4b1


## Liefert

```json
{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "exchange": "NASDAQ",
  "currency": "USD",
  "datetime": "2026-02-10",
  "open": "274.89001",
  "high": "275.37000",
  "low": "272.94000",
  "close": "273.67999",
  "volume": "34341400",
  "previous_close": "274.62000",
  "change": "-0.94",
  "percent_change": "-0.34",
  "is_market_open": false
}
Verwendung
Aktueller Kurs

Tagesveränderung

Marktstatus

Time Series + Chart
Endpoint
bash
Copy code
/time_series
Parameter
symbol

interval

outputsize

apikey

1D (Intraday)

https://api.twelvedata.com/time_series?symbol=AAPL&interval=5min&outputsize=120&apikey=...
1W
ini
Copy code
interval=1day&outputsize=7
1M
ini
Copy code
interval=1day&outputsize=30
1Y
ini
Copy code
interval=1week&outputsize=60
Liefert
json
Copy code
{
  "meta": {
    "symbol": "AAPL",
    "interval": "1day"
  },
  "values": [
    {
      "datetime": "2026-02-10",
      "open": "274.89",
      "high": "275.37",
      "low": "272.94",
      "close": "273.67",
      "volume": "34341400"
    }
  ],
  "status": "ok"
}
Verwendung
Linienchart (close)

Candlestick Chart (open/high/low/close)

Performance Berechnung

Symbol Search
Endpoint
bash
Copy code
/symbol_search
Beispiel
arduino
Copy code
https://api.twelvedata.com/symbol_search?symbol=apple&outputsize=20&apikey=...
Liefert
json
Copy code
{
  "data": [
    {
      "symbol": "AAPL",
      "instrument_name": "Apple Inc",
      "exchange": "NASDAQ",
      "currency": "USD",
      "country": "United States"
    }
  ],
  "status": "ok"
}
Verwendung
Autocomplete Suchfeld

Symbol-Auswahl per Klick

Stocks Liste
Endpoint
bash
Copy code
/stocks
Beispiel (gefiltert)
perl
Copy code
https://api.twelvedata.com/stocks?country=United%20States&exchange=NASDAQ&apikey=...
Liefert
json
Copy code
{
  "data": [
    {
      "symbol": "AAPL",
      "name": "Apple Inc",
      "exchange": "NASDAQ",
      "country": "United States"
    }
  ],
  "status": "ok"
}
Verwendung
Offline JSON speichern

Interne Suchfunktion ohne API Calls

Profile
Endpoint
bash
Copy code
/profile
Beispiel
arduino
Copy code
https://api.twelvedata.com/profile?symbol=AAPL&apikey=...
Verwendung
Unternehmensbeschreibung

Branche

Land

Zusatzinfos

Technische Indikatoren
RSI
sql
Copy code
https://api.twelvedata.com/rsi?symbol=AAPL&interval=1day&period=14&outputsize=30&apikey=...
Verwendung:

Overbought / Oversold Analyse

SMA
sql
Copy code
https://api.twelvedata.com/sma?symbol=AAPL&interval=1day&period=50&outputsize=30&apikey=...
Verwendung:

Trendlinie

Chart Overlay

MACD
sql
Copy code
https://api.twelvedata.com/macd?symbol=AAPL&interval=1day&fast_period=12&slow_period=26&signal_period=9&outputsize=30&apikey=...
Verwendung:

Momentum Analyse

Signalwechsel

Typische Einstellungen
Empfohlene Chart-Zuordnung:

Zeitraum	Interval
1D	5min
1W	1day
1M	1day
1Y	1week

Häufige Fehler
status: "error"
API Key falsch

Rate Limit erreicht

Symbol ungültig

Keine Daten
Falsches Interval

Markt geschlossen

outputsize zu klein

Erweiterungen
Mögliche nächste Schritte:

Candlestick Chart

Multi-Aktien Watchlist

Portfolio Berechnung (Kaufpreis, Rendite)

Caching im localStorage

Debounce im Suchfeld

Chart Overlays (SMA 20/50/200)

Zweiter Chart für RSI/MACD

Zusammenfassung
Mit Twelve Data kannst du:

Aktienkurse abrufen

Zeitverläufe anzeigen

Suchsysteme bauen

Unternehmensinfos darstellen

Technische Indikatoren berechnen

Die API ist sehr gut geeignet für:

Demo-Projekte

Finanz-Dashboards

Portfolio-Apps

Lernprojekte