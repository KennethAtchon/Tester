// Renderer-side code runner: builds the editor + "Run tests" UI for code_run
// questions and talks to the sandboxed harness over the preload bridge. Used
// by both the practice session and the mock exam, so it takes its state in
// and reports results out instead of reading a store.

// Builds the full answer control for a code question: an editor, a run button,
// and a results panel that reflects the last sandboxed execution. The returned
// element exposes runTests() so a caller can run them on submit.
export function renderCodeControl({ answerId, initialCode = "", language = "javascript", tests = [], lastResult = null, onResult = () => {} }) {
  const container = document.createElement("div");
  container.className = "code-runner";

  const editor = document.createElement("textarea");
  editor.className = "code-editor long-answer";
  editor.spellcheck = false;
  editor.value = initialCode;
  editor.dataset.questionId = answerId;
  // Tag for the CM5 upgrade applied after render; the sandbox runs JS, so
  // default to javascript when the question omits an explicit language.
  editor.dataset.codeEditor = language || "javascript";
  editor.placeholder = "Write your solution here";
  // Editor input bubbles to the caller's delegated "input" listener, so the
  // editor itself only needs to expose its value to the run button below.

  const toolbar = document.createElement("div");
  toolbar.className = "code-runner-toolbar";

  const label = `Run ${tests.length} test${tests.length === 1 ? "" : "s"}`;
  const runButton = document.createElement("button");
  runButton.type = "button";
  runButton.className = "run-button";
  runButton.textContent = label;

  const summary = document.createElement("span");
  summary.className = "run-summary";

  toolbar.append(runButton, summary);

  const results = document.createElement("div");
  results.className = "run-results";

  container.append(editor, toolbar, results);

  renderResult(results, summary, lastResult);

  const runTests = async () => {
    runButton.disabled = true;
    runButton.textContent = "Running…";
    summary.textContent = "";
    let result;
    try {
      result = await window.testFiles.runCode({ code: editor.value, tests });
    } catch (error) {
      result = { compileError: error.message, results: [], logs: [] };
    } finally {
      runButton.disabled = false;
      runButton.textContent = label;
    }
    renderResult(results, summary, result);
    onResult(result);
    return result;
  };

  runButton.addEventListener("click", runTests);
  container.runTests = runTests;

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
