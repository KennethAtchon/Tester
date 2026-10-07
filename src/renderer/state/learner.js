// The learner model: per-item memory (FSRS), mastery per lesson, lesson
// completion and unlocks, the review log, the mistake notebook, XP and levels,
// badges, game records, and the daily-goal streak. Every answer flows through
// recordAttempt; finishing a lesson, game, or project goes through the
// matching complete*/record* function. Each returns what changed so the
// player can explain it.

import { progress, settings, persist } from "./progress.js";
import { catalog, getItem, getLesson, getUnit, getCourse, coursesIn, inScope } from "./catalog.js";
import { newMemory, review, retrievability } from "../domain/fsrs.js";
import { xpForAttempt, BADGES, levelFor, starsFor } from "../domain/rewards.js";
import { calibration } from "../domain/insights.js";
import { questEvent } from "./quests.js";
import { DAY_MS, dayKey, addDays, daysBetween, endOfStudyDay } from "../lib/time.js";

export const MASTERY_THRESHOLD = 0.8;
const REVIEW_TYPES = new Set(["choice", "sort", "order", "match", "estimate", "number", "fill", "text"]);

export function memoryOf(itemKey) {
  return progress().items[itemKey] || newMemory();
}

export function isReviewable(item) {
  if (!item || item.kind !== "lesson" || !REVIEW_TYPES.has(item.step.type)) {
    return false;
  }
  return item.step.type !== "text" || settings().includeLongForm;
}

// Chance of recalling the item now: memory strength if the last attempt
// succeeded, zero if never recalled or last missed.
export function itemKnowledge(itemKey, now = Date.now()) {
  const memory = progress().items[itemKey];
  if (!memory || memory.state === "new" || !memory.lastCorrect) {
    return 0;
  }
  return retrievability(memory, now);
}

export function masteryOf(lessonKey, now = Date.now()) {
  const lesson = getLesson(lessonKey);
  if (!lesson || lesson.items.length === 0) {
    return 0;
  }
  return lesson.items.reduce((sum, itemKey) => sum + itemKnowledge(itemKey, now), 0) / lesson.items.length;
}

// ── lessons, units, courses ─────────────────────────────────────────────────

export function lessonRecord(lessonKey) {
  return progress().lessons[lessonKey] || null;
}

export function isLessonComplete(lessonKey) {
  return Boolean(progress().lessons[lessonKey]?.completedAt);
}

// A lesson opens when the one before it (in course order) is done, when the
// learner skipped ahead to it, or when it's the first in the course.
export function isLessonUnlocked(lessonKey) {
  const lesson = getLesson(lessonKey);
  if (!lesson || lesson.kind === "project") {
    return Boolean(lesson);
  }
  if (lesson.order === 0 || progress().unlocked[lessonKey] || isLessonComplete(lessonKey)) {
    return true;
  }
  const course = getCourse(lesson.courseId);
  return isLessonComplete(course.lessonKeys[lesson.order - 1]);
}

export function unlockLesson(lessonKey) {
  progress().unlocked[lessonKey] ||= true;
  persist();
}

// Placement: a unit the learner tested out of stays open for review, and the
// path moves on to the lesson after it.
export function placeOutOf(unitKey) {
  const unit = getUnit(unitKey);
  const unlocked = progress().unlocked;
  for (const lessonKey of unit.lessons) {
    unlocked[lessonKey] = "placed";
  }
  const course = getCourse(getLesson(unit.lessons.at(-1)).courseId);
  const after = course.lessonKeys[course.lessonKeys.indexOf(unit.lessons.at(-1)) + 1];
  if (after) {
    unlocked[after] ||= true;
  }
  persist();
}

export function isPlacedOut(lessonKey) {
  return progress().unlocked[lessonKey] === "placed" && !isLessonComplete(lessonKey);
}

export function nextLessonKey(courseId) {
  const course = getCourse(courseId);
  if (!course) {
    return null;
  }
  const open = (key) => !isLessonComplete(key) && isLessonUnlocked(key);
  return course.lessonKeys.find((key) => open(key) && !isPlacedOut(key)) ?? course.lessonKeys.find(open) ?? course.lessonKeys.find((key) => !isLessonComplete(key)) ?? null;
}

