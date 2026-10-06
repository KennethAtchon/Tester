// Pure graders for every exercise type, plus the text helpers they share.
// Each grader takes a step (from a course) and the learner's response, and
// returns { correct, score (0–1), ...details } — the player decides what to
// show and the learner model decides what to schedule.

export const STOPWORDS = new Set(
  ("a an the and or but if then else of to in on at by for with from into onto over under as is are was were be been being " +
    "it its this that these those there their they them he she we you your our i me my not no yes do does did done " +
    "can could should would will may might must shall than so such very more most less least also only just about " +
    "which who whom whose what when where why how all any each both few other some own same too up down out off again " +
    "further once here because while until via per etc e g ie eg vs").split(" ")
);

export const CONFIDENCE_LEVELS = [
  { value: 1, label: "Guess", p: 0.25 },
  { value: 2, label: "Unsure", p: 0.5 },
  { value: 3, label: "Likely", p: 0.75 },
  { value: 4, label: "Certain", p: 0.95 }
];

export function normalizeText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[“”"'‘’`]/g, "")
    .replace(/[^a-z0-9+#./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stem(word) {
  let w = word.toLowerCase();
  if (w.length > 4 && w.endsWith("ies")) {
    w = `${w.slice(0, -3)}y`;
  } else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) {
    w = w.slice(0, -1);
  }
  if (w.length > 5 && w.endsWith("ing")) {
    w = w.slice(0, -3);
  } else if (w.length > 4 && w.endsWith("ed")) {
    w = w.slice(0, -2);
  }
  if (w.length > 3 && w.endsWith("e")) {
    w = w.slice(0, -1);
  }
  return w;
}

export function levenshtein(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

// Typed word vs. accepted answer: forgiving of case, plurals, and a typo.
export function wordMatches(input, answer) {
  const a = normalizeText(input);
  const b = normalizeText(answer);
  if (!a) {
    return false;
  }
  if (a === b || stem(a) === stem(b)) {
    return true;
  }
  const tolerance = b.length >= 9 ? 2 : b.length >= 5 ? 1 : 0;
  return levenshtein(a, b) <= tolerance;
}

// ── choice ──────────────────────────────────────────────────────────────────

export function choiceAnswers(step) {
  if (step.answer == null) {
    return null;
  }
  return Array.isArray(step.answer) ? step.answer : [step.answer];
}

export function isMulti(step) {
  return Boolean(step.multi) || (Array.isArray(step.answer) && step.answer.length > 1);
}

export function gradeChoice(step, selected) {
  const answers = choiceAnswers(step);
  if (!answers) {
    return { correct: null, score: null, missed: [], wrong: [], selfGrade: true };
  }
  const correct = new Set(answers);
  const chosen = new Set(selected);
  const missed = [...correct].filter((option) => !chosen.has(option));
  const wrong = [...chosen].filter((option) => !correct.has(option));
  const right = [...chosen].filter((option) => correct.has(option)).length;
  return {
    correct: missed.length === 0 && wrong.length === 0,
    score: Math.max(0, (right - wrong.length) / correct.size),
    missed,
    wrong
  };
}

export function misconceptionFor(step, option) {
  const notes = step.misconceptions || {};
  return notes[option] ?? Object.entries(notes).find(([key]) => normalizeText(key) === normalizeText(option))?.[1] ?? null;
}

// ── sort: items into buckets ────────────────────────────────────────────────

// placement: array (by item index) of bucket name or null
export function gradeSort(step, placement) {
  const perItem = step.items.map((item, index) => placement[index] === item.bucket);
  const right = perItem.filter(Boolean).length;
  return { correct: right === step.items.length, score: right / step.items.length, perItem };
}

// ── order: arrange into sequence ────────────────────────────────────────────

// order: array of original item indices in the learner's chosen order
export function gradeOrder(step, order) {
  const perPosition = order.map((itemIndex, position) => itemIndex === position);
  // Partial credit = longest run already in the right relative order.
  const lis = longestIncreasing(order);
  return { correct: perPosition.every(Boolean), score: lis / order.length, perPosition };
}

function longestIncreasing(list) {
  const tails = [];
  for (const value of list) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (tails[mid] < value) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    tails[low] = value;
  }
  return tails.length;
}

// ── match: pair left with right ─────────────────────────────────────────────

// pairs: array (by left index) of chosen right index or null
export function gradeMatch(step, pairs) {
  const perPair = step.pairs.map((_, index) => pairs[index] === index);
  const right = perPair.filter(Boolean).length;
  return { correct: right === step.pairs.length, score: right / step.pairs.length, perPair };
}

// ── estimate: back-of-envelope numbers ──────────────────────────────────────

const MAGNITUDES = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9, t: 1e12, trillion: 1e12 };

