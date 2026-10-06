// Builds practice sessions from the learner model.
//
// A daily session takes due reviews (most-forgotten first, capped so a learner
// back from a break isn't buried), tops up with new items, and sizes the new
// share from recent accuracy so practice stays in the ~70–85% band. Items are
// interleaved across skills, and the session opens with its easiest review as
// a quick win. Misses are re-queued a few cards later by the session view.

import { progress, settings } from "./progress.js";
import { catalog, getItem, getSkill } from "./catalog.js";
import {
  dueItemKeys,
  newItemKeys,
  todayCounts,
  itemKnowledge,
  isEligible,
  isSkillUnlocked,
  keyFor,
  masteryOf
} from "./learner.js";
import { retrievability } from "../domain/fsrs.js";
import { recentAccuracy } from "../domain/insights.js";

export const SESSION_KINDS = {
  daily: "Today's session",
  one: "Just one card",
  catchup: "Catch-up",
  skill: "Skill practice",
  library: "Mixed practice",
  mistakes: "Mistake drill",
  weak: "Weak-spot drill",
  extra: "Practice ahead",
  placement: "Placement check",
  capstone: "Capstone"
};

export function buildSession(kind, { skillKey = null, libKey = null, size = null } = {}) {
  const now = Date.now();
  const target = size ?? settings().sessionSize;
  const filter = skillKey
    ? (item) => item.skillKey === skillKey
    : libKey
      ? (item) => item.libKey === libKey
      : null;

  let entries = [];
  let allowHints = true;
  let timerMs = null;
  let subtitle = "";

  switch (kind) {
    case "one": {
      const daily = composeDaily(now, 3, null);
      entries = daily.slice(0, 1);
      subtitle = "One card. Stop after it, or keep going — your call.";
      break;
    }
    case "catchup": {
      entries = composeDaily(now, 5, null);
      subtitle = "A three-minute catch-up. The rest will spread over the next few days.";
      break;
    }
    case "skill":
    case "library": {
      entries = composeDaily(now, target, filter, { focused: true });
      if (entries.length === 0) {
        entries = weakest(now, target, filter);
      }
      subtitle = kind === "skill" ? getSkill(skillKey)?.title || "" : "Interleaved across every skill in this library.";
      break;
    }
    case "mistakes": {
      entries = openMistakes(filter).slice(0, Math.max(target, 15)).map((itemKey) => entry(itemKey, "drill"));
      subtitle = "Deliberate practice on your own errors.";
      break;
    }
    case "weak": {
      entries = weakest(now, target, filter);
      subtitle = "Your lowest-strength items, drilled in isolation.";
      break;
    }
    case "extra": {
      entries = weakest(now, target, filter, { excludeDue: true });
      subtitle = "Nothing is due. These are your weakest items, reviewed early.";
      break;
    }
    case "placement": {
      entries = placementItems(libKey);
      allowHints = false;
      subtitle = "A short check so you can skip what you already know.";
      break;
    }
    case "capstone": {
      entries = capstoneItems(libKey, 10);
      allowHints = false;
      timerMs = entries.length * 75 * 1000;
      subtitle = "Mixed, timed, no hints. Tests whether skills transfer.";
      break;
    }
    default: {
      entries = composeDaily(now, target, null);
      subtitle = "";
    }
  }

  return {
    id: `s${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    kind,
    title: SESSION_KINDS[kind] || SESSION_KINDS.daily,
    subtitle,
    libKey,
    skillKey,
    allowHints,
    timerMs,
    startedAt: now,
    queue: entries,
    // Mastery at start for every skill the session touches (for the summary).
    masteryStart: Object.fromEntries(
      [...new Set(entries.map((item) => getItem(item.itemKey)?.skillKey).filter(Boolean))].map((key) => [key, masteryOf(key, now)])
    )
  };
}

function entry(itemKey, mode) {
  return { itemKey, mode, requeues: 0 };
}

function composeDaily(now, size, filter, { focused = false } = {}) {
  const counts = todayCounts(now);
  const reviewCap = Math.max(0, settings().maxReviewsPerDay - counts.reviewsToday);
  const due = dueItemKeys(now, filter).slice(0, reviewCap);
  let newAllowance = Math.max(0, settings().newPerDay - counts.newToday);
  if (focused) {
    // Choosing to study one skill is an explicit ask for new material there.
    newAllowance = Math.max(newAllowance, Math.ceil(size / 2));
  }

  // Difficulty targeting: too easy → more new material; too hard → consolidate.
  const accuracy = recentAccuracy(progress().log, 25);
  const share = accuracy == null ? 0.4 : accuracy > 0.85 ? 0.5 : accuracy >= 0.7 ? 0.3 : 0.1;

  let newCount = Math.min(newAllowance, Math.round(size * share));
  let reviewCount = Math.min(due.length, size - newCount);
  // Fill leftover room with whichever pool still has items.
  newCount = Math.min(newAllowance, size - reviewCount);
  reviewCount = Math.min(due.length, size - newCount);

  const reviews = due.slice(0, reviewCount).map((itemKey) => entry(itemKey, "review"));
  const fresh = pickNew(now, newCount, filter).map((itemKey) => entry(itemKey, "new"));

  return withQuickWin(interleave([...reviews, ...fresh]), now);
}

// New items: continue skills already in progress first, open at most one
// untouched skill per session, and round-robin between skills.
function pickNew(now, count, filter) {
  if (count <= 0) {
    return [];
  }
  const pool = newItemKeys(now, filter);
  const bySkill = new Map();
  for (const itemKey of pool) {
    const skillKey = getItem(itemKey).skillKey;
    if (!bySkill.has(skillKey)) {
      bySkill.set(skillKey, []);
    }
    bySkill.get(skillKey).push(itemKey);
  }

  const started = [];
  const untouched = [];
  for (const [skillKey, items] of bySkill) {
    const skill = getSkill(skillKey);
    const anySeen = skill.items.some((itemKey) => progress().items[itemKey]?.state && progress().items[itemKey].state !== "new");
    (anySeen ? started : untouched).push(items);
  }

  const lanes = [...started];
  if (untouched.length > 0) {
    lanes.push(untouched[0]);
  }
  if (lanes.length === 1 && untouched.length > 1) {
    lanes.push(untouched[1]);
  }

  const picked = [];
  while (picked.length < count && lanes.some((lane) => lane.length > 0)) {
    for (const lane of lanes) {
      if (lane.length > 0 && picked.length < count) {
        picked.push(lane.shift());
      }
    }
  }
  return picked;
}

// Greedy interleave: avoid two items from the same skill back to back.
export function interleave(entries) {
  const remaining = [...entries];
  const result = [];
  let lastSkill = null;
  while (remaining.length > 0) {
    let index = remaining.findIndex((candidate) => getItem(candidate.itemKey)?.skillKey !== lastSkill);
    if (index < 0) {
      index = 0;
    }
    const [next] = remaining.splice(index, 1);
    result.push(next);
    lastSkill = getItem(next.itemKey)?.skillKey ?? null;
  }
  return result;
}

// Start with the review the learner is most likely to get right.
function withQuickWin(entries, now) {
  let bestIndex = -1;
  let bestRecall = -1;
  entries.forEach((candidate, index) => {
    if (candidate.mode !== "review") {
      return;
    }
    const memory = progress().items[candidate.itemKey];
    const recall = memory?.lastCorrect ? retrievability(memory, now) : 0;
    if (recall > bestRecall) {
      bestRecall = recall;
      bestIndex = index;
    }
  });
  if (bestIndex > 0) {
    const [quickWin] = entries.splice(bestIndex, 1);
    entries.unshift(quickWin);
  }
  return entries;
}

function weakest(now, size, filter, { excludeDue = false } = {}) {
  const dueSet = excludeDue ? new Set(dueItemKeys(now, filter)) : new Set();
  const seen = [];
  for (const item of catalog().items.values()) {
    if ((filter && !filter(item)) || !isEligible(item) || dueSet.has(item.key)) {
      continue;
    }
    const memory = progress().items[item.key];
    if (memory && memory.state !== "new") {
      seen.push({ key: item.key, knowledge: itemKnowledge(item.key, now) });
    }
  }
  seen.sort((a, b) => a.knowledge - b.knowledge);
  return interleave(seen.slice(0, size).map((candidate) => entry(candidate.key, "drill")));
}

export function openMistakes(filter = null) {
  return Object.values(progress().mistakes)
    .filter((mistake) => !mistake.resolvedAt)
    .filter((mistake) => {
      const item = getItem(mistake.item);
      return item && (!filter || filter(item));
    })
    .sort((a, b) => Number(b.hyper) - Number(a.hyper) || b.lastTs - a.lastTs)
    .map((mistake) => mistake.item);
}

// One or two representative items per skill; auto-gradable first so the
// check is quick and objective.
function placementItems(libKey) {
  const library = catalog().libraries.find((entryLib) => entryLib.key === libKey);
  if (!library) {
    return [];
  }
  const perSkill = library.skills.length <= 4 ? 2 : 1;
  const picked = [];
  for (const skill of library.skills) {
    const candidates = skill.items
      .map((itemKey) => getItem(itemKey))
      .filter((item) => (progress().items[item.key]?.state ?? "new") === "new" && isEligible(item));
    candidates.sort((a, b) => Number(keyFor(b).auto) - Number(keyFor(a).auto));
    picked.push(...candidates.slice(0, perSkill).map((item) => entry(item.key, "placement")));
  }
  return interleave(picked.slice(0, 10));
}

export function capstoneItems(libKey, size) {
  const library = catalog().libraries.find((entryLib) => entryLib.key === libKey);
  if (!library) {
    return [];
  }
  const perSkill = Math.max(1, Math.ceil(size / Math.max(1, library.skills.length)));
  const picked = [];
  for (const skill of library.skills) {
    const items = shuffle(skill.items.filter((itemKey) => isEligible(getItem(itemKey)) && isSkillUnlocked(skill.key)));
    picked.push(...items.slice(0, perSkill).map((itemKey) => entry(itemKey, "capstone")));
  }
  return interleave(shuffle(picked).slice(0, size));
}

function shuffle(list) {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}
