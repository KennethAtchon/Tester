// Builds "plays" — the ordered steps plus rules for each way of learning:
// lessons, Design Lab projects, spaced review, and the games. The player
// runs any of them; only the options differ (timer, lives, combo, feedback).

import { catalog, getLesson, getItem, getUnit, getCourse } from "./catalog.js";
import { progress, settings } from "./progress.js";
import { dueItemKeys, seenItemKeys, todayCounts, itemKnowledge, isReviewable, isLessonComplete, isLessonUnlocked } from "./learner.js";
import { retrievability } from "../domain/fsrs.js";
import { choiceAnswers } from "../domain/grading.js";

function newId() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function fromItem(itemKey, mode, extra = {}) {
  const item = getItem(itemKey);
  return { step: item.step, itemKey, lessonKey: item.lessonKey, mode, requeues: 0, ...extra };
}

export function lessonPlay(lessonKey) {
  const lesson = getLesson(lessonKey);
  const course = getCourse(lesson.courseId);
  const unit = getUnit(lesson.unitKey);
  return {
    id: newId(),
    kind: "lesson",
    key: lessonKey,
    title: lesson.title,
    subtitle: unit?.title ?? course.title,
    color: course.color,
    steps: lesson.steps.map((step) => ({
      step,
      itemKey: lesson.items.includes(`${lessonKey}::${step.id}`) ? `${lessonKey}::${step.id}` : null,
      lessonKey,
      mode: "lesson",
      requeues: 0
    })),
    options: { requeue: true, hints: true, confidence: settings().confidenceInLessons, selfExplain: settings().selfExplain }
  };
}

export function projectPlay(projectKey, { interview = false } = {}) {
  const project = getLesson(projectKey);
  const course = getCourse(project.courseId);
  return {
    id: newId(),
    kind: "project",
    key: projectKey,
    title: project.title,
    subtitle: interview ? "Interview mode · feedback at the end" : `Design Lab · ${project.difficulty}`,
    color: course.color,
    brief: project.brief,
    stages: project.stages,
    steps: project.steps.map((step) => ({
      step,
      itemKey: project.items.includes(`${projectKey}::${step.id}`) ? `${projectKey}::${step.id}` : null,
      lessonKey: projectKey,
      mode: "project",
      stageId: step.stageId,
      stageTitle: step.stageTitle,
      requeues: 0
    })),
    options: { interview, deferFeedback: interview, hints: !interview, timerMs: interview ? 45 * 60 * 1000 : null }
  };
}

// Spaced review. kind: due | ahead | mistakes
export function reviewPlay({ kind = "due", size = null } = {}) {
  const target = size ?? settings().sessionSize;
  const now = Date.now();
  let keys = [];
  let title = "Daily review";
  let subtitle = "Spaced recall, most-forgotten first.";

  if (kind === "due") {
    const cap = Math.max(0, settings().maxReviewsPerDay - todayCounts(now).reviewsToday);
    keys = dueItemKeys(now).slice(0, Math.min(cap, target));
    keys = withQuickWin(keys, now);
  } else if (kind === "mistakes") {
    title = "Mistake drill";
    subtitle = "Your own errors, re-asked. Fix them on a later day to clear them.";
    keys = Object.values(progress().mistakes)
      .filter((mistake) => !mistake.resolvedAt && getItem(mistake.item) && getItem(mistake.item).kind === "lesson")
      .sort((a, b) => Number(b.hyper) - Number(a.hyper) || b.lastTs - a.lastTs)
      .map((mistake) => mistake.item)
      .slice(0, Math.max(target, 15));
  } else {
    title = "Practice ahead";
    subtitle = "Nothing is due. These are your weakest cards.";
    const due = new Set(dueItemKeys(now));
    keys = seenItemKeys((item) => isReviewable(item) && !due.has(item.key))
      .map((key) => ({ key, knowledge: itemKnowledge(key, now) }))
      .sort((a, b) => a.knowledge - b.knowledge)
      .slice(0, target)
      .map((entry) => entry.key);
  }

  return {
    id: newId(),
    kind: "review",
    title,
    subtitle,
    steps: interleave(keys).map((key) => fromItem(key, "review")),
    options: { requeue: true, hints: true, confidence: true, recallFirst: settings().recallFirst, selfExplain: settings().selfExplain }
  };
}

