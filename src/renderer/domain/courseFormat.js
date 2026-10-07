// Everything that turns a file into a course. Accepts three shapes:
//   1. Course JSON — { title, units: [{ lessons: [{ steps }] }], projects }
//      (also a bare unit { lessons } or a bare project { stages })
//   2. The original test-library JSON — { title, tests: [{ questions }] }
//   3. Plain-text quick courses — "# Title / ## Lesson / Q: … / - wrong / * right"
// and normalizes the result so the rest of the app never has to guess.

import { normalizeLibrary } from "./normalize.js";
import { conceptsFromModel } from "./textGrader.js";
import { normalizeText, parseNumber, parseQuantity } from "./grading.js";
import { slugify } from "../lib/util.js";

export const GRADABLE_TYPES = new Set(["choice", "sort", "order", "match", "estimate", "number", "fill", "text", "api", "build", "code"]);
const STEP_TYPES = new Set(["concept", ...GRADABLE_TYPES]);
const PALETTE = ["#2f6df6", "#8b5cf6", "#14a37f", "#f0743e", "#e0478a", "#0ea5c6", "#c08a00"];

// Text from a dropped/pasted/opened file → raw course object.
export function parseCourseSource(text, fileName = "") {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    throw new Error("That file is empty.");
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`That isn't valid JSON: ${error.message}`);
    }
    return toCourse(data, fileName);
  }
  return parseQuickCourse(trimmed, fileName);
}

export function toCourse(data, fileName = "") {
  if (data && Array.isArray(data.units)) {
    return data;
  }
  if (data && Array.isArray(data.lessons)) {
    return { id: data.id, title: data.title || titleFromFile(fileName), description: data.description, units: [data] };
  }
  if (data && Array.isArray(data.stages)) {
    return { id: `${data.id || slugify(data.title)}-lab`, title: data.title, description: data.summary, units: [], projects: [data] };
  }
  if (data && (Array.isArray(data.tests) || Array.isArray(data))) {
    return legacyToCourse(data, fileName);
  }
  throw new Error("Couldn't find any lessons in that file. See courses/README.md for the format.");
}

export function normalizeCourse(raw, { source = "user" } = {}) {
  const warnings = [];
  const title = str(raw.title) || "Untitled course";
  const id = slugify(raw.id || title) || `course-${Date.now()}`;

  const units = (raw.units || []).map((unit, unitIndex) => {
    const unitId = slugify(unit.id || unit.title) || `unit-${unitIndex + 1}`;
    const lessons = uniqueIds((unit.lessons || []).map((lesson, lessonIndex) => {
      const steps = normalizeSteps(lesson.steps, `${unitId}/${lesson.id || lessonIndex + 1}`, warnings);
      return {
        id: slugify(lesson.id || lesson.title) || `lesson-${lessonIndex + 1}`,
        title: str(lesson.title) || `Lesson ${lessonIndex + 1}`,
        summary: str(lesson.summary),
        minutes: Number(lesson.minutes) || estimateMinutes(steps),
        steps
      };
    })).filter((lesson) => lesson.steps.length > 0);
    return { id: unitId, title: str(unit.title) || `Unit ${unitIndex + 1}`, description: str(unit.description), lessons };
  }).filter((unit) => unit.lessons.length > 0);

  const projects = uniqueIds((raw.projects || []).map((project, projectIndex) => {
    const stages = (project.stages || []).map((stage, stageIndex) => ({
      id: slugify(stage.id || stage.title) || `stage-${stageIndex + 1}`,
      title: str(stage.title) || `Stage ${stageIndex + 1}`,
      steps: normalizeSteps(stage.steps, `${project.id}/${stage.id}`, warnings)
    })).filter((stage) => stage.steps.length > 0);
    return {
      id: slugify(project.id || project.title) || `project-${projectIndex + 1}`,
      title: str(project.title) || `Project ${projectIndex + 1}`,
      summary: str(project.summary),
      difficulty: str(project.difficulty) || "Intermediate",
      minutes: Number(project.minutes) || 25,
      brief: str(project.brief),
      stages
    };
  })).filter((project) => project.stages.length > 0);

  if (units.length === 0 && projects.length === 0) {
    throw new Error("That course has no usable lessons.");
  }

  return {
    id,
    title,
    tagline: str(raw.tagline),
    description: str(raw.description),
    color: /^#[0-9a-f]{6}$/i.test(raw.color || "") ? raw.color : PALETTE[hash(id) % PALETTE.length],
    ownColor: /^#[0-9a-f]{6}$/i.test(raw.color || ""),
    source,
    units,
    projects,
    warnings
  };
}

