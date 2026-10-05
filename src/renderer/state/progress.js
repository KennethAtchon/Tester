// Persistent learner data: enrolled libraries, per-item memory, the review log,
// mistakes, rewards, streak, and settings. Saved to a JSON file in the app's
// user-data folder through the preload bridge, with a synchronous localStorage
// mirror so nothing is lost if the window closes mid-debounce. On load the
// newer of the two copies wins.

const STORAGE_KEY = "recall-progress-v1";
const SAVE_DELAY_MS = 300;
const MAX_LOG = 5000;
const MAX_REWARDS = 600;

export const DEFAULT_SETTINGS = {
  dailyGoal: 15, // cards per day; learner-chosen
  sessionSize: 12,
  newPerDay: 10,
  maxReviewsPerDay: 80,
  retention: 0.9,
  recallFirst: "seen", // off | seen | always — hide options until you recall
  selfExplain: "sometimes", // off | sometimes | always
  includeLongForm: true,
  theme: "system" // system | light | dark
};

let data = null;
let saveTimer = null;
const listeners = new Set();

export function defaultProgress() {
  return {
    version: 1,
    createdAt: Date.now(),
    savedAt: 0,
    settings: { ...DEFAULT_SETTINGS },
    libraries: {},
    items: {},
    skills: {},
    keys: {},
    log: [],
    mistakes: {},
    rewards: [],
    badges: {},
    streak: { current: 0, best: 0, freezes: 1, lastDay: null, history: {}, frozen: [] },
    plan: { after: "", will: "" },
    stats: { hyperFixed: 0, resolved: 0 }
  };
}

export async function initProgress() {
  const fromFile = await readFileCopy();
  const fromLocal = readLocalCopy();
  const candidates = [fromFile, fromLocal].filter(Boolean);
  candidates.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  data = migrate(candidates[0] || defaultProgress());

  window.addEventListener("beforeunload", () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      writeLocalCopy();
    }
  });

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
  data.savedAt = Date.now();
  trimLogs();
  writeLocalCopy();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeFileCopy();
  }, SAVE_DELAY_MS);
  for (const listener of listeners) {
    listener(data);
  }
}

export function onProgressChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetProgress({ keepLibraries = true } = {}) {
  const libraries = keepLibraries ? data.libraries : {};
  const kept = data.settings;
  data = defaultProgress();
  data.libraries = libraries;
  data.settings = kept;
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
  const merged = { ...base, ...candidate };
  merged.settings = { ...DEFAULT_SETTINGS, ...(candidate.settings || {}) };
  merged.streak = { ...base.streak, ...(candidate.streak || {}) };
  merged.plan = { ...base.plan, ...(candidate.plan || {}) };
  merged.stats = { ...base.stats, ...(candidate.stats || {}) };
  for (const key of ["libraries", "items", "skills", "keys", "mistakes", "badges"]) {
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

async function readFileCopy() {
  try {
    const text = await window.testFiles?.loadProgress?.();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function writeFileCopy() {
  try {
    window.testFiles?.saveProgress?.(JSON.stringify(data));
  } catch {
    // The localStorage mirror still holds the latest state.
  }
}

function readLocalCopy() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function writeLocalCopy() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota or privacy mode: the file copy is the source of truth.
  }
}
