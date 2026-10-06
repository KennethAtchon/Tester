// The learner model: per-item memory (FSRS), per-skill mastery, the review log,
// the mistake notebook, rewards, badges, and the daily-goal streak. Every
// attempt flows through recordAttempt, which updates all of them at once and
// reports what changed so the session can explain it.

import { progress, settings, persist } from "./progress.js";
import { catalog, getItem, getSkill } from "./catalog.js";
import { newMemory, review, retrievability } from "../domain/fsrs.js";
import { resolveKey } from "../domain/grading.js";
import { xpForAttempt, BADGES } from "../domain/rewards.js";
import { calibration } from "../domain/insights.js";
import { DAY_MS, dayKey, addDays, daysBetween, endOfStudyDay } from "../lib/time.js";

export const MASTERY_THRESHOLD = 0.8;
export const UNLOCK_THRESHOLD = 0.6;
const LONG_FORM_TYPES = new Set(["long_answer", "code_run"]);

export function memoryOf(itemKey) {
  return progress().items[itemKey] || newMemory();
}

export function keyFor(item) {
  return resolveKey(item.question, progress().keys[item.key] ?? null);
}

export function setKeyOverride(itemKey, value) {
  progress().keys[itemKey] = value;
  persist();
}

export function isEligible(item) {
  return settings().includeLongForm || !LONG_FORM_TYPES.has(item.question.type);
}

// Worked → faded → independent. 0 = first look (attempt, then study the
// answer), 1 = faded (fill in the blanks), 2 = independent recall. A skill the
// learner tested out of starts at 2 (expertise reversal).
export function scaffoldFor(itemKey) {
  const memory = progress().items[itemKey];
  if (memory?.scaffold != null) {
    return memory.scaffold;
  }
  const item = getItem(itemKey);
  return item && progress().skills[item.skillKey]?.testedOut ? 2 : 0;
}

// Estimated chance of recalling the item now: memory strength if the last
// attempt succeeded, zero if it has never been recalled or was last missed.
export function itemKnowledge(itemKey, now = Date.now()) {
  const memory = progress().items[itemKey];
  if (!memory || memory.state === "new" || !memory.lastCorrect) {
    return 0;
  }
  return retrievability(memory, now);
}

export function masteryOf(skillKey, now = Date.now()) {
  const skill = getSkill(skillKey);
  if (!skill || skill.items.length === 0) {
    return 0;
  }
  return skill.items.reduce((sum, itemKey) => sum + itemKnowledge(itemKey, now), 0) / skill.items.length;
}

export function isSkillUnlocked(skillKey, now = Date.now()) {
  const skill = getSkill(skillKey);
  if (!skill || skill.prerequisites.length === 0) {
    return true;
  }
  if (progress().libraries[skill.libKey]?.unlocked?.includes(skillKey)) {
    return true;
  }
  return skill.prerequisites.every((prerequisite) => masteryOf(prerequisite, now) >= UNLOCK_THRESHOLD);
}

export function unlockSkill(skillKey) {
  const skill = getSkill(skillKey);
  const record = skill && progress().libraries[skill.libKey];
  if (record && !record.unlocked.includes(skillKey)) {
    record.unlocked.push(skillKey);
    persist();
  }
}

export function skillStats(skillKey, now = Date.now()) {
  const skill = getSkill(skillKey);
  const horizon = endOfStudyDay(now);
  let seen = 0;
  let due = 0;
  let strength = 0;
  for (const itemKey of skill.items) {
    const memory = progress().items[itemKey];
    if (memory && memory.state !== "new") {
      seen += 1;
      strength += retrievability(memory, now);
      if (memory.dueAt != null && memory.dueAt <= horizon) {
        due += 1;
      }
    }
  }
  const mastery = masteryOf(skillKey, now);
  return {
    mastery,
    seen,
    total: skill.items.length,
    due,
    newCount: skill.items.length - seen,
    strength: seen ? strength / seen : 0,
    mastered: mastery >= MASTERY_THRESHOLD,
    unlocked: isSkillUnlocked(skillKey, now),
    lastPracticed: progress().skills[skillKey]?.lastPracticed ?? null,
    testedOut: Boolean(progress().skills[skillKey]?.testedOut)
  };
}

export function libraryStats(libKey, now = Date.now()) {
  const library = catalog().libraries.find((entry) => entry.key === libKey);
  let total = 0;
  let seen = 0;
  let due = 0;
  let knowledge = 0;
  let minMastery = 1;
  for (const skill of library.skills) {
    const stats = skillStats(skill.key, now);
    total += stats.total;
    seen += stats.seen;
    due += stats.due;
    knowledge += stats.mastery * stats.total;
    minMastery = Math.min(minMastery, stats.mastery);
  }
  return {
    total,
    seen,
    due,
    mastery: total ? knowledge / total : 0,
    minMastery: library.skills.length ? minMastery : 0,
    capstoneReady: library.skills.length > 0 && minMastery >= UNLOCK_THRESHOLD,
    capstoneBest: progress().libraries[libKey]?.capstoneBest ?? null
  };
}

