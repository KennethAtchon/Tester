// Game cards and launchers shared by Home and Practice: what each game is,
// its live status (due counts, personal bests, what's unlocked), and how to
// start it.

import { h } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { progress } from "../../state/progress.js";
import { catalog, getUnit, getLesson } from "../../state/catalog.js";
import { todayStats, seenItemKeys, nextLessonKey, courseStats } from "../../state/learner.js";
import { reviewPlay, lightningPlay, arcadePlay, estimationPlay, bossPlay, bossAvailable, lessonPlay, openMistakeCount } from "../../state/sessions.js";
import { gradeLetter } from "../../domain/rewards.js";
import { startPlay } from "../player.js";
import { navigate } from "../router.js";
import { plural } from "../components.js";

export function enabledGames() {
  const games = progress().profile.games;
  return new Set(games?.length ? games : ["lessons", "review", "lab"]);
}

function nextBossUnit() {
  for (const course of catalog().courses) {
    for (const unitKey of course.unitKeys) {
      if (bossAvailable(unitKey) && !progress().games[`boss:${unitKey}`]?.won) {
        return unitKey;
      }
    }
  }
  return null;
}

export function gameStatus(gameId) {
  const record = progress().games[gameId];
  const best = record?.best;
  switch (gameId) {
    case "lessons": {
      const course = catalog().courses[0];
      if (!course) {
        return { line: "Add a course to begin", ready: false };
      }
      const stats = courseStats(course.id);
      const next = nextLessonKey(course.id);
      return { line: next ? `Next: ${getLesson(next).title}` : "Course complete!", sub: `${stats.done}/${stats.total} lessons`, ready: Boolean(next) };
    }
    case "review": {
      const due = todayStats().due;
      const seen = seenItemKeys().length;
      const mistakes = openMistakeCount();
      return { line: due ? `${plural(due, "card")} due` : seen ? "All caught up" : "Starts after your first lesson", sub: mistakes ? `${plural(mistakes, "open mistake")}` : null, ready: seen > 0, badge: due || null };
    }
    case "lab": {
      const projects = [...catalog().projects.values()];
      const done = projects.filter((project) => progress().lessons[project.key]?.best != null);
      const bestScore = Math.max(0, ...done.map((project) => progress().lessons[project.key].best));
      return { line: projects.length ? `${done.length}/${projects.length} systems designed` : "No projects in your courses", sub: done.length ? `Best grade ${gradeLetter(bestScore)}` : null, ready: projects.length > 0 };
    }
    case "lightning": {
      const pool = lightningPlay().steps.length;
      return { line: pool >= 5 ? (best != null ? `Best: ${best} correct` : "60 seconds — how many can you get?") : "Unlocks after a couple of lessons", ready: pool >= 5 };
    }
    case "arcade":
      return { line: best != null ? `Best: ${best} solved` : "Sort, match, and sequence", ready: arcadePlay().steps.length > 0 };
    case "estimation":
      return { line: best != null ? `Best: ${best}/5 within 30%` : "Five numbers, scored by closeness", ready: estimationPlay().steps.length > 0 };
    case "boss": {
      const unitKey = nextBossUnit();
      const beaten = Object.entries(progress().games).filter(([id, value]) => id.startsWith("boss:") && value.won).length;
      return { line: unitKey ? `Ready: ${getUnit(unitKey).title}` : "Finish a unit to face its boss", sub: beaten ? `${plural(beaten, "boss", "bosses")} beaten` : null, ready: Boolean(unitKey) };
    }
    default:
      return { line: "", ready: false };
  }
}

export function launchGame(gameId) {
  const returnTo = location.hash.replace(/^#\/?/, "") || "home";
  switch (gameId) {
    case "lessons": {
      const course = catalog().courses[0];
      const next = course && nextLessonKey(course.id);
      if (next) {
        startPlay(lessonPlay(next), { returnTo });
      } else if (course) {
        navigate("course", course.id);
      } else {
        navigate("library");
      }
      return;
    }
    case "review":
      startPlay(todayStats().due > 0 ? reviewPlay({ kind: "due" }) : reviewPlay({ kind: "ahead" }), { returnTo });
      return;
    case "lab":
      navigate("lab");
      return;
    case "lightning":
      startPlay(lightningPlay(), { returnTo });
      return;
    case "arcade":
      startPlay(arcadePlay(), { returnTo });
      return;
    case "estimation":
      startPlay(estimationPlay(), { returnTo });
      return;
    case "boss": {
      const unitKey = nextBossUnit();
      if (unitKey) {
        startPlay(bossPlay(unitKey), { returnTo });
      } else {
        const course = catalog().courses[0];
        if (course) {
          navigate("course", course.id);
        }
      }
      return;
    }
    default:
  }
}

export function gameCard(game, { large = false } = {}) {
  const status = gameStatus(game.id);
  return h(
    "button",
    {
      type: "button",
      class: ["game-card", `game-card-${game.id}`, large && "is-large", !status.ready && "is-waiting"],
      onClick: () => launchGame(game.id),
      title: game.science
    },
    h("span", { class: `game-icon game-${game.id}` }, icon(game.icon, { size: large ? 26 : 22 })),
    h(
      "span",
      { class: "game-card-text" },
      h("strong", { class: "game-card-title", text: game.title }),
      h("span", { class: "game-card-line", text: status.line }),
      status.sub && h("span", { class: "game-card-sub", text: status.sub })
    ),
    status.badge != null && h("span", { class: "game-card-badge", text: String(status.badge) }),
    h("span", { class: "game-card-go" }, icon(status.ready ? "play2" : "arrowRight", { size: 16 }))
  );
}
