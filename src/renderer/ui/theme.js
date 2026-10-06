// Light/dark theme. The preference (system | light | dark) lives in learner
// settings and is mirrored to localStorage so index.html can apply it before
// first paint without a flash.

import { settings, persist } from "../state/progress.js";

const STORAGE_KEY = "recall-theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");
const ORDER = ["system", "light", "dark"];

export function initTheme() {
  applyTheme();
  media.addEventListener("change", applyTheme);
}

export function themePreference() {
  return settings().theme || "system";
}

export function setThemePreference(preference) {
  settings().theme = ORDER.includes(preference) ? preference : "system";
  try {
    localStorage.setItem(STORAGE_KEY, settings().theme);
  } catch {
    // Pre-paint falls back to the system theme.
  }
  persist();
  applyTheme();
}

export function cycleTheme() {
  const next = ORDER[(ORDER.indexOf(themePreference()) + 1) % ORDER.length];
  setThemePreference(next);
  return next;
}

function applyTheme() {
  const preference = themePreference();
  const dark = preference === "dark" || (preference === "system" && media.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
