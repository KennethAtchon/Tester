// IO controllers: bridge the preload file API to the store + UI. Each load runs
// under a request id so a slow load that the user has already moved past cannot
// clobber newer state.

import { getState, getCurrentTest, loadLibrary } from "../state/store.js";
import { buildMarkdown } from "../domain/markdown.js";
import { slugify } from "../lib/util.js";
import { setStatus, startLoad, finishLoad, isCurrentLoad } from "../state/status.js";
import { render, renderExampleList, setExampleListError } from "../ui/view.js";

export async function loadJsonFromDisk() {
  await withLoad("Opening JSON file...", async (loadId) => {
    const result = await window.testFiles.openJson();
    if (!isCurrentLoad(loadId)) {
      return;
    }
    if (result.canceled) {
      setStatus("");
      return;
    }
    applyLibrary(result);
  });
}

export async function loadSampleJson() {
  await withLoad("Loading sample test library...", async (loadId) => {
    const result = await window.testFiles.openSample();
    if (isCurrentLoad(loadId)) {
      applyLibrary(result);
    }
  });
}

export async function loadExampleJson(fileName) {
  await withLoad(`Loading ${fileName}...`, async (loadId) => {
    const result = await window.testFiles.openExample(fileName);
    if (isCurrentLoad(loadId)) {
      applyLibrary(result);
    }
  });
}

export async function loadExamples() {
  try {
    renderExampleList(await window.testFiles.listExamples());
  } catch (error) {
    setExampleListError("No examples found.");
  }
}

export async function copyMarkdown() {
  try {
    await navigator.clipboard.writeText(currentMarkdown());
    setStatus("Markdown copied to the clipboard.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

export async function saveMarkdown() {
  const test = getCurrentTest();
  const defaultName = `${slugify(test.title) || "test-answers"}-answers.md`;

  try {
    const result = await window.testFiles.saveMarkdown({ defaultName, markdown: currentMarkdown() });
    if (result.canceled) {
      setStatus("");
      return;
    }
    setStatus(`Saved Markdown to ${result.filePath}.`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function applyLibrary(result) {
  const library = loadLibrary(JSON.parse(result.content), result.filePath);
  render();
  setStatus(`Loaded ${pluralizeTests(library.tests.length)} from ${result.filePath}.`);
}

function currentMarkdown() {
  const state = getState();
  const test = getCurrentTest();

  return buildMarkdown({
    library: state.library,
    test,
    answers: state.answers[test.id] ?? {},
    sourcePath: state.sourcePath,
    runResults: pickRunResults(test)
  });
}

function pickRunResults(test) {
  const results = {};
  for (const question of test.questions) {
    const key = `${test.id}:${question.id}`;
    if (getState().runResults[key]) {
      results[question.id] = getState().runResults[key];
    }
  }
  return results;
}

async function withLoad(message, work) {
  const loadId = startLoad(message);
  try {
    await work(loadId);
  } catch (error) {
    if (isCurrentLoad(loadId)) {
      setStatus(error.message, true);
    }
  } finally {
    finishLoad(loadId);
  }
}

function pluralizeTests(count) {
  return `${count} test${count === 1 ? "" : "s"}`;
}