export function unitStats(unitKey) {
  const unit = getUnit(unitKey);
  const done = unit.lessons.filter(isLessonComplete).length;
  const mastery = unit.lessons.reduce((sum, key) => sum + masteryOf(key), 0) / Math.max(1, unit.lessons.length);
  const boss = progress().games[`boss:${unitKey}`];
  return { done, total: unit.lessons.length, mastery, complete: done === unit.lessons.length, bossBeaten: Boolean(boss?.won), bossBest: boss?.best ?? null };
}

export function courseStats(courseId) {
  const course = getCourse(courseId);
  const done = course.lessonKeys.filter(isLessonComplete).length;
  const labs = course.projectKeys.filter((key) => progress().lessons[key]?.best != null).length;
  return { done, total: course.lessonKeys.length, labs, labsTotal: course.projectKeys.length, progress: course.lessonKeys.length ? done / course.lessonKeys.length : 0 };
}

export function subjectStats(subjectId) {
  const courses = coursesIn(subjectId);
  const lessonKeys = courses.flatMap((course) => course.lessonKeys);
  const done = lessonKeys.filter(isLessonComplete).length;
  const projects = courses.reduce((sum, course) => sum + course.projectKeys.length, 0);
  return { courses: courses.length, done, total: lessonKeys.length, projects, progress: lessonKeys.length ? done / lessonKeys.length : 0 };
}

// Where to continue in a subject: the course played most recently that still
// has lessons left, otherwise the first one that does.
export function subjectNextLesson(subjectId) {
  const lastPlayed = (course) => Math.max(0, ...course.lessonKeys.map((key) => progress().lessons[key]?.lastPlayed || 0));
  const open = coursesIn(subjectId)
    .map((course, index) => ({ course, index, lessonKey: nextLessonKey(course.id), played: lastPlayed(course) }))
    .filter((entry) => entry.lessonKey);
  open.sort((a, b) => b.played - a.played || a.index - b.index);
  return open[0] ? { course: open[0].course, lessonKey: open[0].lessonKey } : null;
}

// ── reviews ─────────────────────────────────────────────────────────────────

// scope: a subjectId, or null for every subject.
export function dueItemKeys(now = Date.now(), scope = null) {
  const horizon = endOfStudyDay(now);
  const due = [];
  for (const item of catalog().items.values()) {
    if (!isReviewable(item) || !inScope(item, scope)) {
      continue;
    }
    const memory = progress().items[item.key];
    if (memory && memory.state !== "new" && memory.dueAt != null && memory.dueAt <= horizon) {
      due.push({ key: item.key, recall: retrievability(memory, now) });
    }
  }
  due.sort((a, b) => a.recall - b.recall);
  return due.map((entry) => entry.key);
}

export function seenItemKeys(filter = () => true) {
  const keys = [];
  for (const item of catalog().items.values()) {
    const memory = progress().items[item.key];
    if (memory && memory.state !== "new" && filter(item)) {
      keys.push(item.key);
    }
  }
  return keys;
}

export function todayCounts(now = Date.now()) {
  const today = dayKey(now);
  const log = progress().log;
  let reviewsToday = 0;
  for (let index = log.length - 1; index >= 0 && dayKey(log[index].ts) === today; index -= 1) {
    if (log[index].mode === "review") {
      reviewsToday += 1;
    }
  }
  return { reviewsToday };
}

export function dueCount(scope = null, now = Date.now()) {
  return dueItemKeys(now, scope).length;
}

export function todayStats(now = Date.now()) {
  const data = progress();
  const goal = settings().dailyXp;
  const xpToday = data.streak.history[dayKey(now)] || 0;
  const lastTs = data.log.length ? data.log[data.log.length - 1].ts : null;
  return {
    goal,
    xpToday,
    goalMet: xpToday >= goal,
    due: dueItemKeys(now).length,
    streak: data.streak.current,
    best: data.streak.best,
    freezes: data.streak.freezes,
    lapsedDays: lastTs ? daysBetween(dayKey(lastTs), dayKey(now)) : null
  };
}

// ── answers ─────────────────────────────────────────────────────────────────

