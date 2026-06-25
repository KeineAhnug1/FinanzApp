# Screenshots

Place PNG or JPG screenshots of the running app in this directory.

## Recommended captures

| Filename | Page | Theme | Viewport |
|----------|------|-------|----------|
| `home-light.png` | `/home` | light | 1440 × 900 |
| `home-dark.png` | `/home` | dark | 1440 × 900 |
| `dashboard-light.png` | `/dashboard` | light | 1440 × 900 |
| `dashboard-dark.png` | `/dashboard` | dark | 1440 × 900 |
| `stocks-light.png` | `/stocks` | light | 1440 × 900 |
| `groups-light.png` | `/groups` | light | 1440 × 900 |
| `mobile-bottomnav.png` | `/dashboard` | light | 390 × 844 |
| `chat-light.png` | `/questions/chat` | light | 1440 × 900 |
| `404-light.png` | `/nonexistent-route` | light | 1440 × 900 |

## How to capture

1. Start the dev server from the repo root: `npm start`.
2. Open `http://localhost:4000/<route>` in a browser.
3. Resize the window to the target viewport (DevTools → Device Toolbar for mobile sizes).
4. Use the browser's screenshot tool or `cmd-shift-4` on macOS.
5. Save the PNG into this directory with the filename from the table above.

Switch theme via Settings → Erscheinungsbild, or by toggling `data-theme="dark"` on `<html>` in DevTools. High-contrast mode is toggled via the `data-contrast="high"` attribute on the same element.