// Items due by the end of today's study day, most-forgotten first.
export function dueItemKeys(now = Date.now(), filter = null) {
  const horizon = endOfStudyDay(now);
  const due = [];
  for (const item of catalog().items.values()) {
    if (filter && !filter(item)) {
      continue;
    }
    const memory = progress().items[item.key];
    if (memory && memory.state !== "new" && memory.dueAt != null && memory.dueAt <= horizon && isEligible(item)) {
      due.push({ key: item.key, recall: retrievability(memory, now) });
    }
  }
  due.sort((a, b) => a.recall - b.recall);
  return due.map((entry) => entry.key);
}

// Unseen items in unlocked skills, in library/skill/question order.
export function newItemKeys(now = Date.now(), filter = null) {
  const keys = [];
  for (const library of catalog().libraries) {
    for (const skill of library.skills) {
      if (!isSkillUnlocked(skill.key, now)) {
        continue;
      }
      for (const itemKey of skill.items) {
        const item = getItem(itemKey);
        if (filter && !filter(item)) {
          continue;
        }
        const memory = progress().items[itemKey];
        if ((!memory || memory.state === "new") && isEligible(item)) {
          keys.push(itemKey);
        }
      }
    }
  }
  return keys;
}

export function todayCounts(now = Date.now()) {
  const today = dayKey(now);
  const log = progress().log;
  let attempts = 0;
  let newToday = 0;
  let reviewsToday = 0;
  for (let index = log.length - 1; index >= 0 && dayKey(log[index].ts) === today; index -= 1) {
    attempts += 1;
    if (log[index].first) {
      newToday += 1;
    } else {
      reviewsToday += 1;
    }
  }
  return { attempts, newToday, reviewsToday };
}

export function todayStats(now = Date.now()) {
  const data = progress();
  const counts = todayCounts(now);
  const goal = settings().dailyGoal;
  const done = data.streak.history[dayKey(now)] || 0;
  const lastTs = data.log.length ? data.log[data.log.length - 1].ts : null;
  return {
    goal,
    done,
    goalMet: done >= goal,
    due: dueItemKeys(now).length,
    reviewCapLeft: Math.max(0, settings().maxReviewsPerDay - counts.reviewsToday),
    newLeft: Math.max(0, Math.min(settings().newPerDay - counts.newToday, newItemKeys(now).length)),
    newTotal: newItemKeys(now).length,
    streak: data.streak.current,
    best: data.streak.best,
    freezes: data.streak.freezes,
    lapsedDays: lastTs ? daysBetween(dayKey(lastTs), dayKey(now)) : null,
    hasHistory: data.log.length > 0
  };
}

