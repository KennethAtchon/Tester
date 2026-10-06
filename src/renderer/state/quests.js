// Daily quests: three small, specific goals each day, drawn only from the
// games the learner chose. Each is tied to doing the learning (finish a
// lesson, fix mistakes, land estimates), never to time in the app.

import { progress, persist } from "./progress.js";
import { addReward } from "./learner.js";
import { dayKey } from "../lib/time.js";

const TEMPLATES = [
  { id: "lesson", game: "lessons", event: "lesson", target: 1, xp: 20, title: "Finish a lesson" },
  { id: "perfect", game: "lessons", event: "perfect", target: 1, xp: 25, title: "Earn three stars on a lesson" },
  { id: "review", game: "review", event: "review", target: 10, xp: 20, title: "Review 10 cards" },
  { id: "fix", game: "review", event: "mistake-fixed", target: 2, xp: 25, title: "Fix 2 old mistakes" },
  { id: "lightning", game: "lightning", event: "lightning-score", target: 8, xp: 20, title: "Score 8+ in a Lightning round", max: true },
  { id: "arcade", game: "arcade", event: "arcade-clear", target: 3, xp: 20, title: "Solve 3 Sort & Match puzzles" },
  { id: "estimate", game: "estimation", event: "estimate-close", target: 3, xp: 25, title: "Land 3 estimates within 30%" },
  { id: "lab", game: "lab", event: "lab-stage", target: 2, xp: 30, title: "Complete 2 Design Lab stages" },
  { id: "boss", game: "boss", event: "boss-hit", target: 5, xp: 25, title: "Land 5 hits in a boss battle" },
  { id: "xp", game: null, event: "xp", target: 80, xp: 15, title: "Earn 80 XP" }
];

export function todaysQuests(now = Date.now()) {
  const quests = progress().quests;
  const today = dayKey(now);
  if (quests.day !== today) {
    quests.day = today;
    quests.list = pickQuests(today).map((template) => ({ ...template, progress: 0, done: false }));
    persist();
  }
  return quests.list;
}

// Called by the learner model when something quest-worthy happens. Returns
// reward events for any quest it completed.
export function questEvent(event, amount = 1) {
  const quests = progress().quests;
  if (quests.day !== dayKey(Date.now())) {
    return [];
  }
  const events = [];
  for (const quest of quests.list) {
    if (quest.done || quest.event !== event) {
      continue;
    }
    quest.progress = quest.max ? Math.max(quest.progress, amount) : quest.progress + amount;
    if (quest.progress >= quest.target) {
      quest.progress = quest.target;
      quest.done = true;
      events.push(...addReward("xp", quest.xp, `Quest complete: ${quest.title}`));
    }
  }
  return events;
}

function pickQuests(day) {
  const games = new Set(progress().profile.games?.length ? progress().profile.games : ["lessons", "review"]);
  const pool = TEMPLATES.filter((template) => template.game === null || games.has(template.game));
  // Seeded by the date so the day's quests don't reshuffle on every launch.
  let seed = [...day].reduce((value, char) => (value * 33 + char.charCodeAt(0)) >>> 0, 5381);
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const shuffled = pool.map((template) => ({ template, sort: random() })).sort((a, b) => a.sort - b.sort).map((entry) => entry.template);
  const chosen = [];
  const usedGames = new Set();
  // Prefer one quest per game for variety, then fill.
  for (const template of shuffled) {
    if (chosen.length < 3 && !usedGames.has(template.game)) {
      chosen.push(template);
      usedGames.add(template.game);
    }
  }
  for (const template of shuffled) {
    if (chosen.length < 3 && !chosen.includes(template)) {
      chosen.push(template);
    }
  }
  return chosen;
}
