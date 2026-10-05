// Calendar helpers for the learner model. A study "day" rolls over at 4am local
// time (like Anki), so a late-night session still counts toward the day the
// learner thinks they are in.

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

const ROLLOVER_HOUR = 4;

// "YYYY-MM-DD" for the study day containing ts.
export function dayKey(ts = Date.now()) {
  const shifted = new Date(ts - ROLLOVER_HOUR * HOUR_MS);
  const month = String(shifted.getMonth() + 1).padStart(2, "0");
  const day = String(shifted.getDate()).padStart(2, "0");
  return `${shifted.getFullYear()}-${month}-${day}`;
}

// Timestamp of the next rollover after ts — "due today" means due before this.
export function endOfStudyDay(ts = Date.now()) {
  const shifted = new Date(ts - ROLLOVER_HOUR * HOUR_MS);
  shifted.setHours(0, 0, 0, 0);
  return shifted.getTime() + DAY_MS + ROLLOVER_HOUR * HOUR_MS;
}

export function addDays(key, days) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day + days, 12);
  return dayKey(date.getTime() + ROLLOVER_HOUR * HOUR_MS);
}

// Whole study days from key a to key b (b later → positive).
export function daysBetween(a, b) {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DAY_MS);
}

// Compact interval label: "<1m", "10m", "3h", "4d", "3w", "2mo", "1.4y".
export function formatInterval(ms) {
  if (ms < MINUTE_MS) {
    return "<1m";
  }
  if (ms < HOUR_MS) {
    return `${Math.round(ms / MINUTE_MS)}m`;
  }
  if (ms < DAY_MS) {
    return `${Math.round(ms / HOUR_MS)}h`;
  }
  const days = ms / DAY_MS;
  if (days < 14) {
    return `${Math.round(days)}d`;
  }
  if (days < 60) {
    return `${Math.round(days / 7)}w`;
  }
  if (days < 365) {
    return `${Math.round(days / 30)}mo`;
  }
  return `${(days / 365).toFixed(1)}y`;
}

// "just now", "5 min ago", "yesterday", "3 days ago", or a date.
export function formatAgo(ts, now = Date.now()) {
  const diff = now - ts;
  if (diff < MINUTE_MS) {
    return "just now";
  }
  if (diff < HOUR_MS) {
    return `${Math.round(diff / MINUTE_MS)} min ago`;
  }
  const days = daysBetween(dayKey(ts), dayKey(now));
  if (days === 0) {
    return `${Math.round(diff / HOUR_MS)} h ago`;
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < 14) {
    return `${days} days ago`;
  }
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// "in 3 days", "today", "tomorrow", "overdue".
export function formatDue(dueAt, now = Date.now()) {
  if (dueAt == null) {
    return "new";
  }
  if (dueAt <= now) {
    return "due now";
  }
  const days = daysBetween(dayKey(now), dayKey(dueAt));
  if (days <= 0) {
    return "later today";
  }
  if (days === 1) {
    return "tomorrow";
  }
  return `in ${formatInterval(days * DAY_MS)}`;
}
