// The learner's own content: subjects they created and courses they wrote or
// imported. Kept apart from progress (state/progress.js) so resetting progress
// never touches what was authored, and so authoring can become its own role
// later without untangling the two. state/catalog.js reads and edits this.

import { persistedDocument } from "../lib/persisted.js";

const VERSION = 1;
const store = persistedDocument({
  storageKey: "recall-library-v1",
  load: () => window.testFiles?.loadLibrary?.(),
  save: (text) => window.testFiles?.saveLibrary?.(text)
});

let data = null;

export function defaultLibrary() {
  return {
    version: VERSION,
    savedAt: 0,
    subjects: {}, // subjectId → { id, title, description, icon, color, createdAt }
    courses: {} // courseId → { raw, source: { format: "text" | "json", text }, fileName, subjectId, addedAt, updatedAt }
  };
}

export async function initLibrary() {
  const saved = await store.read();
  data = { ...defaultLibrary(), ...(saved?.version === VERSION ? saved : {}) };
  for (const key of ["subjects", "courses"]) {
    if (!data[key] || typeof data[key] !== "object" || Array.isArray(data[key])) {
      data[key] = {};
    }
  }
  return data;
}

export function library() {
  return data;
}

export function persistLibrary() {
  store.write(data);
}

export async function libraryFilePath() {
  try {
    return (await window.testFiles?.libraryPath?.()) || "";
  } catch {
    return "";
  }
}

// Earlier versions kept imported courses inside the progress file. Moves them
// into a "My courses" subject and reports whether anything moved.
export function adoptLegacyImports(imports) {
  const entries = Object.entries(imports || {});
  if (entries.length === 0) {
    return false;
  }
  const subjectId = "my-courses";
  data.subjects[subjectId] ||= { id: subjectId, title: "My courses", description: "Courses you added before subjects existed.", icon: "book", color: "#8b5cf6", createdAt: Date.now() };
  for (const [id, record] of entries) {
    data.courses[id] ||= {
      raw: record.raw,
      source: { format: "json", text: JSON.stringify(record.raw, null, 2) },
      fileName: record.fileName || "",
      subjectId,
      addedAt: record.addedAt || Date.now(),
      updatedAt: record.updatedAt || Date.now()
    };
  }
  persistLibrary();
  return true;
}
