// Reward rules. Points report learning; they don't buy behaviour. XP is only
// paid for effortful correct retrieval (more for longer gaps and harder items,
// less when hints were used), and every event carries the reason it was paid.
// Badges mark mastery milestones, never participation.

export const BADGES = [
  { id: "first-mastery", title: "First skill mastered", description: "Reached 80% mastery on a skill." },
  { id: "long-term", title: "Long-term memory", description: "10 items held with 30+ days of stability." },
  { id: "hypercorrected", title: "Hypercorrected", description: "Fixed 3 mistakes you were confident about." },
  { id: "calibrated", title: "Well calibrated", description: "40+ rated answers, confidence within 10 points of accuracy." },
  { id: "clean-notebook", title: "Clean notebook", description: "Resolved 10 mistakes on a later day." },
  { id: "capstone", title: "Capstone cleared", description: "Scored 80%+ on a mixed, timed capstone." },
  { id: "habit-7", title: "Seven-day habit", description: "Met your own daily goal 7 days running." }
];

export function xpForAttempt({ correct, isNew, gapDays, difficulty, hints, revealed, attempted, retry }) {
  if (!correct) {
    if (isNew && attempted && !revealed) {
      return [{ amount: 2, reason: "Had a go before seeing the answer" }];
    }
    return [];
  }

  if (retry) {
    return [{ amount: 2, reason: "Got it right on the in-session retry" }];
  }

  let amount = isNew ? 5 : 8;
  const parts = [];
  let lead = isNew ? "Recalled a new item" : "Recalled";

  if (!isNew && gapDays != null) {
    if (gapDays >= 1) {
      amount += Math.min(10, Math.round(3 * Math.log2(1 + gapDays)));
      lead = `Recalled after ${formatGap(gapDays)}`;
    }
  }
  if (difficulty >= 7) {
    amount += 3;
    parts.push("hard item");
  }
  if (hints > 0) {
    amount = Math.max(1, amount - 3 * hints);
    parts.push(`${hints} hint${hints === 1 ? "" : "s"}`);
  } else {
    parts.push("no hints");
  }

  return [{ amount, reason: `${lead} · ${parts.join(", ")}` }];
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
