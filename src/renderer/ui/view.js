// View layer: renders library/test/question DOM from store state. Holds no
// business logic — it reads derived state and calls back into actions wired by
// app.js for navigation and example loading.

import { formatExampleName, codeAnswerKey } from "../lib/util.js";
import {
  getState,
  getCurrentTest,
  getAnswer,
  setAnswer,
  toggleMultiAnswer,
  getAnsweredCount
} from "../state/store.js";
import { renderCodeControl } from "./runner.js";
import { mountCodeEditors } from "./codeEditor.js";

const elements = {
  librarySummary: document.querySelector("#librarySummary"),
  exampleList: document.querySelector("#exampleList"),
  testList: document.querySelector("#testList"),
  currentTopic: document.querySelector("#currentTopic"),
  currentTitle: document.querySelector("#currentTitle"),
  workspaceStats: document.querySelector("#workspaceStats"),
  copyMarkdownButton: document.querySelector("#copyMarkdownButton"),
  saveMarkdownButton: document.querySelector("#saveMarkdownButton"),
  emptyState: document.querySelector("#emptyState"),
  testForm: document.querySelector("#testForm")
};

const actions = {
  onSelectTest: () => {},
  onLoadExample: () => {}
};

export function initUI(handlers) {
  Object.assign(actions, handlers);
  elements.testForm.addEventListener("input", handleAnswerInput);
  elements.testForm.addEventListener("change", handleAnswerInput);
}

export function renderExampleList(examples) {
  elements.exampleList.replaceChildren();

  if (examples.length === 0) {
    elements.exampleList.textContent = "No examples found.";
    return;
  }

  for (const fileName of examples) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "example-button";
    button.textContent = formatExampleName(fileName);
    button.title = fileName;
    button.addEventListener("click", () => actions.onLoadExample(fileName));
    elements.exampleList.append(button);
  }
}

export function setExampleListError(message) {
  elements.exampleList.textContent = message;
}

export function render() {
  const state = getState();
  const hasLibrary = Boolean(state.library);
  const currentTest = getCurrentTest();

  elements.librarySummary.textContent = hasLibrary
    ? `${state.library.title} · ${pluralizeTests(state.library.tests.length)}`
    : "Load a JSON file to begin.";

  renderTestList();
  renderWorkspace(currentTest);
}

function renderTestList() {
  const state = getState();
  elements.testList.replaceChildren();

  if (!state.library) {
    return;
  }

  for (const test of state.library.tests) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `test-card${test.id === state.selectedTestId ? " active" : ""}`;
    button.setAttribute("aria-pressed", String(test.id === state.selectedTestId));
    button.addEventListener("click", () => actions.onSelectTest(test.id));

    const title = document.createElement("strong");
    title.textContent = test.title;

    const meta = document.createElement("span");
    meta.textContent = `${test.topic || "General"} · ${getAnsweredCount(test)}/${test.questions.length} answered`;

    button.append(title, meta);
    elements.testList.append(button);
  }
}

function renderWorkspace(test) {
  const hasTest = Boolean(test);

  elements.copyMarkdownButton.disabled = !hasTest;
  elements.saveMarkdownButton.disabled = !hasTest;
  elements.emptyState.hidden = hasTest;
  elements.testForm.hidden = !hasTest;
  elements.testForm.replaceChildren();
  elements.workspaceStats.replaceChildren();

  if (!test) {
    elements.currentTopic.textContent = "No test selected";
    elements.currentTitle.textContent = "Choose a test";
    elements.workspaceStats.hidden = true;
    return;
  }

  elements.currentTopic.textContent = test.topic || "General";
  elements.currentTitle.textContent = test.title;
  elements.workspaceStats.hidden = false;
  elements.workspaceStats.append(renderProgress(test));

  if (test.instructions) {
    const instructions = document.createElement("p");
    instructions.className = "instructions";
    instructions.textContent = test.instructions;
    elements.testForm.append(instructions);
  }

  test.questions.forEach((question, index) => {
    elements.testForm.append(renderQuestion(test, question, index));
  });

  // Textareas are now attached, so CM5 can take over the code answers.
  mountCodeEditors(elements.testForm, test);
}

function renderQuestion(test, question, index) {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "question";

  const header = document.createElement("div");
  header.className = "question-header";

  const number = document.createElement("div");
  number.className = "question-number";
  number.textContent = String(index + 1);

  const legend = document.createElement("legend");
  legend.className = "question-prompt";
  legend.textContent = question.prompt;

  header.append(number, legend);

  const help = document.createElement("p");
  help.className = "question-help";
  help.textContent = getQuestionHelp(question);

  fieldset.append(header, help);

  const details = renderQuestionDetails(question);
  if (details) {
    fieldset.append(details);
  }

  fieldset.append(renderAnswerControl(test, question));
  return fieldset;
}

function renderQuestionDetails(question) {
  if (!question.details || question.details.length === 0) {
    return null;
  }

  const container = document.createElement("div");
  container.className = "question-details";

  for (const detail of question.details) {
    container.append(renderQuestionDetail(question, detail));
  }

  return container;
}

function renderQuestionDetail(question, detail) {
  // Each detail is a native collapsible block: the label is the clickable
  // summary, the value its body. Open by default so nothing is hidden on load.
  const section = document.createElement("details");
  section.className = `question-detail ${detail.kind === "code" ? "code-detail" : ""}`;
  section.open = true;

  const label = document.createElement("summary");
  label.className = "question-detail-label";
  label.textContent = detail.label;
  section.append(label);

  if (detail.kind === "list" && Array.isArray(detail.value)) {
    const list = document.createElement("ul");
    list.className = "question-detail-list";

    for (const item of detail.value) {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      list.append(listItem);
    }

    section.append(list);
    return section;
  }

  if (detail.kind === "code") {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.className = `language-${question.language}`;
    code.textContent = Array.isArray(detail.value) ? detail.value.join("\n") : detail.value;
    pre.append(code);
    section.append(pre);
    return section;
  }

  const text = document.createElement("p");
  text.textContent = Array.isArray(detail.value) ? detail.value.join("\n") : detail.value;
  section.append(text);
  return section;
}

