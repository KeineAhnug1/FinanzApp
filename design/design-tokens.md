# Design Tokens

All tokens are defined in [`frontend/src/styles/globals.css`](../frontend/src/styles/globals.css). Values below are extracted verbatim from that file.

## Spacing scale (6-step)

| Token | Desktop | Mobile (≤ 768 px) |
|-------|---------|-------------------|
| `--ui-space-1` | 6 px  | 4 px  |
| `--ui-space-2` | 10 px | 8 px  |
| `--ui-space-3` | 16 px | 12 px |
| `--ui-space-4` | 22 px | 16 px |
| `--ui-space-5` | 28 px | — |
| `--ui-space-6` | 40 px | — |

## Border radius

| Token | Light / Dark | High contrast |
|-------|--------------|---------------|
| `--ui-radius-sm` | 8 px  | 3 px |
| `--ui-radius-md` | 12 px | 4 px |
| `--ui-radius-lg` | 16 px | 6 px |

## Light theme colors (`:root`)

| Token | Value | Use |
|-------|-------|-----|
| `--ui-bg-c1` | `#faf9f7` | Page base, top of vertical ramp |
| `--ui-bg-c2` | `#f5f3ef` | Mid layer |
| `--ui-bg-c3` | `#eeebe5` | Deep layer, bottom of ramp |
| `--ui-bg-atmo-cool` | `rgba(196, 214, 236, 0.38)` | Cool atmospheric orb (top-left) |
| `--ui-bg-atmo-warm` | `rgba(228, 210, 186, 0.32)` | Warm atmospheric orb (top-right) |
| `--ui-bg-atmo-depth` | `rgba(195, 180, 158, 0.18)` | Depth pool (bottom) |
| `--ui-bg-vignette` | `rgba(100, 85, 65, 0.06)` | Outer vignette |
| `--ui-surface` | `#ffffff` | Cards, modals, panels |
| `--ui-surface-soft` | `#f8f7f5` | Input fields, soft cards |
| `--ui-text` | `#18181b` | Primary text |
| `--ui-text-muted` | `#6b7280` | Secondary text |
| `--ui-border` | `#e4e2de` | Default border |
| `--ui-border-strong` | `#cac7c0` | Emphasized border |
| `--ui-primary` | `#2563eb` | Primary action, links |
| `--ui-primary-dark` | `#1d4ed8` | Hover / active primary |
| `--ui-text-on-primary` | `#ffffff` | Text on primary fills |
| `--ui-accent-blue` | `#3b82f6` | Accent / chart series |
| `--ui-accent-orange` | `#f97316` | Accent / chart series |
| `--ui-accent-violet` | `#8b5cf6` | Accent / chart series |
| `--ui-focus-ring` | `rgba(37, 99, 235, 0.18)` | 3 px focus ring |
| `--ui-success` | `#16a34a` | Income, gains |
| `--ui-success-soft` | `#f0fdf4` | Success background |
| `--ui-success-border` | `#86efac` | Success border |
| `--ui-warning` | `#d97706` | Caution states |
| `--ui-warning-soft` | `#fffbeb` | Warning background |
| `--ui-warning-border` | `#fcd34d` | Warning border |
| `--ui-danger` | `#dc2626` | Expenses, losses, destructive |
| `--ui-danger-strong` | `#b91c1c` | Hover / pressed danger |
| `--ui-danger-soft` | `#fef2f2` | Danger background |
| `--ui-danger-border` | `#fca5a5` | Danger border |
| `--ui-overlay` | `rgba(9, 9, 11, 0.45)` | Modal backdrop |

## Dark theme overrides (`:root[data-theme="dark"]`)

| Token | Value |
|-------|-------|
| `--ui-bg-c1` | `#0c0c0e` |
| `--ui-bg-c2` | `#111114` |
| `--ui-bg-c3` | `#161618` |
| `--ui-bg-atmo-cool` | `rgba(59, 130, 246, 0.07)` |
| `--ui-bg-atmo-warm` | `rgba(80, 70, 60, 0.08)` |
| `--ui-bg-atmo-depth` | `rgba(40, 40, 50, 0.18)` |
| `--ui-bg-vignette` | `rgba(0, 0, 0, 0.55)` |
| `--ui-surface` | `#18181b` |
| `--ui-surface-soft` | `#1f1f23` |
| `--ui-text` | `#fafafa` |
| `--ui-text-muted` | `#a1a1aa` |
| `--ui-border` | `rgba(255, 255, 255, 0.08)` |
| `--ui-border-strong` | `rgba(255, 255, 255, 0.14)` |
| `--ui-primary` | `#3b82f6` |
| `--ui-primary-dark` | `#2563eb` |
| `--ui-accent-blue` | `#60a5fa` |
| `--ui-accent-orange` | `#fb923c` |
| `--ui-accent-violet` | `#a78bfa` |
| `--ui-focus-ring` | `rgba(59, 130, 246, 0.3)` |
| `--ui-success` | `#4ade80` |
| `--ui-warning` | `#fbbf24` |
| `--ui-danger` | `#f87171` |
| `--ui-overlay` | `rgba(0, 0, 0, 0.72)` |
| `--ui-shadow-soft` | `0 1px 3px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)` |
| `--ui-shadow-strong` | `0 8px 20px rgba(0,0,0,0.55), 0 20px 50px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)` |

