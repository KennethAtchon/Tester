// Mock-exam state: the library being sat, answers, code-run results, and
// self-rated confidence. Kept in memory only — the exam is for full-length
// practice and AI review, and doesn't touch the spaced-repetition schedule.

import { isAnswered, codeAnswerKey } from "../lib/util.js";
import { normalizeLibrary } from "../domain/normalize.js";

const state = {
  library: null,
  libKey: "",
  sourcePath: "",
  selectedTestId: "",
  answers: {},
  // Last code-run result per `${testId}:${questionId}`, for inline display and export.
  runResults: {},
  // Chosen editor language per `${testId}:${questionId}`; overrides the question
  // default so a picked syntax mode survives navigation. Highlighting only.
  editorLangs: {},
  // Self-rated confidence (1–4) per `${testId}:${questionId}`, exported so the
  // AI reviewer can comment on calibration.
  confidence: {}
};

export function getState() {
  return state;
}

export function loadLibrary(candidate, sourcePath, libKey = "") {
  const library = normalizeLibrary(candidate);

  state.library = library;
  state.libKey = libKey;
  state.sourcePath = sourcePath;
  state.selectedTestId = library.tests[0]?.id ?? "";
  state.answers = {};
  state.runResults = {};
  state.editorLangs = {};
  state.confidence = {};

  for (const test of library.tests) {
    state.answers[test.id] = {};

    // Seed code questions with their starter code so candidates edit, not retype.
    // The code answer lives under the bare id for code-only questions and under
    // the derived code key for "both" questions.
    for (const question of test.questions) {
      if (!question.starterCode) {
        continue;
      }
      if (question.type === "code_run" || question.answerMode === "code") {
        state.answers[test.id][question.id] = question.starterCode;
      } else if (question.answerMode === "both") {
        state.answers[test.id][codeAnswerKey(question.id)] = question.starterCode;
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

export function getConfidence(testId, questionId) {
  return state.confidence[`${testId}:${questionId}`] ?? null;
}

export function setConfidence(testId, questionId, level) {
  state.confidence[`${testId}:${questionId}`] = level;
}

export function isQuestionAnswered(test, question) {
  const answers = state.answers[test.id] ?? {};
  if (question.answerMode === "both") {
    return isAnswered(answers[question.id]) || isAnswered(answers[codeAnswerKey(question.id)]);
  }
  return isAnswered(answers[question.id]);
}

export function getAnsweredCount(test) {
  return test.questions.filter((question) => isQuestionAnswered(test, question)).length;
}