// mode: lesson | review | relearn | project | lightning | arcade | estimation | boss | placement
export function recordAttempt({
  itemKey,
  grade,
  correct,
  score = null,
  confidence = null,
  hints = 0,
  latencyMs = 0,
  response = "",
  chosen = null,
  mode = "lesson",
  explain = null,
  revealed = false,
  retry = false,
  awardXp = true,
  sessionId = null,
  now = Date.now()
}) {
  const data = progress();
  const item = getItem(itemKey);
  if (!item) {
    return null;
  }

  const before = memoryOf(itemKey);
  const isNew = before.state === "new";
  const gapDays = before.lastReview ? (now - before.lastReview) / DAY_MS : null;
  const masteryBefore = masteryOf(item.lessonKey, now);

  data.items[itemKey] = {
    ...before,
    ...review(before, grade, now, settings().retention),
    firstSeen: before.firstSeen ?? now,
    lastCorrect: correct,
    lastGrade: grade,
    streak: correct ? (before.streak || 0) + 1 : 0
  };

  data.log.push({
    ts: now,
    item: itemKey,
    skill: item.lessonKey,
    type: item.step.type,
    mode,
    grade,
    correct,
    score: score == null ? undefined : Math.round(score * 100) / 100,
    conf: confidence,
    hints,
    ms: Math.round(latencyMs),
    gap: gapDays == null ? null : Math.round(gapDays * 1000) / 1000,
    first: isNew,
    resp: clip(response, 400),
    chosen: chosen && chosen.length ? chosen : undefined,
    explain: clip(explain, 300) || undefined,
    session: sessionId
  });

  const events = [];
  if (awardXp) {
    for (const reward of xpForAttempt({ correct, score, isNew, gapDays, difficulty: before.difficulty, hints, revealed, attempted: Boolean(String(response || "").trim()) || Boolean(chosen?.length), retry, mode })) {
      events.push(...addReward("xp", reward.amount, reward.reason, now));
    }
  }

  const mistake = updateMistakes({ item, correct, confidence, response, chosen, revealed, sessionId, now, events });
  if (mode === "review" || mode === "relearn") {
    events.push(...questEvent("review", 1));
  }
  if (item.step.type === "estimate" && correct) {
    data.stats.closeEstimates = (data.stats.closeEstimates || 0) + 1;
    events.push(...questEvent("estimate-close", 1));
  }

  const masteryAfter = masteryOf(item.lessonKey, now);
  const skillState = (data.skills[item.lessonKey] = { ...(data.skills[item.lessonKey] || {}), lastPracticed: now });
  let masteredNow = false;
  if (item.kind === "lesson" && masteryAfter >= MASTERY_THRESHOLD && !skillState.masteredAt) {
    skillState.masteredAt = now;
    masteredNow = true;
  }

  events.push(...evaluateBadges(now));
  persist();
  return { isNew, gapDays, events, xp: sumXp(events), masteryBefore, masteryAfter, masteredNow, ...mistake };
}

function updateMistakes({ item, correct, confidence, response, chosen, revealed, sessionId, now, events }) {
  const data = progress();
  const existing = data.mistakes[item.key];

  if (!correct) {
    const open = existing && !existing.resolvedAt;
    data.mistakes[item.key] = {
      item: item.key,
      skill: item.lessonKey,
      firstTs: existing?.firstTs ?? now,
      lastTs: now,
      count: (existing?.count || 0) + 1,
      response: clip(response, 600),
      chosen: chosen && chosen.length ? chosen : null,
      confidence,
      hyper: confidence >= 3 || Boolean(open && existing.hyper),
      revealed,
      resolvedAt: null,
      session: sessionId
    };
    return { mistakeOpened: true, mistakeResolved: false, hyperFixed: false };
  }

  if (existing && !existing.resolvedAt && existing.session !== sessionId && dayKey(existing.lastTs) !== dayKey(now)) {
    existing.resolvedAt = now;
    data.stats.resolved += 1;
    events.push(...questEvent("mistake-fixed", 1));
    let hyperFixed = false;
    if (existing.hyper) {
      data.stats.hyperFixed += 1;
      hyperFixed = true;
      events.push(...addReward("xp", 10, "Fixed a mistake you'd been confident about", now));
    }
    return { mistakeOpened: false, mistakeResolved: true, hyperFixed };
  }
  return { mistakeOpened: false, mistakeResolved: false, hyperFixed: false };
}

