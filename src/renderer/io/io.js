// IO controllers: bridge the preload file API to the learner catalog. Loading
// a library enrolls it (its JSON is kept with your progress so reviews can be
// scheduled across launches); re-loading the same library refreshes it.

import { enrollLibrary } from "../state/catalog.js";
import { progress } from "../state/progress.js";
import { toast } from "../ui/toast.js";
import { plural } from "../ui/components.js";

export async function listExamples() {
  try {
    return await window.testFiles.listExamples();
  } catch {
    return [];
  }
}

export function enrolledFileNames() {
  return new Set(Object.values(progress().libraries).map((record) => record.fileName).filter(Boolean));
}

export async function importFromDisk() {
  return guard(async () => {
    const result = await window.testFiles.openJson();
    return result.canceled ? null : enroll(result);
  });
}

export async function importSample() {
  return guard(async () => enroll(await window.testFiles.openSample()));
}

export async function importExample(fileName) {
  return guard(async () => enroll(await window.testFiles.openExample(fileName)));
}

export async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    toast(successMessage, { tone: "success" });
  } catch (error) {
    toast(error.message, { tone: "error" });
  }
}

export async function saveMarkdownFile(payload) {
  try {
    const result = await window.testFiles.saveMarkdown(payload);
    if (!result.canceled) {
      toast(`Saved to ${result.filePath}`, { tone: "success", timeout: 6000 });
    }
  } catch (error) {
    toast(error.message, { tone: "error" });
  }
}

function enroll(result) {
  let raw;
  try {
    raw = JSON.parse(result.content);
  } catch (error) {
    toast(`That file isn't valid JSON: ${error.message}`, { tone: "error", timeout: 7000 });
    return null;
  }
  const fileName = String(result.filePath || "").split(/[\\/]/).pop();
  const { key, isNew, library } = enrollLibrary(raw, { sourcePath: result.filePath, fileName });
  const itemCount = library.tests.reduce((sum, test) => sum + test.questions.length, 0);
  toast(`${isNew ? "Added" : "Refreshed"} “${library.title}” · ${plural(library.tests.length, "skill")} · ${plural(itemCount, "item")}`, { tone: "success" });
  return key;
}

async function guard(work) {
  try {
    return await work();
  } catch (error) {
    toast(error.message, { tone: "error", timeout: 7000 });
    return null;
  }
}
