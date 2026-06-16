/**
 * theme.ts — Theme switching utilities (SSR-safe).
 *
 * Migrated from:
 *   frontend/src/shared/js/theme-utils.js
 *   frontend/src/shared/js/theme-init.js
 *
 * Usage:
 *   import { initTheme, setTheme, getTheme } from '@/lib/theme';
 *
 *   // In _app.tsx / layout.tsx (client component) call initTheme() on mount.
 *   // For flash-free theme: embed the inline script from getInitScript() in <head>.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type ContrastMode = 'normal' | 'high';

// ---------------------------------------------------------------------------
// Storage keys (must match theme-init.js / legacy frontend)
// ---------------------------------------------------------------------------

const THEME_STORAGE_KEY = 'finanzapp.themeMode';
const CONTRAST_STORAGE_KEY = 'finanzapp.contrast';

const THEME_OPTIONS = new Set<Theme>(['light', 'dark', 'system']);
const CONTRAST_OPTIONS = new Set<ContrastMode>(['normal', 'high']);

// ---------------------------------------------------------------------------
// SSR guard
// ---------------------------------------------------------------------------

const isBrowser = (): boolean => typeof window !== 'undefined';

// ---------------------------------------------------------------------------
// System preference helper
// ---------------------------------------------------------------------------

function prefersDark(): boolean {
  if (!isBrowser()) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/**
 * Return the stored theme preference.
 * Defaults to `'system'` when nothing is stored or the value is invalid.
 */
export function getTheme(): Theme {
  if (!isBrowser()) return 'system';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  // Legacy stored value was "auto" — map it to "system"
  if (stored === 'auto') return 'system';
  if (stored && THEME_OPTIONS.has(stored as Theme)) return stored as Theme;
  return 'system';
}

/**
 * Resolve a possibly-`system` theme to an actual `'light' | 'dark'` value.
 */
export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') return prefersDark() ? 'dark' : 'light';
  return theme;
}

/**
 * Apply `theme` to `document.documentElement` via `data-theme` / `data-theme-mode`
 * attributes and dispatch a `finanzapp:theme-changed` event.
 *
 * Safe to call on the server — does nothing outside a browser context.
 */
export function applyTheme(theme: Theme): ResolvedTheme {
  if (!isBrowser()) return resolveTheme(theme);

  const resolved = resolveTheme(theme);
  // "system" is stored internally as "auto" for backwards compat with legacy CSS/JS
  const legacyMode = theme === 'system' ? 'auto' : theme;

  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = legacyMode;

  // Update any theme toggle buttons that follow the legacy pattern
  document.querySelectorAll<HTMLElement>('.theme-option').forEach((btn) => {
    const isActive = btn.dataset.themeChoice === legacyMode;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });

  window.dispatchEvent(
    new CustomEvent('finanzapp:theme-changed', {
      detail: { theme: resolved, themeMode: legacyMode },
    }),
  );

  return resolved;
}

/**
 * Persist `theme` in localStorage and apply it immediately.
 */
export function setTheme(theme: Theme): void {
  if (!isBrowser()) return;
  const normalized: Theme = THEME_OPTIONS.has(theme) ? theme : 'system';
  // Store "auto" for legacy compat
  const legacyMode = normalized === 'system' ? 'auto' : normalized;
  window.localStorage.setItem(THEME_STORAGE_KEY, legacyMode);
  applyTheme(normalized);
}

/**
 * Initialize the theme switcher:
 * 1. Applies the stored preference.
 * 2. Attaches click handlers to `.theme-option` buttons.
 * 3. Reacts to OS-level color-scheme changes.
 *
 * Call once on app startup (client side only).
 */
export function initTheme(): void {
  if (!isBrowser()) return;

  applyTheme(getTheme());

  // Button listeners
  document.querySelectorAll<HTMLElement>('.theme-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const choice = btn.dataset.themeChoice;
      if (!choice) return;
      // Normalise legacy "auto" value coming from markup
      const mapped: Theme = choice === 'auto' ? 'system' : (choice as Theme);
      if (!THEME_OPTIONS.has(mapped)) return;
      setTheme(mapped);
    });
  });

  // System preference listener
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemChange = (): void => {
    if (getTheme() === 'system') applyTheme('system');
  };
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', handleSystemChange);
  } else {
    // Safari <14 fallback
    mq.addListener(handleSystemChange);
  }
}

// ---------------------------------------------------------------------------
// Contrast
// ---------------------------------------------------------------------------

export function getContrast(): ContrastMode {
  if (!isBrowser()) return 'normal';
  const stored = window.localStorage.getItem(CONTRAST_STORAGE_KEY);
  if (stored && CONTRAST_OPTIONS.has(stored as ContrastMode)) return stored as ContrastMode;
  return 'normal';
}

export function applyContrast(contrast: ContrastMode): ContrastMode {
  if (!isBrowser()) return contrast;
  const resolved: ContrastMode = CONTRAST_OPTIONS.has(contrast) ? contrast : 'normal';

  if (resolved === 'normal') {
    delete document.documentElement.dataset.contrast;
  } else {
    document.documentElement.dataset.contrast = resolved;
  }

  document.querySelectorAll<HTMLElement>('.contrast-option').forEach((btn) => {
    const isActive = btn.dataset.contrastChoice === resolved;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });

  window.dispatchEvent(
    new CustomEvent('finanzapp:contrast-changed', { detail: { contrast: resolved } }),
  );
  return resolved;
}

export function setContrast(contrast: ContrastMode): ContrastMode {
  if (!isBrowser()) return 'normal';
  const resolved: ContrastMode = CONTRAST_OPTIONS.has(contrast) ? contrast : 'normal';
  window.localStorage.setItem(CONTRAST_STORAGE_KEY, resolved);
  return applyContrast(resolved);
}

export function initContrast(): void {
  if (!isBrowser()) return;
  applyContrast(getContrast());

  document.querySelectorAll<HTMLElement>('.contrast-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const choice = btn.dataset.contrastChoice as ContrastMode | undefined;
      if (!choice || !CONTRAST_OPTIONS.has(choice)) return;
      setContrast(choice);
    });
  });
}

// ---------------------------------------------------------------------------
// Inline script for <head> (eliminates flash-of-wrong-theme)
// ---------------------------------------------------------------------------

/**
 * Returns a self-executing script string that should be embedded in the
 * document `<head>` **before** any CSS loads.  Equivalent to theme-init.js.
 *
 * Usage in Next.js layout:
 * ```tsx
 * <script dangerouslySetInnerHTML={{ __html: getInitScript() }} />
 * ```
 */
export function getInitScript(): string {
  return `(function(){try{
    var s=localStorage.getItem('finanzapp.themeMode');
    var m=s==='light'||s==='dark'||s==='auto'?s:'auto';
    var r=m==='auto'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):m;
    document.documentElement.dataset.theme=r;
    document.documentElement.dataset.themeMode=m;
    var c=localStorage.getItem('finanzapp.contrast');
    if(c==='high')document.documentElement.dataset.contrast='high';
  }catch(e){}})();`;
}