// 60 seconds of quick single-answer questions you've already seen.
export function lightningPlay() {
  const known = seenItemKeys((item) => item.kind === "lesson" && quickChoice(item.step));
  const sorted = known
    .map((key) => ({ key, sort: (progress().items[key]?.lastCorrect ? 0 : 1) + Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map((entry) => entry.key);
  return {
    id: newId(),
    kind: "lightning",
    title: "Lightning round",
    subtitle: "60 seconds. Every right answer builds your combo.",
    steps: sorted.slice(0, 60).map((key) => fromItem(key, "lightning")),
    options: { timerMs: 60 * 1000, instant: true, combo: true, game: true, hints: false, minSteps: 5 }
  };
}

function quickChoice(step) {
  const answers = choiceAnswers(step);
  return step.type === "choice" && answers && answers.length === 1 && step.options.length <= 5 && String(step.prompt).length < 220;
}

// Drag-and-drop puzzles from lessons you've reached.
export function arcadePlay() {
  const types = new Set(["sort", "match", "order"]);
  const pool = [...catalog().items.values()].filter((item) => item.kind === "lesson" && types.has(item.step.type) && (progress().items[item.key] || isLessonUnlocked(item.lessonKey)));
  const picked = shuffle(pool).slice(0, 6).map((item) => item.key);
  return {
    id: newId(),
    kind: "arcade",
    title: "Sort & Match",
    subtitle: "Puzzles from across the course, mixed up.",
    steps: interleave(picked).map((key) => fromItem(key, "arcade")),
    options: { combo: true, game: true, minSteps: 1 }
  };
}

// Five estimation problems, least recently practiced first.
export function estimationPlay() {
  const pool = [...catalog().items.values()].filter((item) => item.step.type === "estimate");
  const ranked = pool
    .map((item) => ({ key: item.key, last: progress().items[item.key]?.lastReview ?? 0, sort: Math.random() }))
    .sort((a, b) => a.last - b.last || a.sort - b.sort)
    .slice(0, 5)
    .map((entry) => entry.key);
  return {
    id: newId(),
    kind: "estimation",
    title: "Estimation dojo",
    subtitle: "Scored by how close you get. Within 30% is a hit.",
    steps: ranked.map((key) => fromItem(key, "estimation")),
    options: { game: true, hints: false, minSteps: 1 }
  };
}

export function bossPlay(unitKey) {
  const unit = getUnit(unitKey);
  const course = getCourse(unit.courseId);
  const pool = unit.lessons.flatMap((lessonKey) => getLesson(lessonKey).items).filter((key) => isReviewable(getItem(key)) && getItem(key).step.type !== "text");
  const picked = interleave(shuffle(pool).slice(0, 10));
  return {
    id: newId(),
    kind: "boss",
    key: unitKey,
    title: `Boss: ${unit.title}`,
    subtitle: "Ten mixed questions. Three lives. No hints.",
    color: course.color,
    steps: picked.map((key) => fromItem(key, "boss")),
    options: { hearts: 3, game: true, hints: false, minSteps: 1 }
  };
}

export function bossAvailable(unitKey) {
  const unit = getUnit(unitKey);
  return unit.lessons.length > 0 && unit.lessons.every(isLessonComplete);
}

// A few questions from the early units so experienced learners can skip ahead.
export function placementPlay(courseId) {
  const course = getCourse(courseId);
  const picked = [];
  for (const unitKey of course.unitKeys.slice(0, 5)) {
    const unit = getUnit(unitKey);
    const items = unit.lessons.flatMap((lessonKey) => getLesson(lessonKey).items).map(getItem).filter((item) => item.step.type === "choice" && choiceAnswers(item.step));
    picked.push(...shuffle(items).slice(0, 2).map((item) => ({ ...fromItem(item.key, "placement"), unitKey })));
  }
  return {
    id: newId(),
    kind: "placement",
    key: courseId,
    title: "Placement check",
    subtitle: "Two questions per unit. Get both right to skip it.",
    color: course.color,
    steps: picked,
    options: { hints: false, game: true, minSteps: 1 }
  };
}

// Avoid two items from the same lesson back to back.
export function interleave(keys) {
  const remaining = [...keys];
  const result = [];
  let last = null;
  while (remaining.length > 0) {
    let index = remaining.findIndex((key) => getItem(key)?.lessonKey !== last);
    if (index < 0) {
      index = 0;
    }
    const [next] = remaining.splice(index, 1);
    result.push(next);
    last = getItem(next)?.lessonKey ?? null;
  }
  return result;
}

function withQuickWin(keys, now) {
  let best = -1;
  let bestRecall = -1;
  keys.forEach((key, index) => {
    const memory = progress().items[key];
    const recall = memory?.lastCorrect ? retrievability(memory, now) : 0;
    if (recall > bestRecall) {
      bestRecall = recall;
      best = index;
    }
  });
  if (best > 0) {
    const [first] = keys.splice(best, 1);
    keys.unshift(first);
  }
  return keys;
}

export function shuffle(list) {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function openMistakeCount() {
  return Object.values(progress().mistakes).filter((mistake) => !mistake.resolvedAt && getItem(mistake.item)).length;
}
