// Grading helpers for the practice engine. Pure functions only.
//
// - resolveKey: what the item can be checked against (options, model text,
//   rubric, runnable tests) — decides auto-grading vs. self-grading.
// - coverage / segmentModelAnswer: key-term overlap between a learner's answer
//   and the model answer, used to prefill self-grading and mark differences.
// - prefillRubric: suggests which rubric rows an open answer already covers.
// - buildHintLadder: nudge → partial → reveal, each with a cost.
// - buildCloze / checkClozeWord: the "faded example" — the model answer with
//   key words blanked out for the learner to fill in.

const STOPWORDS = new Set(
  ("a an the and or but if then else of to in on at by for with from into onto over under as is are was were be been being " +
    "it its this that these those there their they them he she we you your our i me my not no yes do does did done " +
    "can could should would will may might must shall than so such very more most less least also only just about " +
    "which who whom whose what when where why how all any each both few other some own same too up down out off again " +
    "further once here because while until via per etc e g ie eg vs").split(" ")
);

// Words that describe a rubric row rather than its content ("Mentions DNS…").
const RUBRIC_WORDS = new Set(
  ("mentions mention explains explain identifies identify describes describe gives give uses use includes include notes note " +
    "states state says say correctly clearly answer example examples shows show discusses discuss recognizes recognize names name " +
    "lists list defines define distinguishes distinguish demonstrates demonstrate provides provide realistic appropriate " +
    "accurately accurate understands understand acknowledges acknowledge treat treats does").split(" ")
);

export const CONFIDENCE_LEVELS = [
  { value: 1, label: "Guess", short: "Guess", p: 0.25 },
  { value: 2, label: "Unsure", short: "Unsure", p: 0.5 },
  { value: 3, label: "Likely", short: "Likely", p: 0.75 },
  { value: 4, label: "Certain", short: "Certain", p: 0.95 }
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

// Unique content words of text as { word, stem } (stopwords removed).
export function contentWords(text, extraStop = null) {
  const seen = new Set();
  const words = [];
  for (const raw of normalizeText(text).split(" ")) {
    const word = raw.replace(/^[./-]+|[./-]+$/g, "");
    if (word.length < 2 || STOPWORDS.has(word) || extraStop?.has(word)) {
      continue;
    }
    const key = stem(word);
    if (!seen.has(key)) {
      seen.add(key);
      words.push({ word, stem: key });
    }
  }
  return words;
}

function stemSet(text) {
  return new Set(contentWords(text).map((entry) => entry.stem));
}

// How much of the reference's vocabulary appears in the response.
export function coverage(response, reference, extraStop = null) {
  const target = contentWords(reference, extraStop);
  if (target.length === 0) {
    return { score: 0, hit: [], missed: [] };
  }
  const have = stemSet(response);
  const hit = [];
  const missed = [];
  for (const entry of target) {
    (have.has(entry.stem) ? hit : missed).push(entry.word);
  }
  return { score: hit.length / target.length, hit, missed };
}

// Splits a model answer into segments flagged hit/miss against a response,
// so the comparison view can mark which key terms the learner produced.
export function segmentModelAnswer(model, response) {
  const have = stemSet(response);
  return String(model)
    .split(/(\s+)/)
    .map((token) => {
      const core = token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "").toLowerCase();
      if (!core || core.length < 3 || STOPWORDS.has(core)) {
        return { text: token, mark: null };
      }
      return { text: token, mark: have.has(stem(core)) ? "hit" : "miss" };
    });
}

// What can this item be checked against?
export function resolveKey(question, override = null) {
  const raw = override ?? question.answerKey;
  const key = {
    choice: null,
    text: null,
    rubric: question.rubric || [],
    tests: question.type === "code_run" && question.runnerTests.length > 0,
    auto: false
  };

  if (isChoice(question)) {
    const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const matched = values.map((value) => matchOption(value, question.options)).filter((option) => option !== null);
    if (matched.length > 0 && matched.length === values.length) {
      key.choice = [...new Set(matched)];
      key.auto = true;
    } else if (values.length > 0) {
      key.text = values.join("; ");
    }
  } else if (raw) {
    key.text = Array.isArray(raw) ? raw.join("\n") : raw;
  }

  if (key.tests) {
    key.auto = true;
  }

  return key;
}

export function isChoice(question) {
  return (
    (question.type === "single_choice" || question.type === "multiple_choice" || question.type === "true_false") &&
    question.options.length > 0
  );
}

