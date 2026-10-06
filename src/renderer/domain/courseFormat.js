// Everything that turns a file into a course. Accepts three shapes:
//   1. Course JSON — { title, units: [{ lessons: [{ steps }] }], projects }
//      (also a bare unit { lessons } or a bare project { stages })
//   2. The original test-library JSON — { title, tests: [{ questions }] }
//   3. Plain-text quick courses — "# Title / ## Lesson / Q: … / - wrong / * right"
// and normalizes the result so the rest of the app never has to guess.

import { normalizeLibrary } from "./normalize.js";
import { conceptsFromModel } from "./textGrader.js";
import { normalizeText } from "./grading.js";
import { slugify } from "../lib/util.js";

export const GRADABLE_TYPES = new Set(["choice", "sort", "order", "match", "estimate", "fill", "text", "api", "build", "code"]);
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

export function normalizeCourse(raw, { source = "imported" } = {}) {
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
      return typeof step.answer === "number" && step.answer > 0 ? null : "estimate needs a numeric answer";
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

export function parseQuickCourse(text, fileName = "") {
  let title = "";
  const lessons = [];
  let lesson = null;
  let question = null;
  let field = null;

  const ensureLesson = () => {
    if (!lesson) {
      lesson = { id: `lesson-${lessons.length + 1}`, title: `Lesson ${lessons.length + 1}`, steps: [] };
      lessons.push(lesson);
    }
    return lesson;
  };
  const finishQuestion = () => {
    if (question) {
      ensureLesson().steps.push(quickStep(question, ensureLesson().steps.length));
      question = null;
      field = null;
    }
  };

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (/^#\s+/.test(line) && !/^##/.test(line)) {
      finishQuestion();
      title = line.replace(/^#\s+/, "");
    } else if (/^##\s+/.test(line)) {
      finishQuestion();
      lesson = { id: `lesson-${lessons.length + 1}`, title: line.replace(/^##\s+/, ""), steps: [] };
      lessons.push(lesson);
    } else if (/^q\s*:/i.test(line)) {
      finishQuestion();
      question = { prompt: line.replace(/^q\s*:\s*/i, ""), options: [], answers: [], answer: "", why: "" };
      field = "prompt";
    } else if (/^>\s*/.test(line)) {
      finishQuestion();
      const body = line.replace(/^>\s*/, "");
      ensureLesson().steps.push({ id: `note-${ensureLesson().steps.length + 1}`, type: "concept", title: "Key idea", body });
    } else if (question && /^[-*]\s+/.test(line)) {
      const option = line.replace(/^[-*]\s+/, "");
      question.options.push(option);
      if (line.startsWith("*")) {
        question.answers.push(option);
      }
      field = null;
    } else if (question && /^a\s*:/i.test(line)) {
      question.answer = line.replace(/^a\s*:\s*/i, "");
      field = "answer";
    } else if (question && /^why\s*:/i.test(line)) {
      question.why = line.replace(/^why\s*:\s*/i, "");
      field = "why";
    } else if (question && field) {
      question[field] = `${question[field]} ${line}`.trim();
    }
  }
  finishQuestion();

  const usable = lessons.filter((entry) => entry.steps.length > 0);
  if (usable.length === 0) {
    throw new Error("No questions found. Start each one with \"Q:\" — see courses/README.md for the quick format.");
  }
  const courseTitle = title || titleFromFile(fileName) || "My course";
  return {
    id: slugify(courseTitle),
    title: courseTitle,
    description: `${usable.reduce((sum, entry) => sum + entry.steps.length, 0)} cards from ${fileName || "pasted notes"}.`,
    units: [{ id: "cards", title: courseTitle, lessons: usable }]
  };
}

function quickStep(question, index) {
  const id = `q-${index + 1}`;
  if (question.options.length >= 2) {
    return {
      id,
      type: "choice",
      prompt: question.prompt,
      options: question.options,
      answer: question.answers.length > 1 ? question.answers : question.answers[0] ?? null,
      why: question.why || (question.answers.length ? `Answer: ${question.answers.join(", ")}.` : "No answer marked — grade yourself.")
    };
  }
  return {
    id,
    type: "text",
    prompt: question.prompt,
    model: question.answer || undefined,
    concepts: question.answer ? modelConcepts(question.answer) : undefined,
    why: question.why || (question.answer ? `Answer: ${question.answer}` : "Grade yourself.")
  };
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