// "1.2k", "3 million", "2.5e6", "1,000,000", "40%" → number (or null).
export function parseQuantity(text) {
  const raw = String(text ?? "").trim().toLowerCase().replace(/,/g, "").replace(/_/g, "");
  if (!raw) {
    return null;
  }
  const match = raw.match(/^~?\s*(-?\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-z%]*)/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return null;
  }
  const suffix = match[2];
  if (!suffix || suffix === "%") {
    return value;
  }
  if (MAGNITUDES[suffix]) {
    return value * MAGNITUDES[suffix];
  }
  // A unit typed after the number ("500 gb" when the unit is GB) is fine.
  return value;
}

// Within tolerance (default 30%) = right; within 2× = right ballpark.
export function gradeEstimate(step, value) {
  if (value == null || !(value > 0) || !(step.answer > 0)) {
    return { correct: false, score: 0, verdict: "wrong", ratio: null };
  }
  const ratio = Math.max(value / step.answer, step.answer / value);
  const tolerance = step.tolerance ?? 0.3;
  if (ratio <= 1 + tolerance) {
    return { correct: true, score: 1, verdict: "correct", ratio };
  }
  if (ratio <= 2) {
    return { correct: false, score: 0.6, verdict: "partial", ratio };
  }
  if (ratio <= 10) {
    return { correct: false, score: 0.2, verdict: "wrong", ratio };
  }
  return { correct: false, score: 0, verdict: "wrong", ratio };
}

export function formatQuantity(value) {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  const abs = Math.abs(value);
  const units = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const scaled = value / size;
      return `${scaled >= 100 ? Math.round(scaled) : Number(scaled.toPrecision(3))}${suffix}`;
    }
  }
  return abs >= 100 ? String(Math.round(value)) : String(Number(value.toPrecision(3)));
}

// ── fill: blanks in text ────────────────────────────────────────────────────

// "Put a [[cache|caching layer]] in front of the [[database]]" →
// [{ text }, { blank: 0, answers: ["cache", "caching layer"] }, ...]
export function parseFill(text) {
  const parts = [];
  let blank = 0;
  let last = 0;
  const pattern = /\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ text: text.slice(last, match.index) });
    }
    parts.push({ blank: blank, answers: match[1].split("|").map((value) => value.trim()).filter(Boolean) });
    blank += 1;
    last = pattern.lastIndex;
  }
  if (last < text.length) {
    parts.push({ text: text.slice(last) });
  }
  return parts;
}

export function gradeFill(step, values) {
  const blanks = parseFill(step.text).filter((part) => part.blank != null);
  const perBlank = blanks.map((part, index) => {
    const value = values[index];
    if (step.bank) {
      return part.answers.some((answer) => normalizeText(answer) === normalizeText(value));
    }
    return part.answers.some((answer) => wordMatches(value, answer));
  });
  const right = perBlank.filter(Boolean).length;
  return { correct: right === blanks.length, score: blanks.length ? right / blanks.length : 0, perBlank, blanks };
}

// ── api: method + path per purpose ──────────────────────────────────────────

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

// "/api/v1/users/{id}/posts/" → ["user", ":", "post"]
export function pathSegments(path) {
  let cleaned = String(path ?? "").trim().toLowerCase();
  cleaned = cleaned.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  const segments = cleaned.split("/").filter(Boolean);
  while (segments.length && (segments[0] === "api" || /^v\d+$/.test(segments[0]))) {
    segments.shift();
  }
  return segments.map((segment) => (/^[:{<[$]|[}>\]]$|^\d+$/.test(segment) ? ":" : stem(segment.replace(/[-_]/g, ""))));
}

export function pathMatches(actual, expected) {
  const candidates = Array.isArray(expected) ? expected : [expected];
  const got = pathSegments(actual);
  return candidates.some((candidate) => {
    const want = pathSegments(candidate);
    return want.length === got.length && want.every((segment, index) => segment === got[index]);
  });
}

// rows: [{ method, path }] aligned with step.endpoints
export function gradeApi(step, rows) {
  const perRow = step.endpoints.map((endpoint, index) => {
    const row = rows[index] || {};
    const methods = Array.isArray(endpoint.method) ? endpoint.method : [endpoint.method];
    return {
      methodOk: methods.includes(String(row.method || "").toUpperCase()),
      pathOk: pathMatches(row.path, endpoint.path)
    };
  });
  const score = perRow.reduce((sum, row) => sum + (row.methodOk ? 0.5 : 0) + (row.pathOk ? 0.5 : 0), 0) / Math.max(1, perRow.length);
  return { correct: perRow.every((row) => row.methodOk && row.pathOk), score, perRow };
}
