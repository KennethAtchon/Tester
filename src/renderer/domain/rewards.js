// Reward rules. Points report learning; they don't buy behaviour. XP is paid
// for correct answers (more for longer gaps and harder items, less with hints)
// and for finishing things, and every event carries the reason it was paid.
// Levels come from XP; badges mark milestones of mastery, never just activity.

export const BADGES = [
  { id: "first-lesson", title: "First steps", description: "Finished your first lesson." },
  { id: "perfect", title: "Flawless", description: "Three stars on a lesson." },
  { id: "unit-cleared", title: "Unit cleared", description: "Finished every lesson in a unit." },
  { id: "boss", title: "Boss slayer", description: "Beat a unit boss." },
  { id: "architect", title: "Architect", description: "Scored 90%+ on a Design Lab project." },
  { id: "estimator", title: "Human calculator", description: "10 estimates within 30% of the answer." },
  { id: "combo", title: "On fire", description: "A 10-answer combo in Lightning." },
  { id: "first-mastery", title: "Mastered", description: "Reached 80% mastery on a lesson's material." },
  { id: "long-term", title: "Long-term memory", description: "10 items held with 30+ days of stability." },
  { id: "hypercorrected", title: "Hypercorrected", description: "Fixed 3 mistakes you were confident about." },
  { id: "calibrated", title: "Well calibrated", description: "40+ rated answers, confidence within 10 points of accuracy." },
  { id: "habit-7", title: "Seven-day habit", description: "Met your daily goal 7 days running." }
];

// Each level takes 50 XP more than the last: 100, then 150, 200, 250…
export function levelFor(xp) {
  let level = 1;
  let floor = 0;
  let step = 100;
  while (xp >= floor + step) {
    floor += step;
    level += 1;
    step = 100 + (level - 1) * 50;
  }
  return { level, floor, next: floor + step, into: xp - floor, span: step, progress: (xp - floor) / step };
}

export function xpForAttempt({ correct, score = null, isNew, gapDays, difficulty, hints, revealed, attempted, retry, mode }) {
  if (!correct) {
    if (score != null && score >= 0.5 && !revealed) {
      return [{ amount: 3, reason: "Partly right" }];
    }
    if (isNew && attempted && !revealed && mode === "lesson") {
      return [{ amount: 1, reason: "Had a go before seeing the answer" }];
    }
    return [];
  }
  if (retry) {
    return [{ amount: 3, reason: "Got it on the retry" }];
  }
  let amount = isNew ? 10 : 8;
  const parts = [];
  let lead = isNew ? "Correct" : "Recalled";
  if (!isNew && gapDays != null && gapDays >= 1) {
    amount += Math.min(10, Math.round(3 * Math.log2(1 + gapDays)));
    lead = `Recalled after ${formatGap(gapDays)}`;
  }
  if (difficulty >= 7) {
    amount += 3;
    parts.push("hard item");
  }
  if (hints > 0) {
    amount = Math.max(2, amount - 3 * hints);
    parts.push(`${hints} hint${hints === 1 ? "" : "s"}`);
  }
  return [{ amount, reason: parts.length ? `${lead} · ${parts.join(", ")}` : lead }];
}

export function starsFor(score) {
  return score >= 0.9 ? 3 : score >= 0.7 ? 2 : 1;
}

export function gradeLetter(score) {
  return score >= 0.9 ? "A" : score >= 0.8 ? "B" : score >= 0.65 ? "C" : score >= 0.5 ? "D" : "F";
}

export function formatGap(days) {
  if (days < 1) {
    return "less than a day";
  }
  if (days < 1.5) {
    return "1 day";
  }
  if (days < 14) {
    return `${Math.round(days)} days`;
  }
  if (days < 60) {
    return `${Math.round(days / 7)} weeks`;
  }
  return `${Math.round(days / 30)} months`;
}
