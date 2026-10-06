// The course path: units as sections, lessons as nodes on a winding path
// (done with stars, the next one glowing, later ones locked), a boss at the
// end of each unit, and the Design Lab projects after. Locked lessons can be
// opened early — autonomy beats a forced funnel.

import { h } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { button, meter, chip, pct, emptyState } from "../components.js";
import { progress } from "../../state/progress.js";
import { catalog, getCourse, getLesson, getUnit } from "../../state/catalog.js";
import { courseStats, unitStats, nextLessonKey, isLessonComplete, isLessonUnlocked, isPlacedOut, lessonRecord, unlockLesson, masteryOf } from "../../state/learner.js";
import { lessonPlay, bossPlay, bossAvailable, placementPlay } from "../../state/sessions.js";
import { startPlay } from "../player.js";
import { navigate } from "../router.js";
import { projectCard } from "./lab.js";

const OFFSETS = [0, 1, 2, 1, 0, -1, -2, -1];

export function renderCourse(root, [courseId]) {
  const course = getCourse(courseId) || catalog().courses[0];
  const page = h("div", { class: "page course-page" });
  root.append(page);
  if (!course) {
    page.append(emptyState({ iconName: "map", title: "No course", body: "Add one from the Library.", actions: [button("Library", { onClick: () => navigate("library") })] }));
    return;
  }

  const stats = courseStats(course.id);
  const next = nextLessonKey(course.id);
  const returnTo = `course/${course.id}`;

  page.append(
    h(
      "header",
      { class: "course-hero", style: { "--course": course.color } },
      h("p", { class: "eyebrow", text: course.source === "builtin" ? "Course" : "Your course" }),
      h("h1", { class: "course-title", text: course.title }),
      course.tagline && h("p", { class: "course-tagline", text: course.tagline }),
      h("div", { class: "course-progress" }, meter(stats.progress, { tone: "light", label: "Course progress" }), h("span", { text: `${stats.done}/${stats.total} lessons${stats.labsTotal ? ` · ${stats.labs}/${stats.labsTotal} designs` : ""}` })),
      h(
        "div",
        { class: "course-actions" },
        next && button(stats.done ? "Continue" : "Start", { variant: "light", size: "lg", iconName: "play2", onClick: () => startPlay(lessonPlay(next), { returnTo }) }),
        stats.done === 0 && !progress().profile.placementDone && button("Place me", { variant: "ghost-light", iconName: "compass", title: "A two-minute check that unlocks units you already know", onClick: () => startPlay(placementPlay(course.id), { returnTo }) })
      )
    )
  );

  course.unitKeys.forEach((unitKey, unitIndex) => page.append(unitSection(course, unitKey, unitIndex, next, returnTo)));

  if (course.projectKeys.length) {
    page.append(
      h(
        "section",
        { class: "unit lab-unit" },
        h("header", { class: "unit-head" }, h("div", null, h("p", { class: "eyebrow", text: "Capstone" }), h("h2", { class: "unit-title", text: "Design Lab" }), h("p", { class: "unit-desc", text: "Design complete systems end to end. Every stage is graded, and you get a scorecard you can export for review." }))),
        h("div", { class: "project-grid" }, course.projectKeys.map((key) => projectCard(getLesson(key), { returnTo })))
      )
    );
  }
}

function unitSection(course, unitKey, unitIndex, next, returnTo) {
  const unit = getUnit(unitKey);
  const stats = unitStats(unitKey);
  const path = h("ol", { class: "path" });

  unit.lessons.forEach((lessonKey, index) => {
    const lesson = getLesson(lessonKey);
    const done = isLessonComplete(lessonKey);
    const unlocked = isLessonUnlocked(lessonKey);
    const current = lessonKey === next;
    const record = lessonRecord(lessonKey);
    const offset = OFFSETS[(index + unitIndex * 3) % OFFSETS.length];
    path.append(
      h(
        "li",
        { class: "path-step", style: { "--offset": String(offset) } },
        h(
          "button",
          {
            type: "button",
            class: ["path-node", done && "is-done", current && "is-current", !unlocked && "is-locked"],
            "aria-label": `${lesson.title}${done ? `, completed with ${record.stars} stars` : current ? ", next up" : !unlocked ? ", locked" : ""}`,
            onClick: () => openLesson(lessonKey, unlocked, returnTo)
          },
          icon(done ? "check" : current ? "play2" : unlocked ? "book" : "lock", { size: 26 })
        ),
        h(
          "div",
          { class: "path-label" },
          current && h("span", { class: "path-next", text: "Next up" }),
          h("strong", { text: lesson.title }),
          h(
            "span",
            { class: "path-meta" },
            done ? h("span", { class: "path-stars", "aria-hidden": "true" }, [1, 2, 3].map((star) => icon("star", { size: 13, className: star <= record.stars ? "is-lit" : "" }))) : isPlacedOut(lessonKey) ? "Tested out · open anytime" : `${lesson.minutes} min`,
            done && masteryOf(lessonKey) > 0 && h("span", { class: "muted", text: ` · ${pct(masteryOf(lessonKey))} recall` })
          )
        )
      )
    );
  });

  const bossReady = bossAvailable(unitKey);
  path.append(
    h(
      "li",
      { class: "path-step is-boss", style: { "--offset": "0" } },
      h(
        "button",
        {
          type: "button",
          class: ["path-node", "boss-node", stats.bossBeaten && "is-done", bossReady && !stats.bossBeaten && "is-current", !bossReady && "is-locked"],
          "aria-label": `${unit.title} boss${stats.bossBeaten ? ", defeated" : bossReady ? ", ready" : ", locked"}`,
          onClick: () => {
            if (bossReady) {
              startPlay(bossPlay(unitKey), { returnTo });
            } else {
              import("../toast.js").then(({ toast }) => toast("Finish every lesson in this unit to face its boss."));
            }
          }
        },
        icon(stats.bossBeaten ? "crown" : "trophy", { size: 26 })
      ),
      h("div", { class: "path-label" }, h("strong", { text: "Unit boss" }), h("span", { class: "path-meta", text: stats.bossBeaten ? "Defeated" : bossReady ? "Three lives · ten questions" : "Locked" }))
    )
  );

  return h(
    "section",
    { class: "unit", style: { "--course": course.color } },
    h(
      "header",
      { class: "unit-head" },
      h("div", null, h("p", { class: "eyebrow", text: `Unit ${unitIndex + 1}` }), h("h2", { class: "unit-title", text: unit.title }), unit.description && h("p", { class: "unit-desc", text: unit.description })),
      h("div", { class: "unit-stats" }, chip(`${stats.done}/${stats.total} lessons`, { tone: stats.complete ? "good" : null, iconName: stats.complete ? "check" : null }), stats.done > 0 && chip(`${pct(stats.mastery)} recall`, { title: "How much of this unit you could recall right now" }))
    ),
    path
  );
}

function openLesson(lessonKey, unlocked, returnTo) {
  if (!unlocked) {
    const lesson = getLesson(lessonKey);
    if (!window.confirm(`Jump ahead to “${lesson.title}”? The earlier lessons stay open for whenever you want them.`)) {
      return;
    }
    unlockLesson(lessonKey);
  }
  startPlay(lessonPlay(lessonKey), { returnTo });
}