## High-contrast overrides (`:root[data-contrast="high"]`)

| Token | Value |
|-------|-------|
| `--ui-radius-sm` | `3px` |
| `--ui-radius-md` | `4px` |
| `--ui-radius-lg` | `6px` |
| `--ui-text` | `#000000` |
| `--ui-text-muted` | `#111111` |
| `--ui-surface` | `#ffffff` |
| `--ui-surface-soft` | `#f0f0f0` |
| `--ui-bg-c1` | `#e8e8e8` |
| `--ui-bg-c2` | `#d8d8d8` |
| `--ui-bg-c3` | `#cccccc` |
| `--ui-border` | `rgba(0, 0, 0, 0.7)` |
| `--ui-border-strong` | `rgba(0, 0, 0, 0.9)` |
| `--ui-primary` | `#0040c0` |
| `--ui-primary-dark` | `#003099` |
| `--ui-focus-ring` | `rgba(0, 64, 192, 0.5)` |
| `--ui-shadow-soft` | `0 2px 6px rgba(0,0,0,0.3), 0 0 0 2px rgba(0,0,0,0.15)` |
| `--ui-shadow-strong` | `0 4px 16px rgba(0,0,0,0.4), 0 0 0 2px rgba(0,0,0,0.2)` |

## High-contrast + dark overrides (`:root[data-contrast="high"][data-theme="dark"]`)

| Token | Value |
|-------|-------|
| `--ui-text` | `#ffffff` |
| `--ui-text-muted` | `#eeeeee` |
| `--ui-surface` | `#000000` |
| `--ui-surface-soft` | `#101010` |
| `--ui-bg-c1` | `#0a0a0a` |
| `--ui-bg-c2` | `#141414` |
| `--ui-bg-c3` | `#1a1a1a` |
| `--ui-border` | `rgba(255, 255, 255, 0.8)` |
| `--ui-border-strong` | `rgba(255, 255, 255, 0.95)` |
| `--ui-primary` | `#66b3ff` |
| `--ui-primary-dark` | `#4d9eff` |
| `--ui-focus-ring` | `rgba(102, 179, 255, 0.6)` |
| `--ui-shadow-soft` | `0 2px 8px rgba(0,0,0,0.8), 0 0 0 2px rgba(255,255,255,0.2)` |
| `--ui-shadow-strong` | `0 4px 20px rgba(0,0,0,0.9), 0 0 0 2px rgba(255,255,255,0.25)` |

## Shadows (light theme defaults)

| Token | Value | Use |
|-------|-------|-----|
| `--ui-shadow-soft` | `0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.05)` | Cards, KPI tiles |
| `--ui-shadow-strong` | `0 4px 6px rgba(0,0,0,0.05), 0 10px 30px rgba(0,0,0,0.1)` | Modals, drawers, toasts |

## Atmospheric background

The body background stacks five layers (defined on `body { background-image: ... }`):

```css
background-image:
  radial-gradient(140% 110% at 6% -12%,   var(--ui-bg-atmo-cool)  0%, transparent 64%),
  radial-gradient(130% 108% at 104% 14%,  var(--ui-bg-atmo-warm)  0%, transparent 66%),
  radial-gradient(140% 118% at 50% 118%,  var(--ui-bg-atmo-depth) 0%, transparent 70%),
  linear-gradient(180deg, var(--ui-bg-c1) 0%, var(--ui-bg-c2) 55%, var(--ui-bg-c3) 100%),
  radial-gradient(140% 120% at 50% 50%, transparent 58%, var(--ui-bg-vignette) 100%);
```

Each layer changes per theme via the bg-c1/2/3, atmo-cool/warm/depth, and vignette tokens — the gradient shapes themselves are theme-agnostic.

## Typography

- Font family: **Outfit**, weights 300–800 (fallback: `"Segoe UI", system-ui, -apple-system, sans-serif`)
- Body: 16 px on desktop, 13 px on mobile (set on `html`)
- Headings: scaled via `clamp()` — hero `clamp(1.8rem, 3vw, 2.8rem)`
- Line height: 1.5 body, 1.15 headings

## Breakpoints

| Width | Target |
|-------|--------|
| ≥ 961 px | Desktop (SideNav) |
| ≤ 960 px | Tablet / Mobile (BottomNav) |
| ≤ 768 px | Mobile (compact inputs, smaller spacing scale) |
| ≤ 640 px | Small phone |
| ≤ 480 px | Very small phone (max compression) |