function normalizeSteps(steps, where, warnings) {
  const seen = new Set();
  const result = [];
  (Array.isArray(steps) ? steps : []).forEach((step, index) => {
    if (!step || typeof step !== "object" || !STEP_TYPES.has(step.type)) {
      warnings.push(`${where}: skipped step ${index + 1} (unknown type "${step?.type}")`);
      return;
    }
    const problem = stepProblem(step);
    if (problem) {
      warnings.push(`${where}: skipped step ${index + 1} (${problem})`);
      return;
    }
    let id = slugify(step.id) || `step-${index + 1}`;
    while (seen.has(id)) {
      id = `${id}-x`;
    }
    seen.add(id);
    result.push({ ...step, id });
  });
  return result;
}

// The minimum each type needs to render and grade without crashing.
function stepProblem(step) {
  switch (step.type) {
    case "concept":
      return str(step.title) || str(step.body) ? null : "concept needs a title or body";
    case "choice":
      return Array.isArray(step.options) && step.options.length >= 2 ? null : "choice needs options";
    case "sort":
      return Array.isArray(step.buckets) && Array.isArray(step.items) && step.items.length > 0 ? null : "sort needs buckets and items";
    case "order":
      return Array.isArray(step.items) && step.items.length >= 2 ? null : "order needs items";
    case "match":
      return Array.isArray(step.pairs) && step.pairs.length >= 2 ? null : "match needs pairs";
    case "estimate":
      return typeof step.answer === "number" && step.answer > 0 ? null : "estimate needs a positive number as its answer";
    case "number":
      return step.answer != null && [].concat(step.answer).every(Number.isFinite) ? null : "number needs a numeric answer";
    case "fill":
      return /\[\[[^\]]+\]\]/.test(step.text || "") ? null : "fill needs [[blanks]]";
    case "text":
      return str(step.prompt) ? null : "text needs a prompt";
    case "api":
      return Array.isArray(step.endpoints) && step.endpoints.length > 0 ? null : "api needs endpoints";
    case "build":
      return Array.isArray(step.palette) && step.rules ? null : "build needs a palette and rules";
    case "code":
      return Array.isArray(step.tests) ? null : "code needs tests";
    default:
      return null;
  }
}

function estimateMinutes(steps) {
  return Math.max(2, Math.round(steps.reduce((sum, step) => sum + (step.type === "concept" ? 0.4 : step.type === "build" ? 4 : step.type === "text" ? 2 : 0.8), 0)));
}

// ── original test-library format ────────────────────────────────────────────

function legacyToCourse(data, fileName) {
  const library = normalizeLibrary(data);
  return {
    id: library.tent || slugify(library.title) || slugify(titleFromFile(fileName)),
    title: library.title,
    description: library.description,
    units: [
      {
        id: "questions",
        title: library.title,
        description: library.description,
        lessons: library.tests.map((test) => ({
          id: test.id,
          title: test.title,
          summary: test.topic || test.instructions,
          steps: test.questions.map(legacyStep)
        }))
      }
    ]
  };
}

function legacyStep(question) {
  const context = question.details
    .filter((detail) => detail.label !== "Starter code")
    .map((detail) => `**${detail.label}:** ${Array.isArray(detail.value) ? detail.value.join("; ") : detail.value}`)
    .join("\n\n");
  const base = {
    id: question.id,
    prompt: question.prompt,
    context: context || undefined,
    why: question.why || undefined,
    hint: question.hints[0] || undefined
  };
  const isChoice = ["single_choice", "multiple_choice", "true_false"].includes(question.type) && question.options.length > 0;

  if (isChoice) {
    const keys = question.answerKey == null ? [] : [].concat(question.answerKey);
    const matched = keys.map((key) => question.options.find((option) => normalizeText(option) === normalizeText(key))).filter(Boolean);
    const answer = matched.length && matched.length === keys.length ? (question.type === "multiple_choice" ? matched : matched[0]) : null;
    return {
      ...base,
      type: "choice",
      options: question.options,
      answer,
      multi: question.type === "multiple_choice",
      misconceptions: question.misconceptions,
      why: base.why || (answer == null && keys.length ? keys.join("; ") : base.why) || "No explanation was provided for this question."
    };
  }

  if (question.type === "code_run") {
    return { ...base, type: "code", language: question.language, starterCode: question.starterCode, tests: question.runnerTests, why: base.why || "Compare your code with the failing test cases." };
  }

  const model = question.answerKey == null ? "" : [].concat(question.answerKey).join("\n");
  return {
    ...base,
    type: "text",
    model: model || undefined,
    rubric: question.rubric.length ? question.rubric : undefined,
    concepts: model && question.rubric.length === 0 ? modelConcepts(model) : undefined,
    answerMode: question.answerMode,
    language: question.language,
    starterCode: question.starterCode || undefined,
    why: base.why || "Compare your answer with the model answer."
  };
}

