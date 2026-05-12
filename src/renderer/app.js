const state = {
  library: null,
  sourcePath: "",
  selectedTestId: "",
  answers: {},
  theme: getInitialTheme(),
  loadRequestId: 0,
  isLoading: false
};

const elements = {
  librarySummary: document.querySelector("#librarySummary"),
  themeToggleButton: document.querySelector("#themeToggleButton"),
  themeToggleLabel: document.querySelector("#themeToggleLabel"),
  loadJsonButton: document.querySelector("#loadJsonButton"),
  loadSampleButton: document.querySelector("#loadSampleButton"),
  exampleList: document.querySelector("#exampleList"),
  testList: document.querySelector("#testList"),
  currentTopic: document.querySelector("#currentTopic"),
  currentTitle: document.querySelector("#currentTitle"),
  workspaceStats: document.querySelector("#workspaceStats"),
  copyMarkdownButton: document.querySelector("#copyMarkdownButton"),
  saveMarkdownButton: document.querySelector("#saveMarkdownButton"),
  statusMessage: document.querySelector("#statusMessage"),
  emptyState: document.querySelector("#emptyState"),
  testForm: document.querySelector("#testForm")
};

elements.themeToggleButton.addEventListener("click", toggleTheme);
elements.loadJsonButton.addEventListener("click", loadJsonFromDisk);
elements.loadSampleButton.addEventListener("click", loadSampleJson);
elements.copyMarkdownButton.addEventListener("click", copyMarkdown);
elements.saveMarkdownButton.addEventListener("click", saveMarkdown);
elements.testForm.addEventListener("input", handleAnswerInput);
elements.testForm.addEventListener("change", handleAnswerInput);

loadExamples();

async function loadJsonFromDisk() {
  const loadId = startLoad("Opening JSON file...");

  try {
    const result = await window.testFiles.openJson();

    if (!isCurrentLoad(loadId)) {
      return;
    }

    if (result.canceled) {
      setStatus("");
      return;
    }

    loadLibrary(JSON.parse(result.content), result.filePath);
  } catch (error) {
    if (isCurrentLoad(loadId)) {
      setStatus(error.message, true);
    }
  } finally {
    finishLoad(loadId);
  }
}

async function loadSampleJson() {
  const loadId = startLoad("Loading sample test library...");

  try {
    const result = await window.testFiles.openSample();
    if (!isCurrentLoad(loadId)) {
      return;
    }

    loadLibrary(JSON.parse(result.content), result.filePath);
  } catch (error) {
    if (isCurrentLoad(loadId)) {
      setStatus(error.message, true);
    }
  } finally {
    finishLoad(loadId);
  }
}

async function loadExamples() {
  try {
    const examples = await window.testFiles.listExamples();
    renderExampleList(examples);
  } catch (error) {
    elements.exampleList.textContent = "No examples found.";
  }
}

async function loadExampleJson(fileName) {
  const loadId = startLoad(`Loading ${fileName}...`);

  try {
    const result = await window.testFiles.openExample(fileName);
    if (!isCurrentLoad(loadId)) {
      return;
    }

    loadLibrary(JSON.parse(result.content), result.filePath);
  } catch (error) {
    if (isCurrentLoad(loadId)) {
      setStatus(error.message, true);
    }
  } finally {
    finishLoad(loadId);
  }
}

function renderExampleList(examples) {
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
    button.addEventListener("click", () => loadExampleJson(fileName));

    elements.exampleList.append(button);
  }

  setLoadingState(state.isLoading);
}

function loadLibrary(candidate, sourcePath) {
  const library = normalizeLibrary(candidate);

  state.library = library;
  state.sourcePath = sourcePath;
  state.selectedTestId = library.tests[0]?.id ?? "";
  state.answers = {};

  for (const test of library.tests) {
    state.answers[test.id] = {};
  }

  render();
  setStatus(`Loaded ${library.tests.length} test${library.tests.length === 1 ? "" : "s"} from ${sourcePath}.`);
}

function normalizeLibrary(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("The JSON file must contain an object.");
  }

  const rawTests = Array.isArray(candidate.tests) ? candidate.tests : Array.isArray(candidate) ? candidate : null;

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

  return {
    id: stringify(question.id) || `q${index + 1}`,
    type,
    prompt,
    options,
    choices: options
  };
}

