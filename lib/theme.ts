export type ThemeMode = "light" | "dark" | "system";

export const THEME_KEY = "bo_theme"; // "light" | "dark" | "system" (absent = system)
export const THEME_ASKED_KEY = "bo_theme_asked"; // set once the first-visit suggestion was answered/closed

/** Which concrete theme to show for a stored mode and the OS preference. */
export function resolveTheme(mode: ThemeMode | string | null | undefined, prefersDark: boolean): "light" | "dark" {
  if (mode === "light" || mode === "dark") return mode;
  return prefersDark ? "dark" : "light"; // "system", missing or garbage → follow the OS
}

/**
 * Runs in <head> before first paint (inline, so no flash of the wrong theme).
 * Keep in sync with resolveTheme above.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('${THEME_KEY}');var d=m==='dark'||(m!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;

/* ---------- browser-only helpers ---------- */

export function readThemeMode(): ThemeMode {
  try {
    const m = localStorage.getItem(THEME_KEY);
    return m === "light" || m === "dark" ? m : "system";
  } catch {
    return "system";
  }
}

const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
const setAttr = (mode: ThemeMode) => {
  document.documentElement.dataset.theme = resolveTheme(mode, prefersDark());
};

type VTDocument = Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };

/**
 * Save and apply a theme. With the View Transitions API the new theme grows from `origin` (the toggle) as a circle;
 * other browsers get a short colour cross-fade. Reduced-motion users get an instant switch.
 */
export function setThemeMode(mode: ThemeMode, origin?: { x: number; y: number }) {
  try {
    if (mode === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, mode);
  } catch {}

  const root = document.documentElement;
  if (resolveTheme(mode, prefersDark()) === root.dataset.theme) return; // nothing visible changes

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as VTDocument;
  if (reduced) return setAttr(mode);

  if (doc.startViewTransition) {
    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? window.innerHeight / 2;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const vt = doc.startViewTransition(() => setAttr(mode));
    vt.ready
      .then(() =>
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 600, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
        ),
      )
      .catch(() => {});
  } else {
    root.classList.add("theme-anim");
    setAttr(mode);
    window.setTimeout(() => root.classList.remove("theme-anim"), 500);
  }
}
