// Every subject and course — built-in ones from the subjects/ folder plus the
// learner's own (state/library.js) — flattened into lookup tables with stable
// keys:
//   unitKey    course::unit
//   lessonKey  course::unit::lesson          (projects: course::lab::project)
//   itemKey    lessonKey::step               (gradable steps only)
// Memory, mastery, and progress are all keyed by these, so editing a course
// keeps a learner's history as long as the ids stay the same. Every course
// belongs to exactly one subject, and every entry carries its subjectId.

import { normalizeCourse, parseCourseSource, toCourse, GRADABLE_TYPES } from "../domain/courseFormat.js";
import { normalizeSubject, GENERAL_SUBJECT } from "../domain/subjects.js";
import { progress, settings, persist } from "./progress.js";
import { library, persistLibrary } from "./library.js";
import { slugify } from "../lib/util.js";

let builtin = { subjects: [], courses: [] };
let loadErrors = [];
let cache = null;

export async function loadBuiltinContent() {
  builtin = { subjects: [], courses: [] };
  loadErrors = [];
  let content = null;
  try {
    content = await window.testFiles?.listBuiltinContent?.();
  } catch (error) {
    loadErrors.push({ path: "subjects/", error: error.message });
  }
  loadErrors.push(...(content?.errors || []));
  for (const entry of content?.subjects || []) {
    try {
      builtin.subjects.push(normalizeSubject(entry.subject, "builtin"));
    } catch (error) {
      loadErrors.push({ path: entry.path, error: error.message });
    }
  }
  for (const entry of content?.courses || []) {
    try {
      const course = normalizeCourse(toCourse(entry.course, entry.path), { source: "builtin" });
      builtin.courses.push({ ...course, subjectId: entry.subjectId || slugify(entry.course.subject || "") || null });
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

export const getSubject = (id) => catalog().subjects.find((subject) => subject.id === id) ?? null;
export const getCourse = (id) => catalog().courses.find((course) => course.id === id) ?? null;
export const getLesson = (key) => catalog().lessons.get(key) ?? null;
export const getUnit = (key) => catalog().units.get(key) ?? null;
export const getItem = (key) => catalog().items.get(key) ?? null;
// The learner model calls lessons "skills" (mastery is tracked per lesson).
export const getSkill = getLesson;

export function coursesIn(subjectId) {
  return catalog().courses.filter((course) => course.subjectId === subjectId);
}

// ── the subject being studied ───────────────────────────────────────────────

export function currentSubjectId() {
  const { subjects } = catalog();
  const chosen = progress().profile.subject;
  if (chosen && subjects.some((subject) => subject.id === chosen)) {
    return chosen;
  }
  return (subjects.find((subject) => subject.courseIds.length > 0) || subjects[0])?.id ?? null;
}

export function currentSubject() {
  return getSubject(currentSubjectId());
}

export function setCurrentSubject(subjectId) {
  progress().profile.subject = subjectId;
  persist();
}

// Which subject the games and reviews draw from: the current one, or every
// subject (null) when the learner chose "All subjects" in Practice.
export function practiceScope() {
  return settings().practiceScope === "all" ? null : currentSubjectId();
}

export function inScope(entry, scope) {
  return !scope || entry?.subjectId === scope;
}

// ── authoring: subjects ─────────────────────────────────────────────────────

export function createSubject({ title, description = "", icon = "book", color = null }) {
  const base = slugify(title) || "subject";
  let id = base;
  for (let suffix = 2; getSubject(id); suffix += 1) {
    id = `${base}-${suffix}`;
  }
  library().subjects[id] = { id, title: title.trim(), description: description.trim(), icon, color, createdAt: Date.now() };
  invalidateCatalog();
  persistLibrary();
  return id;
}

export function updateSubject(id, patch) {
  const record = library().subjects[id];
  if (!record) {
    return;
  }
  Object.assign(record, patch);
  invalidateCatalog();
  persistLibrary();
}

// Deletes a subject the learner made, with its courses and their progress.
export function deleteSubject(id) {
  for (const [courseId, record] of Object.entries(library().courses)) {
    if (record.subjectId === id) {
      forgetCourse(courseId);
    }
  }
  delete library().subjects[id];
  if (progress().profile.subject === id) {
    progress().profile.subject = null;
  }
  invalidateCatalog();
  persistLibrary();
  persist();
}

// ── authoring: courses ──────────────────────────────────────────────────────

// Adds or updates a course from text: course JSON, an older test file, or the
// quick text format. Pass replaceId when editing so the course keeps its id
// (and the learner's progress). Without it, a course with the same id is
// updated in place (re-importing an edited file), unless unique is set.
export function saveCourse(text, { subjectId = null, fileName = "", replaceId = null, unique = false } = {}) {
  const raw = parseCourseSource(text, fileName);
  const course = normalizeCourse(raw, { source: "user" });
  const courses = library().courses;
  let id = replaceId || course.id;
  if (!replaceId) {
    if (builtin.courses.some((entry) => entry.id === id)) {
      id = `${id}-mine`;
    }
    const base = id;
    for (let suffix = 2; unique && courses[id]; suffix += 1) {
      id = `${base}-${suffix}`;
    }
  }
  const existing = courses[id];
  courses[id] = {
    raw: { ...raw, id },
    source: { format: /^\s*[[{]/.test(text) ? "json" : "text", text },
    fileName,
    subjectId: subjectId || existing?.subjectId || currentSubjectId(),
    addedAt: existing?.addedAt ?? Date.now(),
    updatedAt: Date.now()
  };
  invalidateCatalog();
  persistLibrary();
  return { course: getCourse(id), isNew: !existing, warnings: course.warnings };
}

export function courseSource(courseId) {
  return library().courses[courseId]?.source ?? null;
}

export function moveCourse(courseId, subjectId) {
  const record = library().courses[courseId];
  if (record) {
    record.subjectId = subjectId;
    invalidateCatalog();
    persistLibrary();
  }
}

export function removeCourse(courseId) {
  forgetCourse(courseId);
  invalidateCatalog();
  persistLibrary();
  persist();
}

function forgetCourse(courseId) {
  const data = progress();
  delete library().courses[courseId];
  const prefix = `${courseId}::`;
  for (const store of [data.items, data.skills, data.mistakes, data.lessons, data.unlocked]) {
    for (const key of Object.keys(store)) {
      if (key.startsWith(prefix)) {
        delete store[key];
      }
    }
  }
}

// ── building the tables ─────────────────────────────────────────────────────

function buildCatalog() {
  const errors = [...loadErrors];
  const subjects = builtin.subjects.map((subject) => ({ ...subject }));
  const userSubjects = Object.values(library().subjects).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  for (const record of userSubjects) {
    try {
      subjects.push({ ...normalizeSubject(record, "user"), id: record.id, createdAt: record.createdAt });
    } catch (error) {
      errors.push({ path: `subject ${record.id}`, error: error.message });
    }
  }

  const courses = builtin.courses.map((course) => ({ ...course }));
  for (const [id, record] of Object.entries(library().courses)) {
    try {
      courses.push({ ...normalizeCourse(record.raw, { source: "user" }), id, subjectId: record.subjectId, fileName: record.fileName, addedAt: record.addedAt, updatedAt: record.updatedAt });
    } catch (error) {
      errors.push({ path: record.fileName || id, error: error.message });
    }
  }

  const known = new Set(subjects.map((subject) => subject.id));
  for (const course of courses) {
    if (!known.has(course.subjectId)) {
      if (!known.has(GENERAL_SUBJECT.id)) {
        subjects.push({ ...GENERAL_SUBJECT, source: "builtin" });
        known.add(GENERAL_SUBJECT.id);
      }
      course.subjectId = GENERAL_SUBJECT.id;
    }
  }
  for (const subject of subjects) {
    subject.courseIds = courses.filter((course) => course.subjectId === subject.id).map((course) => course.id);
  }
  // A course without its own color wears its subject's.
  for (const course of courses) {
    if (!course.ownColor) {
      course.color = subjects.find((subject) => subject.id === course.subjectId).color;
    }
  }

  const lessons = new Map();
  const units = new Map();
  const items = new Map();
  const projects = new Map();

  for (const course of courses) {
    const { subjectId } = course;
    course.lessonKeys = [];
    course.unitKeys = [];
    course.projectKeys = [];

    course.units.forEach((unit, unitIndex) => {
      const unitKey = `${course.id}::${unit.id}`;
      const unitEntry = { key: unitKey, courseId: course.id, subjectId, id: unit.id, index: unitIndex, title: unit.title, description: unit.description, lessons: [] };
      units.set(unitKey, unitEntry);
      course.unitKeys.push(unitKey);

      unit.lessons.forEach((lesson, lessonIndex) => {
        const key = `${unitKey}::${lesson.id}`;
        const entry = {
          key,
          kind: "lesson",
          courseId: course.id,
          subjectId,
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
            items.set(itemKey, { key: itemKey, lessonKey: key, skillKey: key, courseId: course.id, subjectId, unitKey, step, index: stepIndex, kind: "lesson" });
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
        subjectId,
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
            items.set(itemKey, { key: itemKey, lessonKey: key, skillKey: key, courseId: course.id, subjectId, step, index: steps.length - 1, kind: "project", stageId: stage.id });
            entry.items.push(itemKey);
          }
        });
      });
      lessons.set(key, entry);
      projects.set(key, entry);
      course.projectKeys.push(key);
    }
  }

  return { subjects, courses, lessons, units, items, projects, errors };
}
