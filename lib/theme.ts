export type Theme = "light" | "dark" | "system";

const THEME_KEY = "nimbus-theme";

/** Dark is the default: the workspace is designed dark first. */
export function loadTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "system" ? stored : "dark";
  } catch {
    return "dark";
  }
}

/** Fired on window after a theme change, so every theme control shows the current one. */
export const THEME_EVENT = "aro:theme";

export function saveTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage unavailable: the choice still applies for this visit.
  }
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

/** Sets the data-theme attribute that picks the color-scheme in globals.css. Every token
 * is a light-dark() pair, so switching is a single attribute change. */
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

/** Inline script run before hydration so the first paint already has the right theme. */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem('${THEME_KEY}');
    document.documentElement.setAttribute('data-theme', t === 'light' || t === 'system' ? t : 'dark');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;
