// Entry point: wires DOM controls to the IO + UI + store modules. All behaviour
// lives in the focused modules below; this file is just composition.

import { selectTest } from "./state/store.js";
import { initTheme } from "./ui/theme.js";
import { setStatus } from "./state/status.js";
import { initUI, render } from "./ui/view.js";
import {
  loadJsonFromDisk,
  loadSampleJson,
  loadExampleJson,
  loadExamples,
  copyMarkdown,
  saveMarkdown
} from "./io/io.js";

const buttons = {
  loadJson: document.querySelector("#loadJsonButton"),
  loadSample: document.querySelector("#loadSampleButton"),
  copyMarkdown: document.querySelector("#copyMarkdownButton"),
  saveMarkdown: document.querySelector("#saveMarkdownButton")
};

buttons.loadJson.addEventListener("click", loadJsonFromDisk);
buttons.loadSample.addEventListener("click", loadSampleJson);
buttons.copyMarkdown.addEventListener("click", copyMarkdown);
buttons.saveMarkdown.addEventListener("click", saveMarkdown);

initTheme();
initUI({
  onSelectTest: (testId) => {
    selectTest(testId);
    render();
    setStatus("");
  },
  onLoadExample: loadExampleJson
});

loadExamples();
render();