function normalizeQuestionType(type) {
  const normalizedType = stringify(type).replace(/-/g, "_");
  const aliases = {
    choice: "single_choice",
    multiple: "multiple_choice",
    select_all: "multiple_choice",
    truefalse: "true_false",
    short: "short_answer",
    long: "long_answer"
  };
  const candidate = aliases[normalizedType] || normalizedType;

  return ["short_answer", "long_answer", "single_choice", "multiple_choice", "true_false"].includes(candidate)
    ? candidate
    : "long_answer";
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

function render() {
  const hasLibrary = Boolean(state.library);
  const currentTest = getCurrentTest();

  elements.librarySummary.textContent = hasLibrary
    ? `${state.library.title} · ${state.library.tests.length} test${state.library.tests.length === 1 ? "" : "s"}`
    : "Load a JSON file to begin.";

  renderTestList();
  renderWorkspace(currentTest);
  renderTheme();
}

function renderTestList() {
  elements.testList.replaceChildren();

  if (!state.library) {
    return;
  }

  for (const test of state.library.tests) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `test-card${test.id === state.selectedTestId ? " active" : ""}`;
    button.setAttribute("aria-pressed", String(test.id === state.selectedTestId));
    button.addEventListener("click", () => selectTest(test.id));

    const title = document.createElement("strong");
    title.textContent = test.title;

    const meta = document.createElement("span");
    const answeredCount = getAnsweredCount(test);
    meta.textContent = `${test.topic || "General"} · ${answeredCount}/${test.questions.length} answered`;

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

  fieldset.append(header, help, renderAnswerControl(test, question));

  return fieldset;
}

function renderAnswerControl(test, question) {
  const answer = state.answers[test.id]?.[question.id] ?? (question.type === "multiple_choice" ? [] : "");

  if ((question.type === "single_choice" || question.type === "true_false") && question.options.length > 0) {
    const list = document.createElement("div");
    list.className = "choice-list";

    question.options.forEach((option) => {
      const label = document.createElement("label");
      label.className = "choice";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `${test.id}-${question.id}`;
      input.value = option;
      input.dataset.questionId = question.id;
      input.checked = answer === option;

      const text = document.createElement("span");
      text.textContent = option;

      label.append(input, text);
      list.append(label);
    });

    return list;
  }

  if (question.type === "multiple_choice" && question.options.length > 0) {
    const list = document.createElement("div");
    list.className = "choice-list";
    const selectedAnswers = Array.isArray(answer) ? answer : [];

    question.options.forEach((option) => {
      const label = document.createElement("label");
      label.className = "choice";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = `${test.id}-${question.id}`;
      input.value = option;
      input.dataset.questionId = question.id;
      input.checked = selectedAnswers.includes(option);

      const text = document.createElement("span");
      text.textContent = option;

      label.append(input, text);
      list.append(label);
    });

    return list;
  }

  if (question.type === "short_answer") {
    const input = document.createElement("input");
    input.type = "text";
    input.value = answer;
    input.dataset.questionId = question.id;
    input.placeholder = "Type your answer";
    return input;
  }

  const textarea = document.createElement("textarea");
  textarea.value = answer;
  textarea.dataset.questionId = question.id;
  textarea.placeholder = "Write your answer";
  textarea.className = "long-answer";
  return textarea;
}

function handleAnswerInput(event) {
  const questionId = event.target.dataset.questionId;

  if (!questionId || !state.selectedTestId) {
    return;
  }

  if (event.target.type === "checkbox") {
    const currentAnswer = state.answers[state.selectedTestId][questionId];
    const selectedAnswers = Array.isArray(currentAnswer) ? [...currentAnswer] : [];

    if (event.target.checked && !selectedAnswers.includes(event.target.value)) {
      selectedAnswers.push(event.target.value);
    }

    if (!event.target.checked) {
      const index = selectedAnswers.indexOf(event.target.value);
      if (index >= 0) {
        selectedAnswers.splice(index, 1);
      }
    }

    state.answers[state.selectedTestId][questionId] = selectedAnswers;
  } else {
    state.answers[state.selectedTestId][questionId] = event.target.value;
  }

  renderProgressOnly();
}

function selectTest(testId) {
  state.selectedTestId = testId;
  render();
  setStatus("");
}

function setStatus(message, isError = false) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.classList.toggle("error", isError);
}