// ── finishing things ────────────────────────────────────────────────────────

export function completeLesson(lessonKey, { right, total, now = Date.now() }) {
  const data = progress();
  const lesson = getLesson(lessonKey);
  const score = total ? right / total : 1;
  const stars = starsFor(score);
  const previous = data.lessons[lessonKey];
  const firstTime = !previous?.completedAt;
  data.lessons[lessonKey] = {
    completedAt: previous?.completedAt ?? now,
    stars: Math.max(previous?.stars || 0, stars),
    best: Math.max(previous?.best || 0, score),
    attempts: (previous?.attempts || 0) + 1,
    lastPlayed: now
  };

  const events = [];
  events.push(...addReward("xp", firstTime ? 20 : 8, firstTime ? `Finished “${lesson.title}”` : `Replayed “${lesson.title}”`, now));
  if (stars === 3) {
    events.push(...addReward("xp", 10, "Three stars", now));
    events.push(...questEvent("perfect", 1));
  }
  events.push(...questEvent("lesson", 1));

  const unit = getUnit(lesson.unitKey);
  const unitDone = unit && unit.lessons.every(isLessonComplete);
  if (firstTime && unitDone) {
    events.push(...addReward("xp", 40, `Cleared the “${unit.title}” unit`, now));
  }
  events.push(...evaluateBadges(now));
  persist();
  return { score, stars, firstTime, unitDone: Boolean(unitDone && firstTime), events, next: nextLessonKey(lesson.courseId) };
}

// Games: record the score and pay XP for it (games don't pay per answer).
export function recordGame(gameId, { score, xp, reason, won = null, now = Date.now() }) {
  const data = progress();
  const previous = data.games[gameId] || { best: null, plays: 0 };
  const isBest = previous.best == null || score > previous.best;
  data.games[gameId] = {
    best: isBest ? score : previous.best,
    plays: previous.plays + 1,
    lastPlayed: now,
    won: Boolean(previous.won || won)
  };
  const events = xp > 0 ? addReward("xp", xp, reason, now) : [];
  events.push(...evaluateBadges(now));
  persist();
  return { isBest, previousBest: previous.best, events };
}

export function recordProject(projectKey, { score, stages, interview, now = Date.now() }) {
  const data = progress();
  const project = getLesson(projectKey);
  const previous = data.lessons[projectKey];
  data.lessons[projectKey] = {
    completedAt: previous?.completedAt ?? now,
    best: Math.max(previous?.best || 0, score),
    stars: Math.max(previous?.stars || 0, starsFor(score)),
    attempts: (previous?.attempts || 0) + 1,
    lastPlayed: now,
    lastStages: stages,
    interview: Boolean(interview || previous?.interview)
  };
  const events = addReward("xp", Math.round(30 + 70 * score), `Designed “${project.title}” (${Math.round(score * 100)}%)`, now);
  events.push(...evaluateBadges(now));
  persist();
  return { events, previousBest: previous?.best ?? null };
}

// ── XP, streak, level ───────────────────────────────────────────────────────

// Adds a reward and returns the events it caused (XP, goal met, level up,
// quest completions) so callers can show them.
export function addReward(kind, amount, reason, now = Date.now()) {
  const data = progress();
  const events = [{ ts: now, kind, amount, reason }];
  data.rewards.push(events[0]);
  if (kind !== "xp" || amount <= 0) {
    return events;
  }
  const levelBefore = levelFor(data.stats.xpTotal || 0).level;
  data.stats.xpTotal = (data.stats.xpTotal || 0) + amount;
  const levelAfter = levelFor(data.stats.xpTotal).level;
  if (levelAfter > levelBefore) {
    const event = { ts: now, kind: "level", amount: levelAfter, reason: `Reached level ${levelAfter}` };
    data.rewards.push(event);
    events.push(event);
  }
  events.push(...countTowardGoal(amount, now));
  if (!reason.startsWith("Quest complete")) {
    events.push(...questEvent("xp", amount));
  }
  return events;
}

