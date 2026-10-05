// Mock exam: the full-length test form for AI review (the app's original
// workflow). Sit a whole test, optionally rate confidence per question, then
// copy or save a Markdown review request. Doesn't touch the review schedule.

import { h } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { button, pageHead, emptyState, meter } from "../components.js";
import { codeAnswerKey, slugify } from "../../lib/util.js";
import { catalog } from "../../state/catalog.js";
import { progress } from "../../state/progress.js";
import {
  getState,
  getCurrentTest,
  loadLibrary,
  selectTest,
  getAnswer,
  setAnswer,
  toggleMultiAnswer,
  getAnsweredCount,
  isQuestionAnswered,
  getRunResult,
  setRunResult,
  getConfidence,
  setConfidence
} from "../../state/store.js";
import { buildMarkdown } from "../../domain/markdown.js";
import { CONFIDENCE_LEVELS } from "../../domain/grading.js";
import { renderCodeControl } from "../runner.js";
import { mountCodeEditors } from "../codeEditor.js";
import { navigate } from "../router.js";
import { copyText, saveMarkdownFile } from "../../io/io.js";

export function renderExam(root, [libKey, testId] = []) {
  const page = h("div", { class: "page page-wide" });
  root.append(page);

  const libraries = catalog().libraries;
  if (libraries.length === 0) {
    page.append(pageHead({ eyebrow: "Mock exam", title: "Mock exam" }), emptyState({ iconName: "exam", title: "No libraries yet", body: "Add a library on the Skill map, then sit any of its tests here as a full-length exam.", actions: [button("Skill map", { variant: "primary", onClick: () => navigate("map") })] }));
    return;
  }

  const state = getState();
  const library = libraries.find((entry) => entry.key === libKey) || libraries.find((entry) => entry.key === state.libKey) || libraries[0];
  if (state.libKey !== library.key || !state.library) {
    loadLibrary(progress().libraries[library.key].raw, library.sourcePath, library.key);
  }
  if (testId && state.library.tests.some((test) => test.id === testId)) {
    selectTest(testId);
  }

  const test = getCurrentTest();
  const form = h("form", { class: "paper", onSubmit: (event) => event.preventDefault() });
  const nav = h("nav", { class: "qnav", "aria-label": "Questions" });
  const progressLine = h("div", { class: "exam-progress" });
  const tabs = h("div", { class: "exam-tabs", role: "tablist", "aria-label": "Tests" });

  const markdown = () =>
    buildMarkdown({
      library: getState().library,
      test,
      answers: getState().answers[test.id] ?? {},
      sourcePath: getState().sourcePath,
      runResults: pickRunResults(test),
      confidence: Object.fromEntries(test.questions.map((question) => [question.id, getConfidence(test.id, question.id)]).filter(([, level]) => level))
    });

  page.append(
    pageHead({
      eyebrow: `Mock exam · ${library.title}`,
      title: test.title,
      sub: test.topic || null,
      actions: [
        button("Copy Markdown", { iconName: "copy", onClick: () => copyText(markdown(), "Markdown copied — paste it to an AI reviewer.") }),
        button("Save Markdown", {
          variant: "primary",
          iconName: "download",
          onClick: () => saveMarkdownFile({ defaultName: `${slugify(test.title) || "test-answers"}-answers.md`, tent: getState().library?.tent ?? null, markdown: markdown() })
        })
      ]
    }),
    h(
      "div",
      { class: "exam-bar" },
      libraries.length > 1 &&
        h(
          "select",
          {
            class: "input input-sm",
            "aria-label": "Library",
            onChange: (event) => navigate("exam", event.target.value)
          },
          libraries.map((entry) => h("option", { value: entry.key, selected: entry.key === library.key, text: entry.title }))
        ),
      tabs,
      progressLine
    ),
    h("div", { class: "callout callout-muted" }, icon("exam", { size: 18 }), h("div", null, h("strong", { text: "Full-length practice for AI review. " }), "Answers here don't change your review schedule. Rate your confidence where you like — it's included in the export so the reviewer can flag confident mistakes.")),
    h("div", { class: "exam-layout" }, nav, form)
  );

  const refreshCounts = () => {
    tabs.replaceChildren(
      ...getState().library.tests.map((entry) =>
        h(
          "button",
          {
            type: "button",
            role: "tab",
            "aria-selected": String(entry.id === test.id),
            class: ["exam-tab", entry.id === test.id && "is-active"],
            onClick: () => navigate("exam", library.key, entry.id)
          },
          h("span", { text: entry.title }),
          h("span", { class: "exam-tab-count", text: `${getAnsweredCount(entry)}/${entry.questions.length}` })
        )
      )
    );
    const answered = getAnsweredCount(test);
    progressLine.replaceChildren(meter(answered / test.questions.length, { label: "Answered" }), h("span", { class: "num", text: `${answered} of ${test.questions.length} answered` }));
    nav.replaceChildren(
      ...test.questions.map((question, index) =>
        h("a", {
          class: ["qnav-dot", isQuestionAnswered(test, question) && "is-answered"],
          href: `#q-${index + 1}`,
          text: String(index + 1),
          title: question.prompt,
          onClick: (event) => {
            event.preventDefault();
            form.querySelector(`#q-${index + 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        })
      )
    );
  };

  const onInput = (event) => {
    const questionId = event.target.dataset.questionId;
    if (!questionId) {
      return;
    }
    if (event.target.type === "checkbox") {
      toggleMultiAnswer(test.id, questionId, event.target.value, event.target.checked);
    } else {
      setAnswer(test.id, questionId, event.target.value);
    }
    refreshCounts();
  };
  form.addEventListener("input", onInput);
  form.addEventListener("change", onInput);

  if (test.instructions) {
    form.append(h("p", { class: "paper-instructions", text: test.instructions }));
  }
  test.questions.forEach((question, index) => form.append(renderQuestion(test, question, index, refreshCounts)));

  refreshCounts();
  // Textareas are attached now, so CM5 can take over the code answers.
  mountCodeEditors(form, test.id);
}

function renderQuestion(test, question, index, onChange) {
  const details = question.details?.length
    ? h(
        "div",
        { class: "context" },
        question.details.map((detail) =>
          h(
            "details",
            { class: ["context-block", detail.kind === "code" && "is-code"], open: true },
            h("summary", { text: detail.label }),
            detail.kind === "list" && Array.isArray(detail.value)
              ? h("ul", null, detail.value.map((value) => h("li", { text: value })))
              : detail.kind === "code"
                ? h("pre", null, h("code", { class: `language-${question.language}`, text: Array.isArray(detail.value) ? detail.value.join("\n") : detail.value }))
                : h("p", { text: Array.isArray(detail.value) ? detail.value.join("\n") : detail.value })
          )
        )
      )
    : null;

  return h(
    "fieldset",
    { class: "exam-question", id: `q-${index + 1}` },
    h("legend", { class: "exam-q-head" }, h("span", { class: "exam-q-num", text: String(index + 1) }), h("span", { class: "exam-q-prompt", text: question.prompt })),
    h("p", { class: "exam-q-help", text: getQuestionHelp(question) }),
    details,
    renderAnswerControl(test, question, onChange),
    confidenceChips(test, question)
  );
}

function confidenceChips(test, question) {
  const current = getConfidence(test.id, question.id);
  const group = h("div", { class: "exam-conf", role: "radiogroup", "aria-label": "Confidence" }, h("span", { class: "exam-conf-label", text: "Confidence" }));
  for (const level of CONFIDENCE_LEVELS) {
    group.append(
      h("button", {
        type: "button",
        role: "radio",
        "aria-checked": String(current === level.value),
        class: ["exam-conf-chip", current === level.value && "is-selected"],
        text: level.label,
        onClick: (event) => {
          const next = getConfidence(test.id, question.id) === level.value ? null : level.value;
          setConfidence(test.id, question.id, next);
          for (const chipButton of group.querySelectorAll(".exam-conf-chip")) {
            const selected = chipButton === event.currentTarget && next != null;
            chipButton.classList.toggle("is-selected", selected);
            chipButton.setAttribute("aria-checked", String(selected));
          }
        }
      })
    );
  }
  return group;
}

function renderAnswerControl(test, question, onChange) {
  if (question.type === "code_run") {
    return renderCodeControl({
      answerId: question.id,
      initialCode: getAnswer(test.id, question.id) ?? question.starterCode ?? "",
      language: question.language,
      tests: question.runnerTests,
      lastResult: getRunResult(test.id, question.id),
      onResult: (result) => {
        setRunResult(test.id, question.id, result);
        onChange();
      }
    });
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
    return h("input", { type: "text", class: "input", value: answer, placeholder: "Type your answer", dataset: { questionId: question.id } });
  }

  return renderLongAnswer(test, question);
}

// Long-answer questions render a prose textarea, a code editor, or both.
function renderLongAnswer(test, question) {
  if (question.answerMode === "code") {
    return buildCodeTextarea(test, question, question.id, question.placeholder || "Write your code");
  }
  if (question.answerMode === "both") {
    return h(
      "div",
      { class: "answer-stack" },
      h("label", { class: "field-label", text: "Explanation" }),
      buildProseTextarea(test, question.id, question.placeholder || "Explain your answer"),
      h("label", { class: "field-label", text: "Code" }),
      buildCodeTextarea(test, question, codeAnswerKey(question.id), "Write your code")
    );
  }
  return buildProseTextarea(test, question.id, question.placeholder || "Write your answer");
}

function buildProseTextarea(test, answerId, placeholder) {
  return h("textarea", { class: "input answer-text", rows: 6, value: getAnswer(test.id, answerId) ?? "", placeholder, dataset: { questionId: answerId } });
}

// A textarea tagged for the CM5 upgrade, with a free-form Run button
// (code_run questions have their own test runner instead).
function buildCodeTextarea(test, question, answerId, placeholder) {
  return h("textarea", {
    class: "long-answer code-editor",
    spellcheck: "false",
    value: getAnswer(test.id, answerId) ?? question.starterCode ?? "",
    placeholder,
    dataset: { questionId: answerId, codeEditor: question.language || "javascript", run: "free" }
  });
}

function renderChoiceList(test, question, inputType, isChecked) {
  return h(
    "div",
    { class: "exam-choices" },
    question.options.map((option) =>
      h(
        "label",
        { class: "exam-choice" },
        h("input", { type: inputType, name: `${test.id}-${question.id}`, value: option, checked: isChecked(option), dataset: { questionId: question.id } }),
        h("span", { text: option })
      )
    )
  );
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

function pickRunResults(test) {
  const results = {};
  for (const question of test.questions) {
    const result = getRunResult(test.id, question.id);
    if (result) {
      results[question.id] = result;
    }
  }
  return results;
}
