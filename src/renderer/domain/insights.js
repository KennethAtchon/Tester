// Analytics over the review log and memory states. Pure functions that feed the
// Insights view: calibration, retention by spacing gap, review forecast,
// challenge level, activity, hint reliance, and the forgetting curve.

import { CONFIDENCE_LEVELS } from "./grading.js";
import { retrievabilityAfter } from "./fsrs.js";
import { DAY_MS, dayKey, addDays } from "../lib/time.js";

// "When you say 90% sure, you're right N% of the time."
export function calibration(log) {
  const buckets = CONFIDENCE_LEVELS.map((level) => ({ level: level.value, label: level.label, expected: level.p, n: 0, right: 0 }));
  for (const entry of log) {
    if (entry.conf >= 1 && entry.conf <= 4) {
      const bucket = buckets[entry.conf - 1];
      bucket.n += 1;
      bucket.right += entry.correct ? 1 : 0;
    }
  }
  let total = 0;
  let weightedGap = 0;
  let overconfident = 0;
  for (const bucket of buckets) {
    bucket.accuracy = bucket.n ? bucket.right / bucket.n : null;
    if (bucket.n) {
      total += bucket.n;
      weightedGap += bucket.n * Math.abs(bucket.accuracy - bucket.expected);
      overconfident += bucket.n * (bucket.expected - bucket.accuracy);
    }
  }
  return {
    buckets,
    total,
    error: total ? weightedGap / total : null,
    bias: total ? overconfident / total : null // > 0 overconfident, < 0 underconfident
  };
}

const GAP_BUCKETS = [
  { label: "Same session", max: 1 / 24 },
  { label: "Under 1 day", max: 1 },
  { label: "1–3 days", max: 3 },
  { label: "3–7 days", max: 7 },
  { label: "1–4 weeks", max: 28 },
  { label: "1 month+", max: Infinity }
];

// Accuracy on reviews grouped by how long since the previous review.
export function retentionByGap(log) {
  const buckets = GAP_BUCKETS.map((bucket) => ({ ...bucket, n: 0, right: 0 }));
  for (const entry of log) {
    if (entry.gap == null) {
      continue;
    }
    const bucket = buckets.find((candidate) => entry.gap < candidate.max);
    bucket.n += 1;
    bucket.right += entry.correct ? 1 : 0;
  }
  return buckets.map((bucket) => ({ label: bucket.label, n: bucket.n, accuracy: bucket.n ? bucket.right / bucket.n : null }));
}

// Accuracy split into "spaced" (≥ 1 day gap) vs. "massed" (same day).
export function spacedVsMassed(log) {
  let spaced = 0;
  let spacedRight = 0;
  let massed = 0;
  let massedRight = 0;
  for (const entry of log) {
    if (entry.gap == null) {
      continue;
    }
    if (entry.gap >= 1) {
      spaced += 1;
      spacedRight += entry.correct ? 1 : 0;
    } else {
      massed += 1;
      massedRight += entry.correct ? 1 : 0;
    }
  }
  return {
    spaced: spaced ? spacedRight / spaced : null,
    spacedN: spaced,
    massed: massed ? massedRight / massed : null,
    massedN: massed
  };
}

// Rolling accuracy over the last `points` attempts — is practice in the
// 70–85% challenge band?
export function challengeSeries(log, windowSize = 20, points = 80) {
  const graded = log.slice(-(points + windowSize));
  const series = [];
  for (let index = windowSize - 1; index < graded.length; index += 1) {
    const window = graded.slice(index - windowSize + 1, index + 1);
    const accuracy = window.filter((entry) => entry.correct).length / window.length;
    series.push({ index: series.length + 1, ts: graded[index].ts, accuracy });
  }
  return series.slice(-points);
}

export function recentAccuracy(log, count = 25) {
  const recent = log.slice(-count);
  if (recent.length === 0) {
    return null;
  }
  return recent.filter((entry) => entry.correct).length / recent.length;
}

// Review load for the next `days` study days. Overdue items land on today.
export function forecast(memories, days = 14, now = Date.now()) {
  const today = dayKey(now);
  const counts = Array.from({ length: days }, (_, offset) => ({ day: addDays(today, offset), count: 0 }));
  const index = new Map(counts.map((entry, offset) => [entry.day, offset]));
  for (const memory of memories) {
    if (!memory || memory.state === "new" || memory.dueAt == null) {
      continue;
    }
    const key = memory.dueAt <= now ? today : dayKey(memory.dueAt);
    const slot = index.get(key);
    if (slot != null) {
      counts[slot].count += 1;
    }
  }
  return counts;
}

// Daily practice counts for a calendar heatmap, oldest week first.
export function activityGrid(history, frozen, goal, weeks = 15, now = Date.now()) {
  const today = dayKey(now);
  const frozenSet = new Set(frozen || []);
  const [year, month, date] = today.split("-").map(Number);
  const weekday = (new Date(year, month - 1, date).getDay() + 6) % 7; // Monday = 0
  // Columns are Monday-first weeks; the last column holds today.
  const start = addDays(today, -weekday - (weeks - 1) * 7);
  const cells = [];
  for (let offset = 0; offset < weeks * 7; offset += 1) {
    const day = addDays(start, offset);
    const count = history?.[day] || 0;
    cells.push({
      day,
      count,
      future: day > today,
      frozen: frozenSet.has(day),
      met: count >= goal
    });
  }
  return cells;
}

export function hintReliance(log, count = 200) {
  const recent = log.slice(-count);
  if (recent.length === 0) {
    return null;
  }
  return recent.filter((entry) => entry.hints > 0).length / recent.length;
}

// Average predicted recall of every learned item over the next `days` days
// if nothing is reviewed — the learner's own forgetting curve.
export function forgettingCurve(memories, days = 30, now = Date.now()) {
  const learned = memories.filter((memory) => memory && memory.state !== "new" && memory.lastReview);
  if (learned.length === 0) {
    return [];
  }
  const points = [];
  for (let day = 0; day <= days; day += 1) {
    const total = learned.reduce((sum, memory) => sum + retrievabilityAfter(memory, day, now), 0);
    points.push({ day, recall: total / learned.length });
  }
  return points;
}

// How accurate were "will you remember this in a week?" predictions, judged by
// the first review at least 5 days after the prediction.
export function jolAccuracy(items, log) {
  let judged = 0;
  let right = 0;
  for (const [itemKey, memory] of Object.entries(items)) {
    const jol = memory?.jol;
    if (!jol) {
      continue;
    }
    const later = log.find((entry) => entry.item === itemKey && entry.ts >= jol.ts + 5 * DAY_MS);
    if (!later) {
      continue;
    }
    judged += 1;
    const predictedYes = jol.answer === "yes";
    if (predictedYes === Boolean(later.correct)) {
      right += 1;
    }
  }
  return { judged, accuracy: judged ? right / judged : null };
}
