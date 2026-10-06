// FSRS-5 memory model (Free Spaced Repetition Scheduler — Anki's default
// scheduler). Each learner×item pair carries a stability S (days until recall
// probability falls to 90%) and a difficulty D (1–10). A review updates both
// from the grade and from how much the learner had forgotten, and the next due
// date is placed where predicted recall hits the target retention.
//
// Pure: every function takes the memory state and returns a new one.

import { DAY_MS, MINUTE_MS } from "../lib/time.js";

// Published FSRS-5 default weights.
const W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616, 0.1544,
  1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466, 0.5034, 0.6567
];

const DECAY = -0.5;
const FACTOR = 19 / 81; // makes R(S, S) = 0.9
const MAX_INTERVAL_DAYS = 3 * 365;
const RELEARN_DELAY_MS = 10 * MINUTE_MS;

export const GRADES = [
  { value: 1, key: "again", label: "Again", hint: "Didn't recall" },
  { value: 2, key: "hard", label: "Hard", hint: "Recalled with effort" },
  { value: 3, key: "good", label: "Good", hint: "Recalled" },
  { value: 4, key: "easy", label: "Easy", hint: "Instant" }
];

export function newMemory() {
  return {
    state: "new", // new | learning | review | relearning
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    lastReview: null,
    dueAt: null
  };
}

// Probability the learner can recall the item right now.
export function retrievability(memory, now = Date.now()) {
  if (!memory || memory.state === "new" || !memory.lastReview || memory.stability <= 0) {
    return 0;
  }
  const elapsedDays = Math.max(0, (now - memory.lastReview) / DAY_MS);
  return Math.pow(1 + (FACTOR * elapsedDays) / memory.stability, DECAY);
}

// Recall probability `days` from now if the item is not reviewed again.
export function retrievabilityAfter(memory, days, now = Date.now()) {
  return retrievability(memory, now + days * DAY_MS);
}

// Applies a review and returns the updated memory plus the chosen interval.
export function review(memory, grade, now = Date.now(), retention = 0.9) {
  const plan = planAll(memory, now, retention)[grade];
  return {
    ...plan.memory,
    reps: memory.reps + 1,
    lapses: memory.lapses + (grade === 1 && memory.state !== "new" ? 1 : 0),
    lastReview: now,
    dueAt: now + plan.intervalMs
  };
}

// Interval preview for every grade — shown on the grade buttons.
export function previewIntervals(memory, now = Date.now(), retention = 0.9) {
  const plans = planAll(memory, now, retention);
  return { 1: plans[1].intervalMs, 2: plans[2].intervalMs, 3: plans[3].intervalMs, 4: plans[4].intervalMs };
}

function planAll(memory, now, retention) {
  const plans = {};
  for (const grade of [1, 2, 3, 4]) {
    plans[grade] = { memory: nextMemory(memory, grade, now) };
  }

  // Again → relearn shortly (the session also re-queues it a few cards later).
  plans[1].intervalMs = RELEARN_DELAY_MS;

  // Hard < Good < Easy, each at least a day.
  let previous = 0;
  for (const grade of [2, 3, 4]) {
    let days = Math.max(1, Math.round(nextIntervalDays(plans[grade].memory.stability, retention)));
    if (days <= previous) {
      days = previous + 1;
    }
    days = Math.min(days, MAX_INTERVAL_DAYS);
    previous = days;
    plans[grade].intervalMs = days * DAY_MS;
  }

  return plans;
}

function nextMemory(memory, grade, now) {
  if (memory.state === "new" || !memory.lastReview) {
    return {
      state: grade === 1 ? "learning" : "review",
      stability: initialStability(grade),
      difficulty: initialDifficulty(grade)
    };
  }

  const elapsedDays = Math.max(0, (now - memory.lastReview) / DAY_MS);
  const difficulty = nextDifficulty(memory.difficulty, grade);
  let stability;

  if (elapsedDays < 1) {
    // Same-day review (in-session retry): short-term stability update.
    stability = memory.stability * Math.exp(W[17] * (grade - 3 + W[18]));
  } else {
    const recall = Math.pow(1 + (FACTOR * elapsedDays) / memory.stability, DECAY);
    stability = grade === 1
      ? forgetStability(memory.difficulty, memory.stability, recall)
      : recallStability(memory.difficulty, memory.stability, recall, grade);
  }

  return {
    state: grade === 1 ? "relearning" : "review",
    stability: clamp(stability, 0.05, 36500),
    difficulty
  };
}

function initialStability(grade) {
  return Math.max(W[grade - 1], 0.1);
}

function initialDifficulty(grade) {
  return clamp(W[4] - Math.exp(W[5] * (grade - 1)) + 1, 1, 10);
}

function nextDifficulty(difficulty, grade) {
  const delta = -W[6] * (grade - 3);
  const damped = difficulty + (delta * (10 - difficulty)) / 9;
  const reverted = W[7] * initialDifficulty(4) + (1 - W[7]) * damped;
  return clamp(reverted, 1, 10);
}

function recallStability(difficulty, stability, recall, grade) {
  const hardPenalty = grade === 2 ? W[15] : 1;
  const easyBonus = grade === 4 ? W[16] : 1;
  return stability * (
    Math.exp(W[8]) *
      (11 - difficulty) *
      Math.pow(stability, -W[9]) *
      (Math.exp(W[10] * (1 - recall)) - 1) *
      hardPenalty *
      easyBonus +
    1
  );
}

function forgetStability(difficulty, stability, recall) {
  const next = W[11] *
    Math.pow(difficulty, -W[12]) *
    (Math.pow(stability + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - recall));
  return Math.min(next, stability / Math.exp(W[17] * W[18]));
}

function nextIntervalDays(stability, retention) {
  return (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
