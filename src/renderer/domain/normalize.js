// Domain layer: turns arbitrary loaded JSON into a validated, predictable
// library/test/question shape that the UI can render without defensive checks.

import { stringify, slugify, getUniqueId } from "../lib/util.js";

const QUESTION_TYPES = ["short_answer", "long_answer", "single_choice", "multiple_choice", "true_false", "code_run"];

const TYPE_ALIASES = {
  choice: "single_choice",
  multiple: "multiple_choice",
  select_all: "multiple_choice",
  truefalse: "true_false",
  short: "short_answer",
  long: "long_answer",
  code: "code_run",
  coding: "code_run",
  run: "code_run"
};

export function normalizeLibrary(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("The JSON file must contain an object.");
  }

  const rawTests = Array.isArray(candidate.tests)
    ? candidate.tests
    : Array.isArray(candidate)
      ? candidate
      : null;

  if (!rawTests || rawTests.length === 0) {
    throw new Error("The JSON file needs a non-empty tests array.");
  }

  const usedTestIds = new Set();
  const tests = rawTests.map((test, index) => {
    const normalizedTest = normalizeTest(test, index);
    normalizedTest.id = getUniqueId(normalizedTest.id, usedTestIds);
    return normalizedTest;
  });

  return {
    title: stringify(candidate.title) || "Untitled Test Library",
    description: stringify(candidate.description),
    tests
  };
}

function normalizeTest(test, index) {
  if (!test || typeof test !== "object") {
    throw new Error(`Test ${index + 1} must be an object.`);
  }

  const questions = Array.isArray(test.questions) ? test.questions : [];

  if (questions.length === 0) {
    throw new Error(`Test ${index + 1} needs at least one question.`);
  }

  const title = stringify(test.title) || `Test ${index + 1}`;
  const usedQuestionIds = new Set();

  return {
    id: stringify(test.id) || slugify(title) || `test-${index + 1}`,
    title,
    topic: stringify(test.topic),
    instructions: stringify(test.instructions),
    questions: questions.map((question, questionIndex) => {
      const normalizedQuestion = normalizeQuestion(question, questionIndex);
      normalizedQuestion.id = getUniqueId(normalizedQuestion.id, usedQuestionIds);
      return normalizedQuestion;
    })
  };
}

function normalizeQuestion(question, index) {
  if (!question || typeof question !== "object") {
    throw new Error(`Question ${index + 1} must be an object.`);
  }

  const type = normalizeQuestionType(question.type);
  const prompt = stringify(question.prompt) || stringify(question.question);

  if (!prompt) {
    throw new Error(`Question ${index + 1} needs a prompt.`);
  }

  const options = getQuestionOptions(question, type);
  const { answerMode, language } = getAnswerSurface(question, type);

  return {
    id: stringify(question.id) || `q${index + 1}`,
    type,
    prompt,
    options,
    choices: options,
    details: getQuestionDetails(question),
    grading: getQuestionGrading(question),
    runnerTests: type === "code_run" ? getRunnerTests(question) : [],
    starterCode: stringify(question.starterCode || question.starter_code),
    answerMode,
    language,
    placeholder: stringify(question.placeholder)
  };
}

const ANSWER_MODES = ["text", "code", "both"];
// Languages that signal "no code answer" — used when a question sets language
// only for context/highlighting of a prose answer.
const NON_CODE_LANGUAGES = new Set(["", "text", "plain", "none", "prose"]);

// Decides which answer controls a question shows: a prose textarea ("text"), a
// code editor ("code"), or both ("both"). Explicit answerMode wins; otherwise a
// real programming language on a long_answer implies the candidate writes code
// alongside an explanation ("both"). code_run is always code; choice/short types
// keep "text" (the field is ignored for them but stays defined).
function getAnswerSurface(question, type) {
  const rawLanguage = stringify(question.language);
  const isCodeLanguage = !NON_CODE_LANGUAGES.has(rawLanguage.toLowerCase());

  const explicit = stringify(question.answerMode || question.answer_mode).toLowerCase();
  const explicitMode = ANSWER_MODES.includes(explicit) ? explicit : null;

  let answerMode;
  if (type === "code_run") {
    answerMode = "code";
  } else if (type !== "long_answer") {
    answerMode = "text";
  } else if (explicitMode) {
    answerMode = explicitMode;
  } else {
    answerMode = isCodeLanguage ? "both" : "text";
  }

  // A code-bearing answer needs a real language for the editor; fall back to
  // javascript when the question only declared a prose language (or none).
  const needsCode = answerMode === "code" || answerMode === "both";
  const language = isCodeLanguage ? rawLanguage : needsCode ? "javascript" : rawLanguage || "text";

  return { answerMode, language };
}