function modelConcepts(model) {
  const words = model.trim().split(/\s+/);
  if (words.length <= 4) {
    return [{ label: model.trim(), any: [model.trim()] }];
  }
  return conceptsFromModel(model);
}

// ── plain-text quick courses ────────────────────────────────────────────────
//
//   # Course title           lines right after it become the description
//   ## Unit: Name            starts a unit (optional)
//   ## Lesson name           starts a lesson
//   Learn: Title             a concept card; the lines below are its body
//   > A key idea             a short concept card (consecutive lines join)
//   Q: Question              multiple choice ("- wrong", "* right") or typed ("A: answer")
//   Number: Question         an exact number ("A: 42 m", "A: 3.14 ± 0.01")
//   Estimate: Question       a ballpark number, right within 30% ("A: 86400 seconds")
//   Sort: Prompt             then "[Bucket] item" lines
//   Order: Prompt            then "1. first", "2. second", … in the right order
//   Match: Prompt            then "- left -> right" lines
//   Fill: Text with [[blanks]] and [[either|or]]   ("Bank: word, word" for a word bank)
//   Why: / Hint:             explanation and hint for the step above
//   Given: label = value     shown above a Number or Estimate
//   Step: …                  a worked-solution line for a Number or Estimate
//
// Returns a raw course; raw.notes lists lines that weren't understood.

const QUICK_STEPS = { q: "question", question: "question", learn: "learn", number: "number", solve: "number", estimate: "estimate", sort: "sort", order: "order", match: "match", fill: "fill" };