function countTowardGoal(amount, now) {
  const streak = progress().streak;
  const today = dayKey(now);
  streak.history[today] = (streak.history[today] || 0) + amount;
  if (streak.history[today] < settings().dailyXp || streak.lastDay === today) {
    return [];
  }
  streak.current = streak.lastDay === addDays(today, -1) ? streak.current + 1 : 1;
  streak.lastDay = today;
  streak.best = Math.max(streak.best, streak.current);
  const events = [{ ts: now, kind: "streak", amount: streak.current, reason: `Daily goal met · ${streak.current}-day streak` }];
  progress().rewards.push(events[0]);
  if (streak.current % 7 === 0 && streak.freezes < 2) {
    streak.freezes += 1;
    const freeze = { ts: now, kind: "freeze", amount: 1, reason: "Earned a streak freeze for a week of meeting your goal" };
    progress().rewards.push(freeze);
    events.push(freeze);
  }
  return events;
}

// On launch: bridge missed days with freezes, or quietly restart the streak.
export function rollStreak(now = Date.now()) {
  const streak = progress().streak;
  const today = dayKey(now);
  if (!streak.lastDay || streak.current === 0) {
    return { usedFreezes: 0, restarted: false };
  }
  const gap = daysBetween(streak.lastDay, today);
  if (gap <= 1) {
    return { usedFreezes: 0, restarted: false };
  }
  const missed = gap - 1;
  if (streak.freezes >= missed) {
    streak.freezes -= missed;
    for (let offset = 1; offset <= missed; offset += 1) {
      streak.frozen.push(addDays(streak.lastDay, offset));
    }
    streak.lastDay = addDays(today, -1);
    persist();
    return { usedFreezes: missed, restarted: false };
  }
  streak.current = 0;
  persist();
  return { usedFreezes: 0, restarted: true };
}

export function levelInfo() {
  return levelFor(progress().stats.xpTotal || 0);
}

export function weekXp(now = Date.now()) {
  const since = now - 7 * DAY_MS;
  return progress().rewards.filter((event) => event.kind === "xp" && event.ts >= since).reduce((sum, event) => sum + event.amount, 0);
}

export function recordJol(itemKey, answer) {
  const memory = progress().items[itemKey];
  if (memory) {
    memory.jol = { ts: Date.now(), answer };
    persist();
  }
}

// ── badges ──────────────────────────────────────────────────────────────────

export function earnedBadges() {
  const earned = progress().badges;
  return BADGES.map((badge) => ({ ...badge, earnedAt: earned[badge.id] ?? null }));
}

function evaluateBadges(now) {
  const data = progress();
  const lessons = Object.entries(data.lessons);
  const checks = {
    "first-lesson": () => lessons.some(([key, record]) => record.completedAt && !key.includes("::lab::")),
    perfect: () => lessons.some(([key, record]) => record.stars === 3 && !key.includes("::lab::")),
    "unit-cleared": () => [...catalog().units.values()].some((unit) => unit.lessons.length > 0 && unit.lessons.every(isLessonComplete)),
    boss: () => Object.entries(data.games).some(([id, record]) => id.startsWith("boss:") && record.won),
    architect: () => lessons.some(([key, record]) => key.includes("::lab::") && record.best >= 0.9),
    estimator: () => (data.stats.closeEstimates || 0) >= 10,
    combo: () => (data.stats.bestCombo || 0) >= 10,
    "first-mastery": () => Object.values(data.skills).some((skill) => skill.masteredAt),
    "long-term": () => Object.values(data.items).filter((memory) => memory.lastCorrect && memory.stability >= 30).length >= 10,
    hypercorrected: () => data.stats.hyperFixed >= 3,
    calibrated: () => {
      const result = calibration(data.log);
      return result.total >= 40 && result.error <= 0.1;
    },
    "habit-7": () => data.streak.best >= 7
  };
  const events = [];
  for (const badge of BADGES) {
    if (!data.badges[badge.id] && checks[badge.id]?.()) {
      data.badges[badge.id] = now;
      const event = { ts: now, kind: "badge", amount: 0, reason: `Badge: ${badge.title}`, badge };
      data.rewards.push(event);
      events.push(event);
    }
  }
  return events;
}

function sumXp(events) {
  return events.reduce((sum, event) => sum + (event.kind === "xp" ? event.amount : 0), 0);
}

function clip(text, max) {
  const value = String(text ?? "").trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
