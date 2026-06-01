// Single source of truth for renderer state plus the mutations that touch it.
// Keeping state changes here (instead of scattered across the UI) means the UI
// layer only reads derived values and never reaches into raw state shape.

import { isAnswered } from "../lib/util.js";
import { normalizeLibrary } from "../domain/normalize.js";

const state = {
  library: null,
  sourcePath: "",
  selectedTestId: "",
  answers: {},
  // Last code-run result per `${testId}:${questionId}`, for inline display and export.
  runResults: {},
  // Chosen editor language per `${testId}:${questionId}`; overrides the question
  // default so a picked syntax mode survives navigation. Highlighting only.
  editorLangs: {}
};

export function getState() {
  return state;
}

export function loadLibrary(candidate, sourcePath) {
  const library = normalizeLibrary(candidate);

  state.library = library;
  state.sourcePath = sourcePath;
  state.selectedTestId = library.tests[0]?.id ?? "";
  state.answers = {};
  state.runResults = {};
  state.editorLangs = {};

  for (const test of library.tests) {
    state.answers[test.id] = {};

    // Seed code questions with their starter code so candidates edit, not retype.
    for (const question of test.questions) {
      if (question.type === "code_run" && question.starterCode) {
        state.answers[test.id][question.id] = question.starterCode;
      }
    }
  }

  return library;
}

export function getCurrentTest() {
  return state.library?.tests.find((test) => test.id === state.selectedTestId) ?? null;
}

export function selectTest(testId) {
  state.selectedTestId = testId;
}

export function getAnswer(testId, questionId) {
  return state.answers[testId]?.[questionId];
}

export function setAnswer(testId, questionId, value) {
  if (!state.answers[testId]) {
    state.answers[testId] = {};
  }
  state.answers[testId][questionId] = value;
}

export function toggleMultiAnswer(testId, questionId, value, checked) {
  const current = getAnswer(testId, questionId);
  const selected = Array.isArray(current) ? [...current] : [];
  const index = selected.indexOf(value);

  if (checked && index < 0) {
    selected.push(value);
  } else if (!checked && index >= 0) {
    selected.splice(index, 1);
  }

  setAnswer(testId, questionId, selected);
}

export function getRunResult(testId, questionId) {
  return state.runResults[`${testId}:${questionId}`] ?? null;
}

export function setRunResult(testId, questionId, result) {
  state.runResults[`${testId}:${questionId}`] = result;
}

export function getEditorLang(testId, questionId, fallback) {
  return state.editorLangs[`${testId}:${questionId}`] ?? fallback;
}

export function setEditorLang(testId, questionId, language) {
  state.editorLangs[`${testId}:${questionId}`] = language;
}

export function getAnsweredCount(test) {
  const answers = state.answers[test.id] ?? {};
  return test.questions.filter((question) => isAnswered(answers[question.id])).length;
}
