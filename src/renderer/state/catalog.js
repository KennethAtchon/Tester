// Normalized view of every enrolled library: libraries → skills (tests) →
// items (questions), each with a stable key so memory state survives reloads
// and edits to the source JSON. Rebuilt lazily when the library set changes.

import { normalizeLibrary } from "../domain/normalize.js";
import { slugify } from "../lib/util.js";
import { progress, persist } from "./progress.js";

let cache = null;

export function invalidateCatalog() {
  cache = null;
}

export function catalog() {
  if (!cache) {
    cache = buildCatalog();
  }
  return cache;
}

export function getItem(itemKey) {
  return catalog().items.get(itemKey) ?? null;
}

export function getSkill(skillKey) {
  return catalog().skills.get(skillKey) ?? null;
}

export function getLibrary(libKey) {
  return catalog().libraries.find((library) => library.key === libKey) ?? null;
}

// Adds (or refreshes) a library from raw JSON. Throws if it doesn't validate.
export function enrollLibrary(raw, { sourcePath = "", fileName = "" } = {}) {
  const library = normalizeLibrary(raw);
  const key = library.tent || slugify(library.title) || slugify(fileName.replace(/\.json$/i, "")) || `library-${Date.now()}`;
  const libraries = progress().libraries;
  const existing = libraries[key];

  libraries[key] = {
    key,
    fileName,
    sourcePath,
    addedAt: existing?.addedAt ?? Date.now(),
    updatedAt: Date.now(),
    unlocked: existing?.unlocked ?? [],
    raw
  };

  invalidateCatalog();
  persist();
  return { key, isNew: !existing, library };
}

export function removeLibrary(libKey) {
  const data = progress();
  delete data.libraries[libKey];
  const prefix = `${libKey}::`;
  for (const store of [data.items, data.skills, data.mistakes, data.keys]) {
    for (const key of Object.keys(store)) {
      if (key.startsWith(prefix)) {
        delete store[key];
      }
    }
  }
  invalidateCatalog();
  persist();
}

function buildCatalog() {
  const libraries = [];
  const skills = new Map();
  const items = new Map();
  const broken = [];

  for (const record of Object.values(progress().libraries)) {
    let library;
    try {
      library = normalizeLibrary(record.raw);
    } catch (error) {
      broken.push({ key: record.key, error: error.message });
      continue;
    }

    const entry = {
      key: record.key,
      title: library.title,
      description: library.description,
      tent: library.tent,
      sourcePath: record.sourcePath,
      fileName: record.fileName,
      addedAt: record.addedAt,
      normalized: library,
      skills: []
    };

    const testIds = new Set(library.tests.map((test) => test.id));

    library.tests.forEach((test, testIndex) => {
      const skillKey = `${record.key}::${test.id}`;
      const skill = {
        key: skillKey,
        libKey: record.key,
        libTitle: library.title,
        index: testIndex,
        title: test.title,
        topic: test.topic,
        instructions: test.instructions,
        relevance: test.relevance,
        prerequisites: test.prerequisites.filter((id) => testIds.has(id) && id !== test.id).map((id) => `${record.key}::${id}`),
        test,
        items: []
      };

      test.questions.forEach((question, questionIndex) => {
        const itemKey = `${skillKey}::${question.id}`;
        items.set(itemKey, {
          key: itemKey,
          libKey: record.key,
          skillKey,
          index: questionIndex,
          question,
          test,
          skillTitle: test.title,
          libTitle: library.title
        });
        skill.items.push(itemKey);
      });

      skills.set(skillKey, skill);
      entry.skills.push(skill);
    });

    libraries.push(entry);
  }

  libraries.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
  return { libraries, skills, items, broken };
}
