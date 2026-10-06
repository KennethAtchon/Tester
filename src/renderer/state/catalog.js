// Every available course — built-in ones from the courses/ folder plus any the
// learner imported — flattened into lookup tables with stable keys:
//   unitKey    course::unit
//   lessonKey  course::unit::lesson          (projects: course::lab::project)
//   itemKey    lessonKey::step               (gradable steps only)
// Memory, mastery, and progress are all keyed by these, so editing a course
// file keeps a learner's history as long as the ids stay the same.

import { normalizeCourse, parseCourseSource, toCourse, GRADABLE_TYPES } from "../domain/courseFormat.js";
import { progress, persist } from "./progress.js";

let builtin = [];
let loadErrors = [];
let cache = null;

export async function loadBuiltinCourses() {
  let entries = [];
  builtin = [];
  loadErrors = [];
  try {
    entries = (await window.testFiles?.listBuiltinCourses?.()) || [];
  } catch (error) {
    loadErrors.push({ path: "courses/", error: error.message });
  }
  for (const entry of entries) {
    if (entry.error) {
      loadErrors.push({ path: entry.path, error: entry.error });
      continue;
    }
    try {
      builtin.push(normalizeCourse(toCourse(entry.course, entry.path), { source: "builtin" }));
    } catch (error) {
      loadErrors.push({ path: entry.path, error: error.message });
    }
  }
  invalidateCatalog();
}

export function invalidateCatalog() {
  cache = null;
}

export function catalog() {
  cache ||= buildCatalog();
  return cache;
}

export const getCourse = (id) => catalog().courses.find((course) => course.id === id) ?? null;
export const getLesson = (key) => catalog().lessons.get(key) ?? null;
export const getUnit = (key) => catalog().units.get(key) ?? null;
export const getItem = (key) => catalog().items.get(key) ?? null;
// The learner model calls lessons "skills" (mastery is tracked per lesson).
export const getSkill = getLesson;

// Adds a course from file text (JSON, old test format, or quick text).
export function importCourse(text, fileName = "") {
  const raw = parseCourseSource(text, fileName);
  const course = normalizeCourse(raw, { source: "imported" });
  let id = course.id;
  if (builtin.some((entry) => entry.id === id)) {
    id = `${id}-mine`;
  }
  const imports = progress().imports;
  const isNew = !imports[id];
  imports[id] = { raw: { ...raw, id }, fileName, addedAt: imports[id]?.addedAt ?? Date.now(), updatedAt: Date.now() };
  invalidateCatalog();
  persist();
  return { course: getCourse(id), isNew, warnings: course.warnings };
}

export function removeImportedCourse(id) {
  const data = progress();
  delete data.imports[id];
  const prefix = `${id}::`;
  for (const store of [data.items, data.skills, data.mistakes, data.lessons, data.unlocked]) {
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
  const courses = [...builtin];
  const errors = [...loadErrors];
  for (const [id, record] of Object.entries(progress().imports)) {
    try {
      courses.push({ ...normalizeCourse(record.raw, { source: "imported" }), id, fileName: record.fileName, addedAt: record.addedAt });
    } catch (error) {
      errors.push({ path: record.fileName || id, error: error.message });
    }
  }

  const lessons = new Map();
  const units = new Map();
  const items = new Map();
  const projects = new Map();

  for (const course of courses) {
    course.lessonKeys = [];
    course.unitKeys = [];
    course.projectKeys = [];

    course.units.forEach((unit, unitIndex) => {
      const unitKey = `${course.id}::${unit.id}`;
      const unitEntry = { key: unitKey, courseId: course.id, id: unit.id, index: unitIndex, title: unit.title, description: unit.description, lessons: [] };
      units.set(unitKey, unitEntry);
      course.unitKeys.push(unitKey);

      unit.lessons.forEach((lesson, lessonIndex) => {
        const key = `${unitKey}::${lesson.id}`;
        const entry = {
          key,
          kind: "lesson",
          courseId: course.id,
          unitKey,
          unitIndex,
          index: lessonIndex,
          order: course.lessonKeys.length,
          title: lesson.title,
          summary: lesson.summary,
          minutes: lesson.minutes,
          steps: lesson.steps,
          items: [],
          prerequisites: []
        };
        lesson.steps.forEach((step, stepIndex) => {
          if (GRADABLE_TYPES.has(step.type)) {
            const itemKey = `${key}::${step.id}`;
            items.set(itemKey, { key: itemKey, lessonKey: key, skillKey: key, courseId: course.id, unitKey, step, index: stepIndex, kind: "lesson" });
            entry.items.push(itemKey);
          }
        });
        lessons.set(key, entry);
        unitEntry.lessons.push(key);
        course.lessonKeys.push(key);
      });
    });

    for (const project of course.projects) {
      const key = `${course.id}::lab::${project.id}`;
      const steps = [];
      const entry = {
        key,
        kind: "project",
        courseId: course.id,
        title: project.title,
        summary: project.summary,
        difficulty: project.difficulty,
        minutes: project.minutes,
        brief: project.brief,
        stages: project.stages.map((stage) => ({ id: stage.id, title: stage.title, count: stage.steps.length })),
        steps,
        items: [],
        prerequisites: []
      };
      project.stages.forEach((stage) => {
        stage.steps.forEach((step) => {
          steps.push({ ...step, stageId: stage.id, stageTitle: stage.title });
          if (GRADABLE_TYPES.has(step.type)) {
            const itemKey = `${key}::${step.id}`;
            items.set(itemKey, { key: itemKey, lessonKey: key, skillKey: key, courseId: course.id, step, index: steps.length - 1, kind: "project", stageId: stage.id });
            entry.items.push(itemKey);
          }
        });
      });
      lessons.set(key, entry);
      projects.set(key, entry);
      course.projectKeys.push(key);
    }
  }

  return { courses, lessons, units, items, projects, errors };
}