// Records one graded attempt and updates every downstream model.
export function recordAttempt({
  itemKey,
  grade,
  correct,
  confidence = null,
  hints = 0,
  latencyMs = 0,
  response = "",
  chosen = null,
  mode = "review",
  explain = null,
  revealed = false,
  retry = false,
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
  const masteryBefore = masteryOf(item.skillKey, now);
  const scaffoldBefore = scaffoldFor(itemKey);

  const memory = {
    ...before,
    ...review(before, grade, now, settings().retention),
    firstSeen: before.firstSeen ?? now,
    lastCorrect: correct,
    lastGrade: grade,
    streak: correct ? (before.streak || 0) + 1 : 0,
    scaffold: nextScaffold(scaffoldBefore, { correct, grade, confidence, hints, mode })
  };
  data.items[itemKey] = memory;

  data.log.push({
    ts: now,
    item: itemKey,
    skill: item.skillKey,
    mode,
    grade,
    correct,
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
  for (const reward of xpForAttempt({
    correct,
    isNew,
    gapDays,
    difficulty: before.difficulty,
    hints,
    revealed,
    attempted: Boolean(String(response || "").trim()) || Boolean(chosen?.length),
    retry
  })) {
    events.push(addReward("xp", reward.amount, reward.reason, now));
  }

  if (mode === "placement" && correct && confidence >= 3) {
    data.skills[item.skillKey] = { ...(data.skills[item.skillKey] || {}), testedOut: true };
  }

  const mistake = updateMistakes({ item, correct, confidence, response, chosen, revealed, sessionId, now, events });

  const goalJustMet = countTowardGoal(now, events);

  const masteryAfter = masteryOf(item.skillKey, now);
  const skillState = (data.skills[item.skillKey] = { ...(data.skills[item.skillKey] || {}), lastPracticed: now });
  let masteredNow = false;
  if (masteryAfter >= MASTERY_THRESHOLD && !skillState.masteredAt) {
    skillState.masteredAt = now;
    masteredNow = true;
    events.push(addReward("xp", 25, `Mastered “${item.skillTitle}”`, now));
  }

  const newBadges = evaluateBadges(now);
  persist();

  return {
    memory,
    isNew,
    gapDays,
    events,
    xp: events.reduce((sum, event) => sum + (event.kind === "xp" ? event.amount : 0), 0),
    masteryBefore,
    masteryAfter,
    masteredNow,
    goalJustMet,
    newBadges,
    ...mistake
  };
}

function nextScaffold(current, { correct, grade, confidence, hints, mode }) {
  if (mode === "placement") {
    return correct && confidence >= 3 ? 2 : 1;
  }
  if (!correct) {
    return 1;
  }
  if (current === 0) {
    return confidence >= 3 && hints === 0 ? 2 : 1;
  }
  if (current === 1) {
    return grade >= 3 ? 2 : 1;
  }
  return 2;
}

// Misses open (or reopen) a notebook entry; a correct answer on a later day
// resolves it. Confident misses are flagged — they're hypercorrected best.
function updateMistakes({ item, correct, confidence, response, chosen, revealed, sessionId, now, events }) {
  const data = progress();
  const existing = data.mistakes[item.key];

  if (!correct) {
    const open = existing && !existing.resolvedAt;
    data.mistakes[item.key] = {
      item: item.key,
      skill: item.skillKey,
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
    let hyperFixed = false;
    if (existing.hyper) {
      data.stats.hyperFixed += 1;
      hyperFixed = true;
      events.push(addReward("xp", 10, "Fixed a mistake you'd been confident about", now));
    }
    return { mistakeOpened: false, mistakeResolved: true, hyperFixed };
  }

  return { mistakeOpened: false, mistakeResolved: false, hyperFixed: false };
}

function countTowardGoal(now, events) {
  const data = progress();
  const streak = data.streak;
  const today = dayKey(now);
  streak.history[today] = (streak.history[today] || 0) + 1;

  if (streak.history[today] < settings().dailyGoal || streak.lastDay === today) {
    return false;
  }

  streak.current = streak.lastDay === addDays(today, -1) ? streak.current + 1 : 1;
  streak.lastDay = today;
  streak.best = Math.max(streak.best, streak.current);
  events.push(addReward("streak", 0, `Daily goal met · ${streak.current}-day streak`, now));

  if (streak.current % 7 === 0 && streak.freezes < 2) {
    streak.freezes += 1;
    events.push(addReward("freeze", 0, "Earned a streak freeze for a week of meeting your goal", now));
  }
  return true;
}

// Called on launch: bridges missed days with freezes, or quietly restarts the
// streak. Never shames — the Today screen just offers a short catch-up.
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

export function recordJol(itemKey, answer) {
  const memory = progress().items[itemKey];
  if (memory) {
    memory.jol = { ts: Date.now(), answer };
    persist();
  }
}

export function recordCapstone(libKey, right, total, now = Date.now()) {
  const record = progress().libraries[libKey];
  const score = total ? right / total : 0;
  const events = [];
  if (record) {
    record.capstoneBest = Math.max(record.capstoneBest ?? 0, score);
  }
  if (score >= 0.8) {
    events.push(addReward("xp", 30, `Cleared a capstone with ${right}/${total}`, now));
    if (!progress().badges.capstone) {
      progress().badges.capstone = now;
    }
  }
  persist();
  return events;
}

export function addReward(kind, amount, reason, now = Date.now()) {
  const event = { ts: now, kind, amount, reason };
  progress().rewards.push(event);
  if (kind === "xp") {
    progress().stats.xpTotal = (progress().stats.xpTotal || 0) + amount;
  }
  return event;
}

export function weekXp(now = Date.now()) {
  const since = now - 7 * DAY_MS;
  return progress().rewards.filter((event) => event.kind === "xp" && event.ts >= since).reduce((sum, event) => sum + event.amount, 0);
}

export function earnedBadges() {
  const earned = progress().badges;
  return BADGES.map((badge) => ({ ...badge, earnedAt: earned[badge.id] ?? null }));
}

function evaluateBadges(now) {
  const data = progress();
  const checks = {
    "first-mastery": () => Object.values(data.skills).some((skill) => skill.masteredAt),
    "long-term": () => Object.values(data.items).filter((memory) => memory.lastCorrect && memory.stability >= 30).length >= 10,
    hypercorrected: () => data.stats.hyperFixed >= 3,
    calibrated: () => {
      const result = calibration(data.log);
      return result.total >= 40 && result.error <= 0.1;
    },
    "clean-notebook": () => data.stats.resolved >= 10,
    "habit-7": () => data.streak.best >= 7
  };
  const fresh = [];
  for (const badge of BADGES) {
    if (!data.badges[badge.id] && checks[badge.id]?.()) {
      data.badges[badge.id] = now;
      fresh.push(badge);
    }
  }
  return fresh;
}

function clip(text, max) {
  const value = String(text ?? "").trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
