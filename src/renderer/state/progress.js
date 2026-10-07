// Persistent learner data: profile, lesson progress, per-item memory, the
// review log, mistakes, rewards, quests, streak, and settings. Saved to the
// user-data folder (see lib/persisted.js). Subjects and courses the learner
// adds live separately in state/library.js.

import { persistedDocument } from "../lib/persisted.js";

const store = persistedDocument({
  storageKey: "recall-progress-v2",
  load: () => window.testFiles?.loadProgress?.(),
  save: (text) => window.testFiles?.saveProgress?.(text)
});
const MAX_LOG = 5000;
const MAX_REWARDS = 600;
const VERSION = 2;

export const DEFAULT_SETTINGS = {
  dailyXp: 60, // daily goal in XP; the streak counts days you reach it
  sessionSize: 12, // cards per review session
  maxReviewsPerDay: 80,
  retention: 0.9,
  recallFirst: "seen", // off | seen | always — hide options until you recall (review)
  selfExplain: "sometimes", // off | sometimes | always
  confidenceInLessons: false, // rate confidence on every lesson step, not just in review
  includeLongForm: true, // written answers in review sessions
  sound: true,
  theme: "system", // system | light | dark
  practiceScope: "subject" // subject | all — which subjects the games draw from
};

let data = null;
const listeners = new Set();

export function defaultProgress() {
  return {
    version: VERSION,
    createdAt: Date.now(),
    savedAt: 0,
    settings: { ...DEFAULT_SETTINGS },
    // Who the learner is and how they chose to learn (set during onboarding).
    // subject is the one they're studying now; Home and the games follow it.
    profile: { onboarded: false, goal: null, games: [], subject: null, startedAt: null },
    lessons: {}, // lessonKey → { completedAt, stars, best, attempts, lastPlayed }
    unlocked: {}, // lessonKey → true when skipped ahead to, "placed" when tested out of
    games: {}, // gameId → { best, plays, lastPlayed }
    quests: { day: null, list: [] },
    items: {},
    skills: {},
    log: [],
    mistakes: {},
    rewards: [],
    badges: {},
    streak: { current: 0, best: 0, freezes: 1, lastDay: null, history: {}, frozen: [] },
    plan: { after: "", will: "" },
    stats: { xpTotal: 0, hyperFixed: 0, resolved: 0, closeEstimates: 0, bestCombo: 0 }
  };
}

export async function initProgress() {
  data = migrate((await store.read()) || defaultProgress());
  return data;
}

export function progress() {
  return data;
}

export function settings() {
  return data.settings;
}

// Marks data dirty: mirrors to localStorage now, writes the file shortly.
export function persist() {
  trimLogs();
  store.write(data);
  for (const listener of listeners) {
    listener(data);
  }
}

export function onProgressChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetProgress() {
  const keep = { settings: data.settings, profile: data.profile };
  data = defaultProgress();
  Object.assign(data, keep);
  persist();
}

export async function progressFilePath() {
  try {
    return (await window.testFiles?.progressPath?.()) || "";
  } catch {
    return "";
  }
}

function migrate(candidate) {
  const base = defaultProgress();
  if (candidate.version !== VERSION) {
    // v1 tracked the old test files, which are gone; start fresh but keep the theme.
    base.settings.theme = candidate.settings?.theme || base.settings.theme;
    return base;
  }
  const merged = { ...base, ...candidate };
  merged.settings = { ...DEFAULT_SETTINGS, ...(candidate.settings || {}) };
  merged.profile = { ...base.profile, ...(candidate.profile || {}) };
  merged.streak = { ...base.streak, ...(candidate.streak || {}) };
  merged.plan = { ...base.plan, ...(candidate.plan || {}) };
  merged.stats = { ...base.stats, ...(candidate.stats || {}) };
  merged.quests = { ...base.quests, ...(candidate.quests || {}) };
  for (const key of ["lessons", "unlocked", "games", "items", "skills", "mistakes", "badges"]) {
    if (!merged[key] || typeof merged[key] !== "object" || Array.isArray(merged[key])) {
      merged[key] = {};
    }
  }
  for (const key of ["log", "rewards"]) {
    if (!Array.isArray(merged[key])) {
      merged[key] = [];
    }
  }
  return merged;
}

function trimLogs() {
  if (data.log.length > MAX_LOG) {
    data.log.splice(0, data.log.length - MAX_LOG);
  }
  if (data.rewards.length > MAX_REWARDS) {
    data.rewards.splice(0, data.rewards.length - MAX_REWARDS);
  }
}
