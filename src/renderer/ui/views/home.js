// Home: pick up where you left off in the subject you're studying. The next
// lesson front and centre, the games you chose, your other subjects, today's
// goal and quests, and a guilt-free catch-up after a break. Answers "where am
// I, how am I doing, what next" at a glance.

import { h, append } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { button, ring, meter, plural, emptyState } from "../components.js";
import { progress, persist } from "../../state/progress.js";
import { catalog, getLesson, getUnit, currentSubject, setCurrentSubject, practiceScope } from "../../state/catalog.js";
import { todayStats, courseStats, subjectStats, subjectNextLesson, isLessonComplete, isLessonUnlocked, levelInfo, dueCount } from "../../state/learner.js";
import { todaysQuests } from "../../state/quests.js";
import { lessonPlay, reviewPlay } from "../../state/sessions.js";
import { GAMES } from "../../domain/games.js";
import { startPlay } from "../player.js";
import { navigate, refresh, href } from "../router.js";
import { enabledGames, gameCard } from "./games.js";
import { subjectBadge, subjectDialog } from "./subjects.js";

export function renderHome(root) {
  const page = h("div", { class: "page home" });
  root.append(page);
  const subject = currentSubject();

  if (!subject) {
    page.append(emptyState({ iconName: "grid", title: "No subjects yet", body: "Create a subject, then write or import a course for it.", actions: [button("New subject", { variant: "go", iconName: "plus", onClick: () => subjectDialog() })] }));
    return;
  }

  const stats = todayStats();
  const due = dueCount(practiceScope());
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 5 ? "Up late?" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  page.append(
    h(
      "header",
      { class: "home-head" },
      h("div", null, h("p", { class: "eyebrow", text: now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) }), h("h1", { class: "page-title", text: greeting })),
      h("div", { class: "home-pills" }, streakPill(stats), levelPill())
    )
  );

  if (stats.lapsedDays != null && stats.lapsedDays >= 3 && due > 0) {
    page.append(
      h(
        "div",
        { class: "welcome-back" },
        icon("sparkle", { size: 20 }),
        h("div", null, h("strong", { text: "Welcome back! " }), `No need to catch up on everything — here's a short review. The other ${Math.max(0, due - 6)} cards will spread over the next few days.`),
        button("3-minute catch-up", { variant: "go", onClick: () => startPlay(reviewPlay({ kind: "due", size: 6, scope: practiceScope() }), { returnTo: "home" }) })
      )
    );
  }

  const games = enabledGames();
  const scope = practiceScope();
  const others = catalog().subjects.filter((entry) => entry.id !== subject.id);
  page.append(
    h(
      "div",
      { class: "home-grid" },
      h(
        "div",
        { class: "home-main" },
        continueCard(subject),
        h(
          "section",
          { class: "home-section" },
          h("div", { class: "section-head" }, h("h2", null, "Your games", h("span", { class: "section-scope", text: scope ? ` · ${subject.title}` : " · All subjects" })), h("a", { class: "section-link", href: href("practice") }, "All games", icon("arrowRight", { size: 14 }))),
          h("div", { class: "game-grid" }, GAMES.filter((game) => game.id !== "lessons" && games.has(game.id)).map((game) => gameCard(game)))
        ),
        h(
          "section",
          { class: "home-section" },
          h("div", { class: "section-head" }, h("h2", { text: others.length ? "Your other subjects" : "Learn something else" }), h("a", { class: "section-link", href: href("subjects") }, "All subjects", icon("arrowRight", { size: 14 }))),
          h(
            "div",
            { class: "subject-strip" },
            others.map((entry) => {
              const entryStats = subjectStats(entry.id);
              return h(
                "button",
                { type: "button", class: "subject-chip", style: { "--subject": entry.color }, title: `Study ${entry.title}`, onClick: () => { setCurrentSubject(entry.id); refresh(); } },
                subjectBadge(entry, { size: 18 }),
                h("span", { class: "subject-chip-text" }, h("strong", { text: entry.title }), h("span", { text: entryStats.total ? `${entryStats.done}/${entryStats.total} lessons` : "No courses yet" }))
              );
            }),
            h("button", { type: "button", class: "subject-chip is-new", onClick: () => subjectDialog() }, h("span", { class: "subject-badge is-plain" }, icon("plus", { size: 18 })), h("span", { class: "subject-chip-text" }, h("strong", { text: "New subject" }), h("span", { text: "Math, science, anything" })))
          )
        )
      ),
      h("aside", { class: "home-side" }, goalCard(stats), questsCard(), planCard())
    )
  );
}

