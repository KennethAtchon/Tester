// Progress: Overview (level, streak, each subject and course, badges), the
// mistake notebook, and Insights (calibration, forgetting curve, and more).

import { h } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { pageHead, statTile, meter, card, pct, plural } from "../components.js";
import { progress } from "../../state/progress.js";
import { catalog, coursesIn } from "../../state/catalog.js";
import { levelInfo, earnedBadges, courseStats, subjectStats, weekXp, todayStats } from "../../state/learner.js";
import { openMistakeCount } from "../../state/sessions.js";
import { formatAgo } from "../../lib/time.js";
import { navigate } from "../router.js";
import { mistakesPanel } from "./mistakes.js";
import { insightsPanel } from "./insights.js";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "mistakes", label: "Mistakes" },
  { id: "insights", label: "Insights" }
];

export function renderProgress(root, [tab = "overview"] = []) {
  const page = h("div", { class: "page" });
  root.append(page);
  const current = TABS.some((entry) => entry.id === tab) ? tab : "overview";
  const mistakes = openMistakeCount();

  page.append(
    pageHead({ eyebrow: "Progress", title: "How you're doing" }),
    h(
      "div",
      { class: "tabs", role: "tablist" },
      TABS.map((entry) =>
        h(
          "button",
          { type: "button", role: "tab", "aria-selected": String(entry.id === current), class: ["tab", entry.id === current && "is-active"], onClick: () => navigate("progress", entry.id) },
          entry.label,
          entry.id === "mistakes" && mistakes > 0 && h("span", { class: "tab-count", text: String(mistakes) })
        )
      )
    )
  );

  const body = h("div", { class: "tab-body" });
  page.append(body);
  const paint = () => {
    body.replaceChildren(current === "mistakes" ? mistakesPanel(paint) : current === "insights" ? insightsPanel() : overview());
  };
  paint();
}

function overview() {
  const data = progress();
  const level = levelInfo();
  const today = todayStats();
  const lessonsDone = Object.entries(data.lessons).filter(([key, record]) => record.completedAt && !key.includes("::lab::")).length;
  const designs = Object.entries(data.lessons).filter(([key, record]) => key.includes("::lab::") && record.best != null).length;
  const bosses = Object.entries(data.games).filter(([key, record]) => key.startsWith("boss:") && record.won).length;
  const badges = earnedBadges();

  return h(
    "div",
    { class: "panel" },
    h(
      "section",
      { class: "level-card" },
      h("span", { class: "level-badge is-big", text: String(level.level) }),
      h(
        "div",
        { class: "level-text" },
        h("strong", { text: `Level ${level.level}` }),
        h("span", { class: "muted", text: `${data.stats.xpTotal || 0} XP total · ${weekXp()} this week` }),
        meter(level.progress, { tone: "brand", label: "Level progress" }),
        h("span", { class: "muted small", text: `${level.next - (data.stats.xpTotal || 0)} XP to level ${level.level + 1}` })
      ),
      h("div", { class: "level-streak" }, h("span", { class: ["streak-flame", "is-big", today.streak > 0 && "is-lit"] }, icon("flame", { size: 28 })), h("strong", { text: plural(today.streak, "day") }), h("span", { class: "muted small", text: `best ${today.best}` }))
    ),
    h(
      "div",
      { class: "stat-row" },
      statTile({ label: "Lessons finished", value: String(lessonsDone) }),
      statTile({ label: "Systems designed", value: String(designs) }),
      statTile({ label: "Bosses beaten", value: String(bosses) }),
      statTile({ label: "Best combo", value: `×${data.stats.bestCombo || 0}`, sub: data.games.lightning ? `Lightning best ${data.games.lightning.best}` : null })
    ),
    card(
      { title: "Subjects" },
      h(
        "div",
        { class: "subject-progress" },
        catalog().subjects.filter((subject) => subject.courseIds.length > 0).map((subject) => {
          const stats = subjectStats(subject.id);
          return h(
            "section",
            { class: "subject-progress-group" },
            h(
              "div",
              { class: "course-row is-subject", style: { "--course": subject.color } },
              h("span", { class: "subject-badge", style: { "--subject": subject.color } }, icon(subject.icon, { size: 15 })),
              h("a", { class: "course-row-title", href: `#/subject/${encodeURIComponent(subject.id)}`, text: subject.title }),
              meter(stats.progress, { label: `${subject.title} progress` }),
              h("span", { class: "num muted", text: `${stats.done}/${stats.total} · ${pct(stats.progress)}` })
            ),
            h(
              "ul",
              { class: "course-rows" },
              coursesIn(subject.id).map((course) => {
                const courseProgress = courseStats(course.id);
                return h(
                  "li",
                  { class: "course-row", style: { "--course": course.color } },
                  h("span", { class: "course-dot" }),
                  h("a", { class: "course-row-title", href: `#/course/${encodeURIComponent(course.id)}`, text: course.title }),
                  meter(courseProgress.progress, { label: `${course.title} progress` }),
                  h("span", { class: "num muted", text: `${courseProgress.done}/${courseProgress.total} · ${pct(courseProgress.progress)}` })
                );
              })
            )
          );
        })
      )
    ),
    card(
      { title: "Badges", sub: "Earned for mastery and milestones, never for time spent." },
      h(
        "ul",
        { class: "badge-grid" },
        badges.map((badge) =>
          h(
            "li",
            { class: ["badge-tile", badge.earnedAt && "is-earned"] },
            h("span", { class: "badge-icon" }, icon(badge.earnedAt ? "star" : "lock", { size: 20 })),
            h("strong", { text: badge.title }),
            h("span", { class: "muted small", text: badge.earnedAt ? `${badge.description} · ${formatAgo(badge.earnedAt)}` : badge.description })
          )
        )
      )
    )
  );
}