export function matchOption(value, options) {
  const target = normalizeText(value);
  if (!target) {
    return null;
  }
  const exact = options.find((option) => normalizeText(option) === target);
  if (exact) {
    return exact;
  }
  // Tolerate small wording drift between the key and the option text.
  let best = null;
  let bestScore = 0;
  for (const option of options) {
    const a = stemSet(option);
    const b = stemSet(value);
    const union = new Set([...a, ...b]);
    const shared = [...a].filter((word) => b.has(word)).length;
    const score = union.size ? shared / union.size : 0;
    if (score > bestScore) {
      best = option;
      bestScore = score;
    }
  }
  return bestScore >= 0.8 ? best : null;
}

export function gradeChoice(key, selected) {
  const correct = new Set(key.choice);
  const chosen = new Set(selected);
  const missed = [...correct].filter((option) => !chosen.has(option));
  const wrong = [...chosen].filter((option) => !correct.has(option));
  const right = [...chosen].filter((option) => correct.has(option));
  return {
    correct: missed.length === 0 && wrong.length === 0,
    score: correct.size ? Math.max(0, (right.length - wrong.length) / correct.size) : 0,
    missed,
    wrong
  };
}

// Auto-check of a typed answer against model text: a suggestion only — the
// learner makes the final call.
export function checkText(response, modelText) {
  if (!String(response ?? "").trim()) {
    return { verdict: "blank", score: 0, hit: [], missed: contentWords(modelText).map((entry) => entry.word) };
  }
  if (normalizeText(response) === normalizeText(modelText)) {
    return { verdict: "match", score: 1, hit: contentWords(modelText).map((entry) => entry.word), missed: [] };
  }
  const result = coverage(response, modelText);
  const verdict = result.score >= 0.7 ? "match" : result.score >= 0.35 ? "partial" : "miss";
  return { verdict, ...result };
}

export function prefillRubric(response, rubric) {
  const have = stemSet(response);
  return rubric.map((row) => {
    const words = contentWords(row, RUBRIC_WORDS);
    if (words.length === 0) {
      return false;
    }
    const hits = words.filter((entry) => have.has(entry.stem)).length;
    return hits / words.length >= 0.4 || (words.length <= 2 && hits >= 1);
  });
}

// Maps the outcome of an attempt to the grade we suggest (1–4). The learner
// can override it; auto-graded misses are fixed at Again.
export function suggestGrade({ outcome, confidence, hints = 0, latencyMs = 0 }) {
  if (outcome === "wrong") {
    return 1;
  }
  if (outcome === "partial") {
    return 2;
  }
  if (outcome === "correct") {
    if (hints > 0 || confidence === 1) {
      return 2;
    }
    if (confidence === 4 && latencyMs > 0 && latencyMs < 8000) {
      return 4;
    }
    return 3;
  }
  return null;
}

export function rubricOutcome(checked) {
  if (checked.length === 0) {
    return "unknown";
  }
  const share = checked.filter(Boolean).length / checked.length;
  if (share >= 0.75) {
    return "correct";
  }
  if (share >= 0.4) {
    return "partial";
  }
  return "wrong";
}

