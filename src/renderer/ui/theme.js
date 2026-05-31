// Light/dark theme persistence and DOM application.

const STORAGE_KEY = "test-form-maker-theme";

const elements = {
  toggleButton: document.querySelector("#themeToggleButton"),
  toggleLabel: document.querySelector("#themeToggleLabel")
};

let theme = getInitialTheme();

export function initTheme() {
  elements.toggleButton.addEventListener("click", toggleTheme);
  renderTheme();
}

function toggleTheme() {
  theme = theme === "dark" ? "light" : "dark";
  localStorage.setItem(STORAGE_KEY, theme);
  renderTheme();
}

function renderTheme() {
  document.documentElement.dataset.theme = theme;
  elements.toggleButton.setAttribute("aria-pressed", String(theme === "dark"));
  elements.toggleButton.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} mode`);
  elements.toggleLabel.textContent = theme === "dark" ? "Dark mode" : "Light mode";
}

function getInitialTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (saved === "light" || saved === "dark") {
    return saved;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