function streakPill(stats) {
  return h("span", { class: ["pill", "pill-streak", stats.streak > 0 && "is-lit"], title: stats.goalMet ? "Goal met today" : "Meet your daily goal to grow your streak" }, icon("flame", { size: 16 }), `${stats.streak} day${stats.streak === 1 ? "" : "s"}`);
}

function levelPill() {
  const level = levelInfo();
  return h("a", { class: "pill pill-level", href: href("progress"), title: `${level.into}/${level.span} XP into level ${level.level}` }, h("span", { class: "level-badge", text: String(level.level) }), h("span", { class: "pill-meter" }, meter(level.progress, { tone: "brand", label: "Level progress" })));
}

// The next lesson in the current subject, with a little window of the path
// around it.
function continueCard(subject) {
  const card = h("section", { class: "continue", style: { "--course": subject.color } });
  const stats = subjectStats(subject.id);
  const next = subjectNextLesson(subject.id);

  if (stats.courses === 0 || stats.total === 0) {
    append(
      card,
      h("p", { class: "eyebrow", text: subject.title }),
      h("h2", { class: "continue-title", text: "Add your first course" }),
      h("p", { class: "continue-sub", text: `${subject.title} doesn't have any lessons yet. Write a course in plain text, or import one you already have.` }),
      h(
        "div",
        { class: "continue-actions" },
        button("Write a course", { variant: "light", size: "lg", iconName: "pencil", onClick: () => navigate("write", subject.id) }),
        h("a", { class: "continue-link", href: href("subject", subject.id) }, "More ways to add")
      )
    );
    return card;
  }

  if (!next) {
    append(
      card,
      h("p", { class: "eyebrow", text: subject.title }),
      h("h2", { class: "continue-title", text: "Every lesson done!" }),
      h("p", { class: "continue-sub", text: "Keep it fresh with reviews and games, take on a project, or start another subject." }),
      h("div", { class: "continue-actions" }, button("Open the subject", { variant: "light", size: "lg", onClick: () => navigate("subject", subject.id) }))
    );
    return card;
  }

  const { course, lessonKey } = next;
  const lesson = getLesson(lessonKey);
  const unit = getUnit(lesson.unitKey);
  const index = course.lessonKeys.indexOf(lessonKey);
  const window = course.lessonKeys.slice(Math.max(0, index - 2), Math.min(course.lessonKeys.length, index + 3));
  const cStats = courseStats(course.id);

  append(
    card,
    h("p", { class: "eyebrow", text: `${course.title} · Unit ${lesson.unitIndex + 1}: ${unit.title}` }),
    h("h2", { class: "continue-title", text: lesson.title }),
    lesson.summary && h("p", { class: "continue-sub", text: lesson.summary }),
    h(
      "div",
      { class: "mini-path", "aria-hidden": "true" },
      window.map((key) => h("span", { class: ["mini-node", isLessonComplete(key) && "is-done", key === lessonKey && "is-current", !isLessonUnlocked(key) && "is-locked"] }, icon(isLessonComplete(key) ? "check" : key === lessonKey ? "play2" : isLessonUnlocked(key) ? "book" : "lock", { size: 14 })))
    ),
    h(
      "div",
      { class: "continue-actions" },
      button(cStats.done === 0 ? "Start learning" : "Continue", { variant: "light", size: "lg", iconName: "play2", onClick: () => startPlay(lessonPlay(lessonKey), { returnTo: "home" }) }),
      h("a", { class: "continue-link", href: href("course", course.id) }, "View the path")
    ),
    h("div", { class: "continue-progress" }, meter(cStats.progress, { tone: "light", label: "Course progress" }), h("span", { text: `${cStats.done}/${cStats.total} lessons · ${lesson.minutes} min` }))
  );
  return card;
}