function normalizeQuestionType(type) {
  const normalizedType = stringify(type).replace(/-/g, "_");
  const candidate = TYPE_ALIASES[normalizedType] || normalizedType;

  return QUESTION_TYPES.includes(candidate) ? candidate : "long_answer";
}

function getQuestionOptions(question, type) {
  if (type === "true_false") {
    return ["True", "False"];
  }

  if (type !== "single_choice" && type !== "multiple_choice") {
    return [];
  }

  const rawOptions = Array.isArray(question.options)
    ? question.options
    : Array.isArray(question.choices)
      ? question.choices
      : [];

  return rawOptions.map(stringify).filter(Boolean);
}

// Runner tests drive the live code-execution feature. Each test is an
// expression string that is evaluated against the candidate's submitted code.
function getRunnerTests(question) {
  const rawTests = Array.isArray(question.tests) ? question.tests : [];

  return rawTests
    .map((test) => {
      if (!test || typeof test !== "object" || !stringify(test.call)) {
        return null;
      }

      const normalized = {
        name: stringify(test.name),
        call: stringify(test.call)
      };

      if (Object.prototype.hasOwnProperty.call(test, "expect")) {
        normalized.expect = test.expect;
      }

      if (Object.prototype.hasOwnProperty.call(test, "expectError")) {
        normalized.expectError = test.expectError;
      }

      return normalized;
    })
    .filter(Boolean);
}

function getQuestionDetails(question) {
  const details = [];

  addDetail(details, "Scenario", question.scenario);
  addDetail(details, "Task", question.task);
  addDetail(details, "Requirements", question.requirements, "list");
  addDetail(details, "Constraints", question.constraints, "list");
  addDetail(details, "Starter code", question.starterCode || question.starter_code, "code");
  addDetail(details, "Code to review", question.candidateCode || question.candidate_code || question.code, "code");
  addDetail(details, "Expected behavior", question.expectedBehavior || question.expected_behavior);
  addDetail(details, "Expected output", question.expectedOutput || question.expected_output, "code");
  addDetail(details, "Answer format", question.answerFormat || question.answer_format);
  addDetail(details, "Source", question.source);

  if (Array.isArray(question.details)) {
    for (const detail of question.details) {
      if (!detail || typeof detail !== "object") {
        continue;
      }
      addDetail(details, stringify(detail.label) || "Note", detail.value || detail.text || detail.items, stringify(detail.kind));
    }
  }

  return details;
}

function getQuestionGrading(question) {
  const grading = [];

  addDetail(grading, "Expected answer", question.expectedAnswer || question.expected_answer);
  addDetail(grading, "Rubric", question.rubric, "list");
  addDetail(grading, "Weak spots tested", question.weakSpots || question.weak_spots, "list");
  addDetail(grading, "Common mistakes", question.commonMistakes || question.common_mistakes, "list");
  addDetail(grading, "Red flags", question.redFlags || question.red_flags, "list");

  return grading;
}

function addDetail(details, label, value, kind = "text") {
  const normalizedValue = normalizeDetailValue(value);

  if (!normalizedValue) {
    return;
  }

  details.push({
    label,
    value: normalizedValue,
    kind: kind === "code" || kind === "list" ? kind : "text"
  });
}

function normalizeDetailValue(value) {
  if (Array.isArray(value)) {
    const items = value.map(stringify).filter(Boolean);
    return items.length > 0 ? items : null;
  }

  return stringify(value) || null;
}
