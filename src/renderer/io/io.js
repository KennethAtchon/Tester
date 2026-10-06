// Getting courses in and results out. Adding a course is one step from any
// of three places — the file picker, a file dropped anywhere on the window,
// or pasted text — and every path ends in the same importCourse call.

import { importCourse } from "../state/catalog.js";
import { toast } from "../ui/toast.js";
import { plural } from "../ui/components.js";

export async function importFromDialog() {
  try {
    const result = await window.testFiles.openCourseFile();
    return result.canceled ? null : importText(result.content, baseName(result.filePath));
  } catch (error) {
    toast(error.message, { tone: "error", timeout: 7000 });
    return null;
  }
}

export async function importFiles(files) {
  let last = null;
  for (const file of files) {
    if (!/\.(json|txt|md|markdown)$/i.test(file.name)) {
      toast(`${file.name}: drop a .json, .txt, or .md file.`, { tone: "error" });
      continue;
    }
    last = importText(await file.text(), file.name) || last;
  }
  return last;
}

export function importText(text, fileName = "") {
  try {
    const { course, isNew, warnings } = importCourse(text, fileName);
    const lessons = course.lessonKeys.length;
    const projects = course.projectKeys.length;
    const parts = [lessons && plural(lessons, "lesson"), projects && plural(projects, "project")].filter(Boolean).join(" · ");
    toast(`${isNew ? "Added" : "Updated"} “${course.title}” — ${parts}${warnings.length ? ` (${plural(warnings.length, "step")} skipped)` : ""}`, { tone: "success", timeout: 5000 });
    return course;
  } catch (error) {
    toast(error.message, { tone: "error", timeout: 7000 });
    return null;
  }
}

export async function openCoursesFolder() {
  try {
    await window.testFiles.openCoursesFolder();
  } catch (error) {
    toast(error.message, { tone: "error" });
  }
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

function baseName(filePath) {
  return String(filePath || "").split(/[\\/]/).pop();
}
