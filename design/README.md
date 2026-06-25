# FBM FinanzApp — Design Reference

## Design language

FBM FinanzApp's interface is intentionally **calm, editorial, and atmospheric** — closer to a premium SaaS dashboard than to a corporate banking app. The visual language is built around three principles:

1. **Layered depth, not flatness.** The page background is a stack of radial gradients (cool atmospheric tint, warm atmospheric tint, depth pool, vertical color ramp, vignette) that creates soft spatial depth instead of a single flat color. Cards float on top of that atmosphere.
2. **One typeface, deliberate weights.** [Outfit](https://fonts.google.com/specimen/Outfit) is used exclusively, with weights 300–800. No mixing of typefaces; hierarchy comes from weight + size, not from font swap.
3. **Token-driven, theme-aware.** Every color, spacing, radius, and shadow is a CSS custom property. Light, dark, high-contrast, and high-contrast-dark modes are all derived from the same token names, so the entire app rethemes consistently without touching component code.

## Themes

- **Light** (`:root`) — default. Warm off-white background (`#faf9f7` → `#eeebe5`) with cool atmospheric tints and a subtle vignette.
- **Dark** (`:root[data-theme="dark"]`) — `#0c0c0e` → `#161618` base with `#fafafa` text. Shadows gain an inset 1px highlight (`inset 0 1px 0 rgba(255,255,255,0.04)`) for a material feel.
- **High contrast** (`:root[data-contrast="high"]`) — black text on white, primary `#0040c0`, thick `rgba(0,0,0,0.7)` borders, near-zero rounded corners (3–6 px).
- **High contrast + dark** — white text on black, primary `#66b3ff`, white borders, thicker shadows. Combination of the two attribute selectors.

See [`design-tokens.md`](./design-tokens.md) for the full token reference.

## Screenshots

Screenshots live in [`screenshots/`](./screenshots/). See its README for capture instructions and the recommended filename convention.

## Component patterns

- **Cards** (`.panel`, `.kpi-card`, `.group-card`) — `--ui-surface` background, `--ui-radius-md` (12 px) corners, `--ui-shadow-soft` resting elevation. Hover lifts 1 px and shifts the border to `--ui-primary`.
- **Buttons** (`.btn.btn-primary`, `.btn.btn-ghost`, `.btn.btn-danger`) — 12 px radius, weight 600, press-scale on `:active`. Loading state runs the `btn-spin` keyframe.
- **Inputs** (`.field-input`) — neutral `--ui-border`, 3 px focus ring in `--ui-focus-ring`, 46 px min-height on mobile to stay above the 44 px touch-target floor.
- **Modals** (`.modal-backdrop` + `.modal`) — `--ui-shadow-strong`, blurred backdrop, `role="dialog"` + `aria-modal`, Escape closes.
- **Toasts** (`.toast`) — slide in 16 px from the right, auto-dismiss after 4 s, `aria-live="polite"` + `role="status"`.

## Animations

All animations respect `prefers-reduced-motion: reduce`. The named keyframes used across the app:

| Animation | Duration | Purpose |
|-----------|----------|---------|
| `reveal-up` | 700 ms | Homepage hero + section reveals |
| `toast-in` / `toast-out` | 220 ms / 200 ms | Toast slide-in/out |
| `btn-spin` | 650 ms | Button loading spinner |
| `auth-fade-up` | 180–240 ms | Auth form mount |
| `typing-bounce` | 1.2 s | AI chat typing indicator |
| `hp-orb-drift-*` | 20–30 s | Homepage atmospheric orbs |
| `hp-float` | 7 s | Homepage hero card float |
| `stocks-spin` | 1 s | Stocks chart loading |
| `stock-row-in` | 200 ms | Portfolio row reveal |

## Accessibility

The design system enforces:

- `:focus-visible` rings (3 px) on every interactive element
- Touch targets ≥ 44 px on mobile (BottomNav, mobile buttons)
- WCAG-compliant text contrast in all four theme variants
- `aria-current`, `aria-expanded`, `aria-label`, `aria-modal`, `aria-live` on relevant elements
- `aria-invalid` + `aria-describedby` wired to all form fields with error UI
- Skip-to-content link in the authenticated app shell