// Up to three hints, cheapest first. The last rung of an auto ladder reveals
// the answer, which ends the attempt as a miss.
export function buildHintLadder(question, key) {
  if (question.hints.length > 0) {
    return question.hints.map((text, index) => ({ label: `Hint ${index + 1}`, kind: "text", text, reveal: false }));
  }

  if (key.choice && question.type !== "true_false") {
    const wrong = question.options.filter((option) => !key.choice.includes(option));
    const ladder = [];
    if (question.type === "multiple_choice") {
      ladder.push({ label: "How many?", kind: "text", text: `${key.choice.length} of the ${question.options.length} options are correct.`, reveal: false });
      if (wrong.length > 0) {
        ladder.push({ label: "Rule one out", kind: "eliminate", options: wrong.slice(0, 1), reveal: false });
      }
    } else {
      if (wrong.length >= 2) {
        ladder.push({ label: "Rule one out", kind: "eliminate", options: [wrong[wrong.length - 1]], reveal: false });
      }
      if (wrong.length >= 3) {
        ladder.push({ label: "Rule out another", kind: "eliminate", options: [wrong[wrong.length - 1], wrong[0]], reveal: false });
      }
    }
    ladder.push({ label: "Show answer", kind: "reveal", reveal: true });
    return ladder;
  }

  if (key.text && !isChoice(question)) {
    const words = key.text.split(/\s+/).filter(Boolean);
    return [
      { label: "Nudge", kind: "text", text: `Starts with “${words.slice(0, 3).join(" ")}…” — about ${words.length} words.`, reveal: false },
      { label: "Partial answer", kind: "text", text: clozePreview(key.text), reveal: false },
      { label: "Show answer", kind: "reveal", reveal: true }
    ];
  }

  if (key.rubric.length > 0) {
    const half = Math.max(1, Math.ceil(key.rubric.length / 2));
    return [
      { label: "Nudge", kind: "text", text: `A full answer covers ${key.rubric.length} points. One of them: ${key.rubric[0]}`, reveal: false },
      { label: "More points", kind: "list", items: key.rubric.slice(0, half), reveal: false },
      { label: "All points", kind: "list", items: key.rubric, reveal: false }
    ];
  }

  if (key.tests) {
    const tests = question.runnerTests;
    const ladder = [{ label: "What's tested", kind: "list", items: tests.map((test) => test.name || test.call), reveal: false }];
    const first = tests.find((test) => Object.prototype.hasOwnProperty.call(test, "expect"));
    if (first) {
      ladder.push({ label: "First case", kind: "code", text: `${first.call}\n// should return ${JSON.stringify(first.expect)}`, reveal: false });
    }
    return ladder;
  }

  return [];
}

// The faded example: blanks out up to maxBlanks key words, evenly spread and
// biased to longer words, so the learner regenerates the important parts.
export function buildCloze(text, maxBlanks = 6) {
  const tokens = String(text).split(/(\s+)/);
  const candidates = [];

  tokens.forEach((token, index) => {
    const match = token.match(/^([^A-Za-z0-9]*)([A-Za-z0-9][A-Za-z0-9'-]*[A-Za-z0-9]|[A-Za-z0-9])([^A-Za-z0-9]*)$/);
    if (!match) {
      return;
    }
    const word = match[2];
    if (word.length >= 4 && !STOPWORDS.has(word.toLowerCase())) {
      candidates.push({ index, prefix: match[1], word, suffix: match[3] });
    }
  });

  const blankCount = Math.min(maxBlanks, Math.max(1, Math.round(candidates.length * 0.35)));
  const chosen = new Set();
  if (candidates.length > 0) {
    const step = candidates.length / blankCount;
    for (let slot = 0; slot < blankCount; slot += 1) {
      // Within each slice, prefer the longest word (usually the key term).
      const slice = candidates.slice(Math.floor(slot * step), Math.max(Math.floor((slot + 1) * step), Math.floor(slot * step) + 1));
      const best = slice.reduce((a, b) => (b.word.length > a.word.length ? b : a), slice[0]);
      if (best) {
        chosen.add(best.index);
      }
    }
  }

  const byIndex = new Map(candidates.map((candidate) => [candidate.index, candidate]));
  const parts = [];
  tokens.forEach((token, index) => {
    if (chosen.has(index)) {
      const candidate = byIndex.get(index);
      if (candidate.prefix) {
        parts.push({ text: candidate.prefix });
      }
      parts.push({ blank: true, answer: candidate.word });
      if (candidate.suffix) {
        parts.push({ text: candidate.suffix });
      }
    } else if (token) {
      parts.push({ text: token });
    }
  });
  return parts;
}

export function clozePreview(text) {
  return buildCloze(text, 8)
    .map((part) => (part.blank ? "_".repeat(Math.min(10, Math.max(4, part.answer.length))) : part.text))
    .join("");
}

export function checkClozeWord(input, answer) {
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

export function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, index) => index);
  for (let i = 1; i < rows; i += 1) {
    const current = [i];
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[cols - 1];
}

// Misconception note for a chosen distractor, if the item defines one.
export function misconceptionFor(question, option) {
  const notes = question.misconceptions || {};
  if (notes[option]) {
    return notes[option];
  }
  const target = normalizeText(option);
  const entry = Object.entries(notes).find(([key]) => normalizeText(key) === target);
  return entry ? entry[1] : null;
}

// Rough probability of a lucky guess, used for difficulty targeting.
export function guessRate(question) {
  if (question.type === "true_false") {
    return 0.5;
  }
  if (question.type === "single_choice" && question.options.length > 0) {
    return 1 / question.options.length;
  }
  if (question.type === "multiple_choice") {
    return 0.1;
  }
  return 0.03;
}