function startLoad(message) {
  state.loadRequestId += 1;
  state.isLoading = true;
  setLoadingState(true);
  setStatus(message);
  return state.loadRequestId;
}

function finishLoad(loadId) {
  if (!isCurrentLoad(loadId)) {
    return;
  }

  state.isLoading = false;
  setLoadingState(false);
}

function isCurrentLoad(loadId) {
  return loadId === state.loadRequestId;
}

function setLoadingState(isLoading) {
  elements.loadJsonButton.disabled = isLoading;
  elements.loadSampleButton.disabled = isLoading;

  for (const button of elements.exampleList.querySelectorAll("button")) {
    button.disabled = isLoading;
  }
}

async function copyMarkdown() {
  const markdown = buildMarkdown();

  try {
    await navigator.clipboard.writeText(markdown);
    setStatus("Markdown copied to the clipboard.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function saveMarkdown() {
  const test = getCurrentTest();
  const markdown = buildMarkdown();
  const defaultName = `${slugify(test.title) || "test-answers"}-answers.md`;

  try {
    const result = await window.testFiles.saveMarkdown({ defaultName, markdown });

    if (result.canceled) {
      setStatus("");
      return;
    }

    setStatus(`Saved Markdown to ${result.filePath}.`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function buildMarkdown() {
  const test = getCurrentTest();
  const answers = state.answers[test.id] ?? {};
  const answeredCount = test.questions.filter((question) => isAnswered(answers[question.id])).length;
  const now = new Date().toLocaleString();

  const lines = [
    `# ${test.title} Answers`,
    "",
    "## Review Request",
    "",
    "Please grade these answers, explain what is correct or incorrect, and create a results Markdown file with suggested improvements.",
    "",
    "## Test Metadata",
    "",
    `- Library: ${state.library.title}`,
    `- Source: ${state.sourcePath || "Unknown"}`,
    `- Topic: ${test.topic || "General"}`,
    `- Questions answered: ${answeredCount} of ${test.questions.length}`,
    `- Exported: ${now}`,
    ""
  ];

  if (test.instructions) {
    lines.push("## Instructions", "", test.instructions, "");
  }

  lines.push("## Answers", "");

  test.questions.forEach((question, index) => {
    const answer = formatAnswerForMarkdown(answers[question.id]);

    lines.push(`### ${index + 1}. ${question.prompt}`, "", `**Question type:** ${question.type}`, "", answer, "");
  });

  return lines.join("\n");
}

function getCurrentTest() {
  return state.library?.tests.find((test) => test.id === state.selectedTestId) ?? null;
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

  if (question.type === "short_answer") {
    return "Short answer.";
  }

  return "Long answer.";
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

function getAnsweredCount(test) {
  const answers = state.answers[test.id] ?? {};
  return test.questions.filter((question) => isAnswered(answers[question.id])).length;
}

function isAnswered(answer) {
  return Array.isArray(answer) ? answer.length > 0 : Boolean(stringify(answer));
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem("test-form-maker-theme", state.theme);
  renderTheme();
}

function renderTheme() {
  document.documentElement.dataset.theme = state.theme;
  elements.themeToggleButton.setAttribute("aria-pressed", String(state.theme === "dark"));
  elements.themeToggleButton.setAttribute("aria-label", `Switch to ${state.theme === "dark" ? "light" : "dark"} mode`);
  elements.themeToggleLabel.textContent = state.theme === "dark" ? "Dark mode" : "Light mode";
}

function getInitialTheme() {
  const savedTheme = localStorage.getItem("test-form-maker-theme");

  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function stringify(value) {
  return typeof value === "string" ? value.trim() : "";
}

function formatAnswerForMarkdown(answer) {
  if (Array.isArray(answer)) {
    return answer.length > 0 ? answer.map((item) => `- ${item}`).join("\n") : "_No answer provided._";
  }

  return stringify(answer) || "_No answer provided._";
}

function slugify(value) {
  return stringify(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatExampleName(fileName) {
  return fileName
    .replace(/\.json$/i, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getUniqueId(id, usedIds) {
  const baseId = id || "item";
  let candidate = baseId;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

render();