export function parseQuickCourse(text, fileName = "") {
  let title = "";
  const description = [];
  const units = [];
  const notes = [];
  let unit = null;
  let lesson = null;
  let step = null;
  let field = null;
  let started = false;

  const ensureUnit = () => {
    if (!unit) {
      unit = { title: "", lessons: [] };
      units.push(unit);
    }
    return unit;
  };
  const ensureLesson = () => {
    if (!lesson) {
      lesson = { title: `Lesson ${units.reduce((sum, entry) => sum + entry.lessons.length, 0) + 1}`, drafts: [] };
      ensureUnit().lessons.push(lesson);
    }
    return lesson;
  };
  const begin = (kind, first, lineNumber) => {
    started = true;
    step = { kind, line: lineNumber, prompt: first, title: "", body: [], options: [], answers: [], items: [], pairs: [], given: [], solution: [], answer: "", why: "", hint: "", bank: null };
    ensureLesson().drafts.push(step);
    field = kind === "learn" ? "title" : kind === "note" ? "body" : "prompt";
    if (kind === "learn") {
      step.title = first;
      step.prompt = "";
      field = "body";
    }
    if (kind === "note") {
      step.body.push(first);
    }
  };

  String(text).split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line) {
      // A blank line keeps a concept's paragraphs apart and ends any other field.
      if (step && field === "body") {
        step.body.push("");
      } else if (field !== "description") {
        field = null;
      }
      return;
    }
    let match;
    if ((match = line.match(/^#\s+(.+)/))) {
      title = match[1].trim();
      step = null;
      field = "description";
    } else if ((match = line.match(/^##\s+unit\s*:\s*(.+)/i))) {
      started = true;
      unit = { title: match[1].trim(), lessons: [] };
      units.push(unit);
      lesson = null;
      step = null;
      field = null;
    } else if ((match = line.match(/^##\s+(.+)/))) {
      started = true;
      lesson = { title: match[1].trim(), drafts: [] };
      ensureUnit().lessons.push(lesson);
      step = null;
      field = null;
    } else if ((match = line.match(/^>\s?(.*)/))) {
      if (step?.kind === "note" && field === "body") {
        step.body.push(match[1]);
      } else {
        begin("note", match[1], lineNumber);
      }
    } else if ((match = line.match(/^(q|question|learn|number|solve|estimate|sort|order|match|fill)\s*:\s*(.*)/i))) {
      begin(QUICK_STEPS[match[1].toLowerCase()], match[2].trim(), lineNumber);
    } else if (step && (match = line.match(/^(why|hint|a|answer|bank|given|step|solution)\s*:\s*(.*)/i))) {
      const key = match[1].toLowerCase();
      const value = match[2].trim();
      if (key === "why" || key === "hint") {
        step[key] = value;
        field = key;
      } else if (key === "a" || key === "answer") {
        step.answer = value;
        field = "answer";
      } else if (key === "bank") {
        step.bank = value.split(/[,;]/).map((word) => word.trim()).filter(Boolean);
        field = null;
      } else if (key === "given") {
        const [label, ...rest] = value.split(/\s*=\s*/);
        step.given.push([label, rest.join(" = ") || ""]);
        field = null;
      } else {
        step.solution.push(value);
        field = null;
      }
    } else if (step?.kind === "question" && (match = line.match(/^([-*])\s+(.+)/))) {
      step.options.push(match[2]);
      if (match[1] === "*") {
        step.answers.push(match[2]);
      }
      field = null;
    } else if (step?.kind === "sort" && (match = line.match(/^\[(.+?)\]\s*(.+)/))) {
      step.items.push({ text: match[2].trim(), bucket: match[1].trim() });
      field = null;
    } else if (step?.kind === "order" && (match = line.match(/^(?:\d+[.)]|[-*])\s+(.+)/))) {
      step.items.push(match[1].trim());
      field = null;
    } else if (step?.kind === "match" && (match = line.match(/^(?:[-*]\s+)?(.+?)\s*(?:->|→|=>)\s*(.+)/))) {
      step.pairs.push([match[1].trim(), match[2].trim()]);
      field = null;
    } else if (field === "description" && !started) {
      description.push(line);
    } else if (step && field === "body") {
      step.body.push(rawLine.replace(/^\s{0,3}/, ""));
    } else if (step && field) {
      step[field] = `${step[field]} ${line}`.trim();
    } else {
      notes.push({ line: lineNumber, message: `Not part of any step: “${line.slice(0, 60)}”. Start steps with Q:, Learn:, Number:, Sort:, …` });
    }
  });

  const courseTitle = title || titleFromFile(fileName) || "My course";
  const builtUnits = units
    .map((entry) => ({
      // Without a "## Unit:" line the id stays fixed, so renaming the course keeps progress.
      id: slugify(entry.title) || "lessons",
      title: entry.title || courseTitle,
      lessons: entry.lessons
        .map((draftLesson) => ({ id: slugify(draftLesson.title), title: draftLesson.title, steps: draftLesson.drafts.map((draft) => quickStep(draft, notes)).filter(Boolean) }))
        .filter((entryLesson) => entryLesson.steps.length > 0)
    }))
    .filter((entry) => entry.lessons.length > 0);
  if (builtUnits.length === 0) {
    throw new Error("No steps found yet. Start one with Q:, Learn:, Number:, Sort:, Order:, Match:, or Fill: (see the format guide).");
  }
  const count = builtUnits.reduce((sum, entry) => sum + entry.lessons.reduce((inner, entryLesson) => inner + entryLesson.steps.length, 0), 0);
  return {
    id: slugify(courseTitle),
    title: courseTitle,
    description: description.join(" ") || `${count} steps from ${fileName || "your notes"}.`,
    units: builtUnits,
    notes
  };
}

// A drafted quick step → a course step (or null, with a note saying why).
function quickStep(draft, notes) {
  const id = slugify(draft.prompt || draft.title || draft.body.join(" ")).slice(0, 48) || `${draft.kind}-${draft.line}`;
  const extra = { ...(draft.why && { why: draft.why }), ...(draft.hint && { hint: draft.hint }) };
  const skip = (message) => {
    notes.push({ line: draft.line, message });
    return null;
  };
  const body = draft.body.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  switch (draft.kind) {
    case "learn":
      return { id, type: "concept", title: draft.title, body };
    case "note":
      return { id, type: "concept", title: "Key idea", body };
    case "question":
      if (draft.options.length >= 2) {
        return {
          id,
          type: "choice",
          prompt: draft.prompt,
          options: draft.options,
          answer: draft.answers.length > 1 ? draft.answers : draft.answers[0] ?? null,
          ...extra,
          why: draft.why || (draft.answers.length ? `Answer: ${draft.answers.join(", ")}.` : "No answer marked, so you'll grade yourself.")
        };
      }
      if (draft.options.length === 1) {
        return skip("A multiple-choice question needs at least two options.");
      }
      return {
        id,
        type: "text",
        prompt: draft.prompt,
        model: draft.answer || undefined,
        concepts: draft.answer ? modelConcepts(draft.answer) : undefined,
        ...extra,
        why: draft.why || (draft.answer ? `Answer: ${draft.answer}` : "Compare with what you know and grade yourself.")
      };
    case "number": {
      const parsed = splitNumber(draft.answer);
      if (!parsed) {
        return skip(`“${draft.prompt.slice(0, 40)}” needs a numeric answer, like “A: 42” or “A: 3.14 ± 0.01 m”.`);
      }
      return { id, type: "number", prompt: draft.prompt, answer: parsed.value, ...(parsed.tolerance && { tolerance: parsed.tolerance }), ...(parsed.unit && { unit: parsed.unit }), ...(draft.given.length && { given: draft.given }), ...(draft.solution.length && { solution: draft.solution }), ...extra };
    }
    case "estimate": {
      const value = parseQuantity(draft.answer);
      if (!(value > 0)) {
        return skip(`“${draft.prompt.slice(0, 40)}” needs a positive number, like “A: 86400 seconds”.`);
      }
      const unit = draft.answer.replace(/^\s*~?\s*[\d.,]+(?:e[+-]?\d+)?\s*(?:k|m|mm|b|bn|t|thousand|million|billion|trillion)?\b\s*/i, "").trim();
      return { id, type: "estimate", prompt: draft.prompt, answer: value, unit, ...(draft.given.length && { given: draft.given }), ...(draft.solution.length && { solution: draft.solution }), ...extra };
    }
    case "sort": {
      const buckets = [...new Set(draft.items.map((item) => item.bucket))];
      if (buckets.length < 2 || draft.items.length < 2) {
        return skip("A Sort needs items in at least two buckets, written “[Bucket] item”.");
      }
      return { id, type: "sort", prompt: draft.prompt, buckets, items: draft.items, ...extra };
    }
    case "order":
      if (draft.items.length < 2) {
        return skip("An Order needs at least two numbered lines (“1. first”).");
      }
      return { id, type: "order", prompt: draft.prompt, items: draft.items, ...extra };
    case "match":
      if (draft.pairs.length < 2) {
        return skip("A Match needs at least two “left -> right” lines.");
      }
      return { id, type: "match", prompt: draft.prompt, pairs: draft.pairs, ...extra };
    case "fill":
      if (!/\[\[[^\]]+\]\]/.test(draft.prompt)) {
        return skip("A Fill needs at least one [[blank]].");
      }
      return { id, type: "fill", text: draft.prompt, ...(draft.bank && { bank: draft.bank }), ...extra };
    default:
      return null;
  }
}

// "42", "-3/4 m", "3.14 ± 0.01", "9.8 +/- 0.1 m/s²" → { value, tolerance, unit }
function splitNumber(text) {
  const match = String(text || "").trim().match(/^(-?\d[\d,]*(?:\.\d+)?(?:e[+-]?\d+)?(?:\s+\d+\s*\/\s*\d+|\s*\/\s*\d+)?|-?\.\d+)\s*(?:(?:±|\+\/-)\s*(\d*\.?\d+))?\s*(.*)$/i);
  const value = match ? parseNumber(match[1]) : null;
  if (value == null) {
    return null;
  }
  return { value, tolerance: match[2] ? Number(match[2]) : null, unit: match[3].trim() };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function uniqueIds(list) {
  const seen = new Set();
  for (const entry of list) {
    while (seen.has(entry.id)) {
      entry.id = `${entry.id}-x`;
    }
    seen.add(entry.id);
  }
  return list;
}

function titleFromFile(fileName) {
  return String(fileName || "")
    .replace(/\.[a-z]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function str(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hash(text) {
  let value = 0;
  for (const char of text) {
    value = (value * 31 + char.charCodeAt(0)) >>> 0;
  }
  return value;
}