function renderAnswerControl(test, question) {
  if (question.type === "code_run") {
    return renderCodeControl(test, question, renderProgressOnly);
  }

  const answer = getAnswer(test.id, question.id) ?? (question.type === "multiple_choice" ? [] : "");

  if ((question.type === "single_choice" || question.type === "true_false") && question.options.length > 0) {
    return renderChoiceList(test, question, "radio", (option) => answer === option);
  }

  if (question.type === "multiple_choice" && question.options.length > 0) {
    const selected = Array.isArray(answer) ? answer : [];
    return renderChoiceList(test, question, "checkbox", (option) => selected.includes(option));
  }

  if (question.type === "short_answer") {
    const input = document.createElement("input");
    input.type = "text";
    input.value = answer;
    input.dataset.questionId = question.id;
    input.placeholder = "Type your answer";
    return input;
  }

  return renderLongAnswer(test, question);
}

// Long-answer questions render one of three surfaces based on answerMode:
// a prose textarea, a code editor, or both stacked together.
function renderLongAnswer(test, question) {
  if (question.answerMode === "code") {
    return buildCodeTextarea(test, question, question.id, question.placeholder || "Write your code");
  }

  if (question.answerMode === "both") {
    const container = document.createElement("div");
    container.className = "answer-stack";
    container.append(
      labelled("Explanation", buildProseTextarea(test, question, question.id, question.placeholder || "Explain your answer")),
      labelled("Code", buildCodeTextarea(test, question, codeAnswerKey(question.id), "Write your code"))
    );
    return container;
  }

  // Default: plain prose textarea.
  return buildProseTextarea(test, question, question.id, question.placeholder || "Write your answer");
}

function buildProseTextarea(test, question, answerId, placeholder) {
  const textarea = document.createElement("textarea");
  textarea.value = getAnswer(test.id, answerId) ?? "";
  textarea.dataset.questionId = answerId;
  textarea.placeholder = placeholder;
  textarea.className = "long-answer";
  return textarea;
}

// A textarea tagged for the CM5 upgrade (mountCodeEditors picks up
// data-code-editor after the DOM is attached). Seeds starter code when empty.
function buildCodeTextarea(test, question, answerId, placeholder) {
  const textarea = document.createElement("textarea");
  textarea.value = getAnswer(test.id, answerId) ?? question.starterCode ?? "";
  textarea.dataset.questionId = answerId;
  textarea.dataset.codeEditor = question.language || "javascript";
  // Flags the editor for a free-form Run button (executes as JS, shows console
  // output). code_run editors are excluded — they have their own test runner.
  textarea.dataset.run = "free";
  textarea.placeholder = placeholder;
  textarea.className = "long-answer code-editor";
  textarea.spellcheck = false;
  return textarea;
}

function labelled(text, control) {
  const wrap = document.createElement("div");
  wrap.className = "answer-field";
  const label = document.createElement("span");
  label.className = "answer-field-label";
  label.textContent = text;
  wrap.append(label, control);
  return wrap;
}

function renderChoiceList(test, question, inputType, isChecked) {
  const list = document.createElement("div");
  list.className = "choice-list";

  question.options.forEach((option) => {
    const label = document.createElement("label");
    label.className = "choice";

    const input = document.createElement("input");
    input.type = inputType;
    input.name = `${test.id}-${question.id}`;
    input.value = option;
    input.dataset.questionId = question.id;
    input.checked = isChecked(option);

    const text = document.createElement("span");
    text.textContent = option;

    label.append(input, text);
    list.append(label);
  });

  return list;
}

function handleAnswerInput(event) {
  const questionId = event.target.dataset.questionId;
  const test = getCurrentTest();

  if (!questionId || !test) {
    return;
  }

  if (event.target.type === "checkbox") {
    toggleMultiAnswer(test.id, questionId, event.target.value, event.target.checked);
  } else {
    setAnswer(test.id, questionId, event.target.value);
  }

  renderProgressOnly();
}

function renderProgress(test) {
  const answeredCount = getAnsweredCount(test);
  const percentage = test.questions.length > 0 ? Math.round((answeredCount / test.questions.length) * 100) : 0;

  const container = document.createElement("div");
  container.className = "progress-card";

  const label = document.createElement("span");
  label.textContent = `${answeredCount} of ${test.questions.length} answered`;

  const meter = document.createElement("span");
  meter.className = "progress-meter";
  meter.setAttribute("aria-hidden", "true");
  meter.style.setProperty("--progress", `${percentage}%`);

  container.append(label, meter);
  return container;
}

function renderProgressOnly() {
  const test = getCurrentTest();

  if (!test) {
    return;
  }

  elements.workspaceStats.replaceChildren(renderProgress(test));
  renderTestList();
}

function getQuestionHelp(question) {
  if (question.type === "single_choice" && question.options.length > 0) {
    return "Choose one answer.";
  }

  if (question.type === "multiple_choice" && question.options.length > 0) {
    return "Select all that apply.";
  }

  if (question.type === "true_false") {
    return "Choose true or false.";
  }

  if (question.type === "code_run") {
    return "Write code, then run the tests to check it.";
  }

  if (question.type === "short_answer") {
    return question.placeholder || "Short answer.";
  }

  return question.placeholder || "Long answer.";
}

function pluralizeTests(count) {
  return `${count} test${count === 1 ? "" : "s"}`;
}