function goalCard(stats) {
  return h(
    "section",
    { class: "card goal-card" },
    ring(stats.goal ? stats.xpToday / stats.goal : 0, { size: 96, stroke: 9, label: String(stats.xpToday), sublabel: `of ${stats.goal} XP`, tone: stats.goalMet ? "good" : "accent", ariaLabel: `${stats.xpToday} of ${stats.goal} XP today` }),
    h(
      "div",
      { class: "goal-text" },
      h("strong", { text: stats.goalMet ? "Daily goal met" : "Today's goal" }),
      h("span", { class: "muted small", text: stats.goalMet ? "Anything more is a bonus. Spacing beats cramming." : `${stats.goal - stats.xpToday} XP to keep your streak going.` }),
      stats.freezes > 0 && h("span", { class: "muted small" }, icon("snow", { size: 12 }), ` ${plural(stats.freezes, "streak freeze")} ready`)
    )
  );
}

function questsCard() {
  const quests = todaysQuests();
  return h(
    "section",
    { class: "card quests" },
    h("div", { class: "card-head" }, h("h2", { class: "card-title", text: "Daily quests" }), h("span", { class: "muted small", text: "New ones tomorrow" })),
    h(
      "ul",
      { class: "quest-list" },
      quests.map((quest) =>
        h(
          "li",
          { class: ["quest", quest.done && "is-done"] },
          h("span", { class: "quest-icon" }, icon(quest.done ? "check" : "target", { size: 16 })),
          h("div", { class: "quest-body" }, h("span", { class: "quest-title", text: quest.title }), meter(quest.progress / quest.target, { tone: quest.done ? "good" : "gold", label: quest.title })),
          h("span", { class: "quest-xp", text: `+${quest.xp}` })
        )
      )
    )
  );
}

let editingPlan = false;

// Implementation intention: "After ___, I will ___." (Gollwitzer)
function planCard() {
  const plan = progress().plan;
  if (plan.after && plan.will && !editingPlan) {
    return h(
      "section",
      { class: "card plan-card" },
      h("div", { class: "card-head" }, h("h2", { class: "card-title", text: "Your plan" }), button("", { variant: "ghost", size: "sm", iconName: "pencil", title: "Edit", onClick: () => { editingPlan = true; refresh(); } })),
      h("p", { class: "plan-sentence" }, "After ", h("strong", { text: plan.after }), ", I will ", h("strong", { text: plan.will }), ".")
    );
  }
  const after = h("input", { type: "text", class: "input input-sm", placeholder: "my morning coffee", value: plan.after || "", "aria-label": "After…" });
  const will = h("input", { type: "text", class: "input input-sm", placeholder: "do one lesson", value: plan.will || "do one lesson", "aria-label": "I will…" });
  return h(
    "section",
    { class: "card plan-card" },
    h("h2", { class: "card-title", text: "Make a plan" }),
    h("p", { class: "muted small", text: "Deciding when you'll practice makes you far more likely to follow through." }),
    h(
      "form",
      {
        class: "plan-form",
        onSubmit: (event) => {
          event.preventDefault();
          if (!after.value.trim()) {
            after.focus();
            return;
          }
          plan.after = after.value.trim();
          plan.will = will.value.trim() || "do one lesson";
          editingPlan = false;
          persist();
          refresh();
        }
      },
      h("label", { class: "plan-field" }, h("span", { text: "After" }), after),
      h("label", { class: "plan-field" }, h("span", { text: "I will" }), will),
      button("Save plan", { variant: "primary", size: "sm", type: "submit" })
    )
  );
}
