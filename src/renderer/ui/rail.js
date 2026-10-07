// Left navigation rail: brand, the subject switcher, destinations with live
// counts, and a card with level, today's XP toward the daily goal, and the
// streak.

import { h } from "../lib/dom.js";
import { icon } from "./icons.js";
import { route, href, refresh } from "./router.js";
import { catalog, currentSubject, setCurrentSubject, practiceScope } from "../state/catalog.js";
import { todayStats, levelInfo, subjectNextLesson, dueCount } from "../state/learner.js";
import { openMistakeCount } from "../state/sessions.js";
import { meter, plural, openMenu } from "./components.js";
import { cycleTheme, themePreference } from "./theme.js";
import { subjectDialog } from "./views/subjects.js";

const THEME_META = {
  system: { icon: "monitor", label: "System theme" },
  light: { icon: "today", label: "Light theme" },
  dark: { icon: "moon", label: "Dark theme" }
};

export function renderRail() {
  const rail = document.querySelector("#rail");
  const current = route().name;
  const subject = currentSubject();
  const hasCourses = catalog().courses.length > 0;
  const stats = hasCourses ? todayStats() : null;
  const due = hasCourses ? dueCount(practiceScope()) : 0;
  const mistakes = hasCourses ? openMistakeCount() : 0;
  const next = subject && subjectNextLesson(subject.id);
  const pathCourse = next?.course ?? catalog().courses.find((course) => course.subjectId === subject?.id);
  const hasProjects = catalog().projects.size > 0;

  const NAV = [
    { name: "home", label: "Home", icon: "today" },
    pathCourse && { name: "course", params: [pathCourse.id], label: "Course", icon: "map", match: ["course"] },
    { name: "practice", label: "Practice", icon: "zap", count: due || null },
    hasProjects && { name: "lab", label: "Design Lab", icon: "layers" },
    { name: "progress", label: "Progress", icon: "insights", count: mistakes || null },
    { name: "subjects", label: "Subjects", icon: "grid", match: ["subjects", "subject", "write", "library"] }
  ].filter(Boolean);

  const nav = h(
    "nav",
    { class: "rail-nav", "aria-label": "Primary" },
    NAV.map((entry) => {
      const active = (entry.match || [entry.name]).includes(current);
      return h(
        "a",
        { class: ["rail-link", active && "is-active"], href: href(entry.name, ...(entry.params || [])), "aria-current": active ? "page" : null },
        icon(entry.icon),
        h("span", { class: "rail-link-label", text: entry.label }),
        entry.count != null && h("span", { class: "rail-count", text: String(entry.count) })
      );
    })
  );

  const theme = THEME_META[themePreference()];
  const children = [
    h(
      "a",
      { class: "brand", href: href("home") },
      h("span", { class: "brand-mark" }, icon("brand", { size: 20 })),
      h("span", { class: "brand-text" }, h("strong", { text: "Recall" }), h("span", { text: "Learn by doing" }))
    ),
    subject && subjectSwitcher(subject),
    nav,
    h("div", { class: "rail-spacer" }),
    stats && statusCard(stats),
    h(
      "div",
      { class: "rail-footer" },
      h("a", { class: ["rail-link", "rail-link-sm", current === "settings" && "is-active"], href: href("settings") }, icon("settings"), h("span", { class: "rail-link-label", text: "Settings" })),
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

function statusCard(stats) {
  const level = levelInfo();
  return h(
    "div",
    { class: "rail-status" },
    h(
      "div",
      { class: "rail-level" },
      h("span", { class: "level-badge", text: String(level.level) }),
      h("div", { class: "rail-level-text" }, h("strong", { text: `Level ${level.level}` }), h("span", { text: `${level.next - level.floor - level.into} XP to level ${level.level + 1}` }))
    ),
    meter(level.progress, { tone: "brand", label: "Level progress" }),
    h(
      "div",
      { class: "rail-row" },
      h("span", { class: ["streak-flame", stats.streak > 0 && "is-lit"], title: `${plural(stats.streak, "day")} in a row` }, icon("flame", { size: 16 }), String(stats.streak)),
      h("span", { class: "rail-goal", title: "Today's XP toward your daily goal" }, `${Math.min(stats.xpToday, stats.goal)}/${stats.goal} XP`),
      stats.freezes > 0 && h("span", { class: "freeze-count", title: `${plural(stats.freezes, "streak freeze")} — covers a missed day` }, icon("snow", { size: 14 }), String(stats.freezes))
    ),
    meter(stats.goal ? stats.xpToday / stats.goal : 0, { tone: stats.goalMet ? "good" : "accent", label: "Daily goal" })
  );
}

// The subject being studied, and a menu to switch to another one.
function subjectSwitcher(subject) {
  const trigger = h(
    "button",
    {
      type: "button",
      class: "subject-switch",
      style: { "--subject": subject.color },
      title: "Switch subject",
      "aria-haspopup": "menu",
      onClick: () =>
        openMenu(
          trigger,
          [
            ...catalog().subjects.map((entry) => ({
              label: entry.title,
              iconName: entry.icon,
              swatch: entry.color,
              active: entry.id === subject.id,
              onSelect: () => {
                setCurrentSubject(entry.id);
                if (["course", "subject", "write"].includes(route().name)) {
                  location.hash = href("home");
                } else {
                  refresh();
                }
              }
            })),
            "divider",
            { label: "All subjects", iconName: "grid", onSelect: () => (location.hash = href("subjects")) },
            { label: "New subject…", iconName: "plus", onSelect: () => subjectDialog(null, { onCreate: (id) => { setCurrentSubject(id); location.hash = href("subject", id); } }) }
          ],
          { className: "subject-menu" }
        )
    },
    h("span", { class: "subject-switch-icon" }, icon(subject.icon, { size: 16 })),
    h("span", { class: "subject-switch-text" }, h("span", { class: "subject-switch-label", text: "Studying" }), h("strong", { text: subject.title })),
    icon("updown", { size: 16, className: "subject-switch-caret" })
  );
  return trigger;
}
