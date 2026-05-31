// Renderer-side code runner: builds the editor + "Run tests" UI for code_run
// questions and talks to the sandboxed harness over the preload bridge.

import { getAnswer, getRunResult, setRunResult } from "../state/store.js";

// Builds the full answer control for a code question: an editor, a run button,
// and a results panel that reflects the last sandboxed execution.
export function renderCodeControl(test, question, onAnswerChange) {
  const container = document.createElement("div");
  container.className = "code-runner";

  const editor = document.createElement("textarea");
  editor.className = "code-editor long-answer";
  editor.spellcheck = false;
  editor.value = getAnswer(test.id, question.id) ?? question.starterCode ?? "";
  editor.dataset.questionId = question.id;
  editor.placeholder = "Write your solution here";
  // Editor input is captured by the form-level delegated handler in ui.js, so
  // the editor itself only needs to expose its value to the run button below.

  const toolbar = document.createElement("div");
  toolbar.className = "code-runner-toolbar";

  const runButton = document.createElement("button");
  runButton.type = "button";
  runButton.className = "run-button";
  runButton.textContent = `Run ${question.runnerTests.length} test${question.runnerTests.length === 1 ? "" : "s"}`;

  const summary = document.createElement("span");
  summary.className = "run-summary";

  toolbar.append(runButton, summary);

  const results = document.createElement("div");
  results.className = "run-results";

  container.append(editor, toolbar, results);

  renderResult(results, summary, getRunResult(test.id, question.id));

  runButton.addEventListener("click", async () => {
    runButton.disabled = true;
    runButton.textContent = "Running…";
    summary.textContent = "";

    try {
      const result = await window.testFiles.runCode({
        code: editor.value,
        tests: question.runnerTests
      });
      setRunResult(test.id, question.id, result);
      renderResult(results, summary, result);
      onAnswerChange();
    } catch (error) {
      renderResult(results, summary, { compileError: error.message, results: [], logs: [] });
    } finally {
      runButton.disabled = false;
      runButton.textContent = `Run ${question.runnerTests.length} test${question.runnerTests.length === 1 ? "" : "s"}`;
    }
  });

  return container;
}

function renderResult(container, summary, result) {
  container.replaceChildren();

  if (!result) {
    summary.textContent = "Not run yet";
    summary.className = "run-summary";
    return;
  }

  if (result.compileError) {
    summary.textContent = "Error";
    summary.className = "run-summary fail";
    container.append(buildErrorBlock(result.compileError));
    appendLogs(container, result.logs);
    return;
  }

  const passed = result.results.filter((item) => item.passed).length;
  const total = result.results.length;
  summary.textContent = `${passed}/${total} passed`;
  summary.className = `run-summary ${passed === total ? "pass" : "fail"}`;

  for (const item of result.results) {
    container.append(buildTestRow(item));
  }

  appendLogs(container, result.logs);
}

function buildTestRow(item) {
  const row = document.createElement("div");
  row.className = `run-test ${item.passed ? "pass" : "fail"}`;

  const head = document.createElement("div");
  head.className = "run-test-head";
  head.textContent = `${item.passed ? "✅" : "❌"} ${item.name}`;
  row.append(head);

  if (!item.passed) {
    const detail = document.createElement("pre");
    detail.className = "run-test-detail";
    detail.textContent = item.error
      ? `threw: ${item.error}`
      : `expected: ${item.expected}\n     got: ${item.got}`;
    row.append(detail);
  }

  return row;
}

function buildErrorBlock(message) {
  const block = document.createElement("pre");
  block.className = "run-test-detail error";
  block.textContent = message;
  return block;
}

function appendLogs(container, logs) {
  if (!Array.isArray(logs) || logs.length === 0) {
    return;
  }

  const label = document.createElement("div");
  label.className = "run-logs-label";
  label.textContent = "Console output";

  const pre = document.createElement("pre");
  pre.className = "run-logs";
  pre.textContent = logs.join("\n");

  container.append(label, pre);
}
