// Left navigation rail: brand, primary destinations with live counts, the
// daily-goal + streak card, and the theme switch.

import { h } from "../lib/dom.js";
import { icon } from "./icons.js";
import { route, href } from "./router.js";
import { catalog } from "../state/catalog.js";
import { todayStats } from "../state/learner.js";
import { openMistakes } from "../state/sessions.js";
import { meter, plural } from "./components.js";
import { cycleTheme, themePreference } from "./theme.js";

const NAV = [
  { name: "today", label: "Today", icon: "today" },
  { name: "map", label: "Skill map", icon: "map", match: ["map", "skill"] },
  { name: "mistakes", label: "Mistakes", icon: "notebook" },
  { name: "insights", label: "Insights", icon: "insights" },
  { name: "exam", label: "Mock exam", icon: "exam" }
];

const THEME_META = {
  system: { icon: "monitor", label: "System theme" },
  light: { icon: "today", label: "Light theme" },
  dark: { icon: "moon", label: "Dark theme" }
};

export function renderRail() {
  const rail = document.querySelector("#rail");
  const current = route().name;
  const hasLibraries = catalog().libraries.length > 0;
  const stats = hasLibraries ? todayStats() : null;
  const mistakes = hasLibraries ? openMistakes().length : 0;

  const counts = {
    today: stats && stats.due > 0 ? stats.due : null,
    mistakes: mistakes > 0 ? mistakes : null
  };

  const nav = h(
    "nav",
    { class: "rail-nav", "aria-label": "Primary" },
    NAV.map((entry) => {
      const active = (entry.match || [entry.name]).includes(current);
      return h(
        "a",
        { class: ["rail-link", active && "is-active"], href: href(entry.name), "aria-current": active ? "page" : null },
        icon(entry.icon),
        h("span", { class: "rail-link-label", text: entry.label }),
        counts[entry.name] != null && h("span", { class: "rail-count", text: String(counts[entry.name]), "aria-label": `${counts[entry.name]} pending` })
      );
    })
  );

  const theme = THEME_META[themePreference()];

  const children = [
    h(
      "a",
      { class: "brand", href: href("today") },
      h("span", { class: "brand-mark" }, icon("brand", { size: 20 })),
      h("span", { class: "brand-text" }, h("strong", { text: "Recall" }), h("span", { text: "Learning studio" }))
    ),
    nav,
    h("div", { class: "rail-spacer" }),
    stats && streakCard(stats),
    h(
      "div",
      { class: "rail-footer" },
      h(
        "a",
        { class: ["rail-link", "rail-link-sm", current === "settings" && "is-active"], href: href("settings") },
        icon("settings"),
        h("span", { class: "rail-link-label", text: "Settings" })
      ),
      h(
        "button",
        {
          type: "button",
          class: "rail-theme",
          title: `${theme.label} — click to change`,
          "aria-label": `${theme.label}. Change theme`,
          onClick: () => {
            cycleTheme();
            renderRail();
          }
        },
        icon(theme.icon)
      )
    )
  ];
  rail.replaceChildren(...children.filter(Boolean));
}

function streakCard(stats) {
  const progressValue = stats.goal ? stats.done / stats.goal : 0;
  return h(
    "div",
    { class: "rail-streak" },
    h(
      "div",
      { class: "rail-streak-row" },
      h("span", { class: ["streak-flame", stats.streak > 0 && "is-lit"] }, icon("flame", { size: 18 })),
      h("strong", { text: stats.streak > 0 ? `${stats.streak}-day streak` : "No streak yet" }),
      stats.freezes > 0 && h("span", { class: "freeze-count", title: `${plural(stats.freezes, "streak freeze")} — covers a missed day automatically` }, icon("snow", { size: 14 }), String(stats.freezes))
    ),
    meter(progressValue, { tone: stats.goalMet ? "good" : "accent", label: "Daily goal" }),
    h("div", { class: "rail-streak-sub", text: stats.goalMet ? `Goal met · ${stats.done} today` : `${stats.done} / ${stats.goal} cards today` })
  );
}
