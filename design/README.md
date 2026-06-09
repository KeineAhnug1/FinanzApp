# FBM Finance — Design Documentation

Dieses Verzeichnis enthält die visuellen Design-Grundlagen für FBM Finance.

## Dateien

| Datei | Inhalt |
|---|---|
| `design-system.html` | Interaktive Living Style Guide — im Browser öffnen |

Die Style Guide kann **ohne Build-Schritt** direkt im Browser geöffnet werden:

```
design/design-system.html
```

---

## Design-Entscheidungen

### Philosophie

FBM Finance folgt einem **"Warm Minimal"**-Prinzip: klare, funktionale Oberflächen mit subtilen Warmtönen statt kühlem Grau oder grellem Weiß. Das Design soll Vertrauen signalisieren — passend für eine Finanz-App.

### Farbpalette

| Rolle | Light | Dark |
|---|---|---|
| Hintergrund | `#faf9f7` (cremiges Warmweiß) | `#0c0c0e` (tiefes Schwarz) |
| Surface | `#ffffff` | `#18181b` |
| Primär | `#2563eb` (Blau) | `#3b82f6` (helleres Blau) |
| Akzent Warm | `#f97316` (Orange) | `#fb923c` |
| Akzent Grün | `#22c55e` | `#4ade80` |
| Akzent Violett | `#8b5cf6` | `#a78bfa` |

**Warum Warmweiß statt Blaugrau?**
Viele Finance-Apps wirken klinisch kalt. Der cremige Hintergrund (`#faf9f7`) gibt der App eine menschlichere, weniger einschüchternde Atmosphäre, ohne unprofessionell zu wirken.

**Warum echtes Schwarz im Dark Mode?**
`#0c0c0e` statt `#1a1a2e` — auf OLED-Displays spart echtes Schwarz Energie und der Kontrast zu leuchtenden Zahlen (grün/rot) ist auf dem Dashboard besonders gut lesbar.

### Typografie

**Outfit** (Google Fonts, variabel Gewicht 300–800):
- Geometrisch, modern, gut lesbar in kleinen Größen
- Kein Serifen-Look — passt zur Tech/Finance-Kategorie
- Deutsche Umlaute (ä, ö, ü, ß) vollständig unterstützt

### Motion & Animationen

Alle Animationen verwenden die **"ease-spring"** Kurve:
```css
cubic-bezier(0.22, 1, 0.36, 1)
```
Diese Kurve beschleunigt schnell und verlangsamt sich weich — natürlicher als `ease-out`. Typische Dauern: 120ms (Hover) bis 600ms (Seiten-Reveal).

`@media (prefers-reduced-motion: reduce)` deaktiviert alle Animationen — WCAG 2.1 AA konform.

### Abstands-System

6-stufige Skala basierend auf einer **6px-Basis**:
- `6 · 10 · 16 · 22 · 28 · 40 px`
- Wächst nicht linear sondern leicht exponentiell für optisch ausgewogenere Abstände

### Komponenten

- **Buttons**: 4 Varianten (Primary, Secondary, Ghost, Danger) × 3 Größen
- **Cards**: Flat + Elevated (via Box-Shadow-Stärke)
- **Badges**: Pill-Form mit Status-Semantik (success/warning/danger/neutral/primary)
- **Toast-Benachrichtigungen**: Slide-in von rechts, auto-dismiss
- **Modals**: Backdrop-Blur + scale-in Animation

### Themes

Das Theme-System funktioniert über das `data-theme`-Attribut am `<html>`-Element:

```js
document.documentElement.dataset.theme = 'dark'; // oder 'light'
```

Zusätzlich gibt es einen **High-Contrast-Modus** (`data-contrast="high"`) für erhöhte Barrierefreiheit. Der Modus wird in `localStorage` unter `finanzapp.themeMode` und `finanzapp.contrast` persistiert.
