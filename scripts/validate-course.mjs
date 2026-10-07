#!/usr/bin/env node
// Validates content: the whole subjects/ folder, one subject folder, a course
// folder, a single-file course, one unit/project file, or a plain-text quick
// course (.txt / .md). Beyond shape checks, it grades the author's own
// reference answers with the app's graders: text model answers must pass
// their concepts, build solutions must pass their rules, choice answers must
// be options, and so on.
//
//   node scripts/validate-course.mjs subjects
//   node scripts/validate-course.mjs subjects/system-design
//   node scripts/validate-course.mjs subjects/system-design/end-to-end/units/03-estimation.json
//   node scripts/validate-course.mjs my-notes.txt

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const domain = (file) => import(pathToFileURL(path.join(root, "src/renderer/domain", file)).href);
const { gradeText } = await domain("textGrader.js");
const { gradeGraph, expandSpec, isKnownType } = await domain("architecture.js");
const { parseFill, gradeApi, HTTP_METHODS } = await domain("grading.js");
const { SUBJECT_ICONS } = await domain("subjects.js");
const { parseCourseSource, normalizeCourse } = await domain("courseFormat.js");

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/validate-course.mjs <subjects folder | subject folder | course folder | course.json | unit.json | project.json | notes.txt>");
  process.exit(2);
}

const errors = [];
const warnings = [];
const counts = {};
let lessonCount = 0;
let projectCount = 0;
let subjectCount = 0;
let courseCount = 0;

const VISUALS = new Set(["flow", "diagram", "bars", "stats", "compare", "table"]);
const GRADABLE = new Set(["choice", "sort", "order", "match", "estimate", "number", "fill", "text", "api", "build", "code"]);
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const err = (where, message) => errors.push(`${where}: ${message}`);
const warn = (where, message) => warnings.push(`${where}: ${message}`);
const str = (value) => typeof value === "string" && value.trim().length > 0;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    err(file, `cannot read JSON (${error.message})`);
    return null;
  }
}

function validateCourse(course, base, where) {
  courseCount += 1;
  if (!str(course.id) || !ID.test(course.id)) err(where, "course needs a kebab-case id");
  if (!str(course.title)) err(where, "course needs a title");
  if (!Array.isArray(course.units) || course.units.length === 0) err(where, "course needs units");
  const unitIds = new Set();
  for (const entry of course.units || []) {
    const [unit, unitWhere] = resolve(entry, base, where);
    if (unit) {
      if (unitIds.has(unit.id)) err(unitWhere, `duplicate unit id ${unit.id}`);
      unitIds.add(unit.id);
      validateUnit(unit, unitWhere);
    }
  }
  for (const entry of course.projects || []) {
    const [project, projectWhere] = resolve(entry, base, where);
    if (project) validateProject(project, projectWhere);
  }
}

function resolve(entry, base, where) {
  if (typeof entry === "string") {
    const file = path.join(base, entry);
    return [readJson(file), path.relative(root, file)];
  }
  return [entry, `${where} › ${entry?.id ?? "?"}`];
}

function validateUnit(unit, where) {
  if (!str(unit.id) || !ID.test(unit.id)) err(where, "unit needs a kebab-case id");
  if (!str(unit.title)) err(where, "unit needs a title");
  if (!Array.isArray(unit.lessons) || unit.lessons.length === 0) err(where, "unit needs lessons");
  const lessonIds = new Set();
  for (const lesson of unit.lessons || []) {
    const lessonWhere = `${where} › ${lesson.id}`;
    lessonCount += 1;
    if (!str(lesson.id) || !ID.test(lesson.id)) err(lessonWhere, "lesson needs a kebab-case id");
    if (lessonIds.has(lesson.id)) err(lessonWhere, "duplicate lesson id");
    lessonIds.add(lesson.id);
    if (!str(lesson.title)) err(lessonWhere, "lesson needs a title");
    if (!str(lesson.summary)) warn(lessonWhere, "lesson has no summary");
    validateSteps(lesson.steps, lessonWhere, { lesson: true });
  }
}

function validateProject(project, where) {
  projectCount += 1;
  if (!str(project.id) || !ID.test(project.id)) err(where, "project needs a kebab-case id");
  if (!str(project.title)) err(where, "project needs a title");
  if (!str(project.brief)) err(where, "project needs a brief");
  if (!Array.isArray(project.stages) || project.stages.length < 3) err(where, "project needs at least 3 stages");
  const stepIds = new Set();
  let hasBuild = false;
  for (const stage of project.stages || []) {
    const stageWhere = `${where} › ${stage.id}`;
    if (!str(stage.id) || !str(stage.title)) err(stageWhere, "stage needs id and title");
    for (const step of stage.steps || []) {
      if (stepIds.has(step.id)) err(stageWhere, `step id ${step.id} repeats across stages`);
      stepIds.add(step.id);
      if (step.type === "build") hasBuild = true;
    }
    validateSteps(stage.steps, stageWhere, { lesson: false });
  }
  if (!hasBuild) warn(where, "project has no build (architecture) step");
}

function validateSteps(steps, where, { lesson }) {
  if (!Array.isArray(steps) || steps.length === 0) {
    err(where, "needs steps");
    return;
  }
  const ids = new Set();
  const types = new Set();
  let gradable = 0;
  steps.forEach((step, index) => {
    const stepWhere = `${where} › ${step?.id ?? `#${index + 1}`} (${step?.type})`;
    if (!step || typeof step !== "object") {
      err(stepWhere, "step must be an object");
      return;
    }
    if (!str(step.id) || !ID.test(step.id)) err(stepWhere, "step needs a kebab-case id");
    if (ids.has(step.id)) err(stepWhere, "duplicate step id");
    ids.add(step.id);
    counts[step.type] = (counts[step.type] || 0) + 1;
    types.add(step.type);
    if (GRADABLE.has(step.type)) {
      gradable += 1;
      if (!str(step.why)) err(stepWhere, "gradable steps need a why");
    }
    const check = CHECKS[step.type];
    if (!check) {
      err(stepWhere, `unknown step type "${step.type}"`);
      return;
    }
    check(step, stepWhere);
  });
  if (lesson) {
    if (steps.length < 5) warn(where, `only ${steps.length} steps (aim for 7–10)`);
    if (gradable < 4) warn(where, `only ${gradable} gradable steps (aim for 5+)`);
    if ([...types].filter((type) => type !== "concept").length < 3) warn(where, "uses fewer than 3 exercise types");
    if (steps[0]?.type === "concept" && steps[1]?.type === "concept") warn(where, "opens with two concept cards — ask a question early");
  }
}

const CHECKS = {
  concept(step, where) {
    if (!str(step.title)) err(where, "concept needs a title");
    if (!str(step.body)) err(where, "concept needs a body");
    if (str(step.body) && step.body.split(/\s+/).length > 90) warn(where, `body is ${step.body.split(/\s+/).length} words (aim under ~60)`);
    if (step.visual) validateVisual(step.visual, where);
  },
  choice(step, where) {
    if (!str(step.prompt)) err(where, "needs a prompt");
    if (!Array.isArray(step.options) || step.options.length < 2 || step.options.length > 6) err(where, "needs 2–6 options");
    const options = new Set(step.options || []);
    if (options.size !== (step.options || []).length) err(where, "options repeat");
    const answers = Array.isArray(step.answer) ? step.answer : [step.answer];
    if (answers.length === 0 || answers.some((answer) => !options.has(answer))) err(where, `answer must be one of the options: ${JSON.stringify(step.answer)}`);
    for (const key of Object.keys(step.misconceptions || {})) {
      if (!options.has(key)) err(where, `misconception key is not an option: "${key}"`);
      if (answers.includes(key)) err(where, `misconception given for a correct option: "${key}"`);
    }
  },
  sort(step, where) {
    if (!str(step.prompt)) err(where, "needs a prompt");
    if (!Array.isArray(step.buckets) || step.buckets.length < 2) err(where, "needs 2+ buckets");
    if (!Array.isArray(step.items) || step.items.length < 3) err(where, "needs 3+ items");
    for (const item of step.items || []) {
      if (!str(item.text)) err(where, "item needs text");
      if (!(step.buckets || []).includes(item.bucket)) err(where, `item bucket not in buckets: "${item.bucket}"`);
    }
    const used = new Set((step.items || []).map((item) => item.bucket));
    for (const bucket of step.buckets || []) {
      if (!used.has(bucket)) warn(where, `bucket "${bucket}" has no items`);
    }
  },
  order(step, where) {
    if (!str(step.prompt)) err(where, "needs a prompt");
    if (!Array.isArray(step.items) || step.items.length < 3 || step.items.length > 7) err(where, "needs 3–7 items");
    if (new Set(step.items || []).size !== (step.items || []).length) err(where, "items repeat");
  },
  match(step, where) {
    if (!str(step.prompt)) err(where, "needs a prompt");
    if (!Array.isArray(step.pairs) || step.pairs.length < 3 || step.pairs.length > 6) err(where, "needs 3–6 pairs");
    const rights = (step.pairs || []).map((pair) => pair[1]);
    if (new Set(rights).size !== rights.length) err(where, "right-hand sides repeat");
    for (const pair of step.pairs || []) {
      if (!Array.isArray(pair) || pair.length !== 2 || !str(pair[0]) || !str(pair[1])) err(where, "each pair is [left, right]");
    }
  },
  number(step, where) {
    if (!str(step.prompt)) err(where, "needs a prompt");
    const answers = [].concat(step.answer ?? []);
    if (answers.length === 0 || !answers.every(Number.isFinite)) err(where, "answer must be a number (or a list of numbers)");
    if (step.tolerance != null && !(step.tolerance >= 0)) err(where, "tolerance is an absolute amount like 0.01");
  },
  estimate(step, where) {
    if (!str(step.prompt)) err(where, "needs a prompt");
    if (!(typeof step.answer === "number" && step.answer > 0)) err(where, "answer must be a positive number");
    if (!str(step.unit)) err(where, "needs a unit");
    if (!Array.isArray(step.solution) || step.solution.length === 0) err(where, "needs solution steps");
    for (const row of step.given || []) {
      if (!Array.isArray(row) || row.length !== 2) err(where, "given rows are [label, value]");
    }
    if (step.tolerance != null && !(step.tolerance > 0 && step.tolerance <= 1)) err(where, "tolerance is a fraction like 0.3");
  },
  fill(step, where) {
    if (!str(step.text)) err(where, "needs text with [[blanks]]");
    const blanks = parseFill(step.text || "").filter((part) => part.blank != null);
    if (blanks.length === 0) err(where, "text has no [[blanks]]");
    if (step.bank) {
      for (const blank of blanks) {
        if (!step.bank.includes(blank.answers[0])) err(where, `bank is missing "${blank.answers[0]}"`);
      }
      if (step.bank.length <= blanks.length) warn(where, "bank has no distractors");
    }
  },
  text(step, where) {
    if (!str(step.prompt)) err(where, "needs a prompt");
    if (!Array.isArray(step.concepts) || step.concepts.length < 2) err(where, "needs 2+ concepts");
    for (const concept of step.concepts || []) {
      if (!str(concept.label) || !Array.isArray(concept.any) || concept.any.length === 0) err(where, "each concept needs a label and phrasings");
      if ((concept.any || []).length < 3) warn(where, `concept "${concept.label}" has only ${(concept.any || []).length} phrasings`);
      for (const phrase of concept.any || []) {
        if (phrase.startsWith("re:")) {
          try {
            new RegExp(phrase.slice(3), "i");
          } catch {
            err(where, `bad regex ${phrase}`);
          }
        }
      }
    }
    if (step.pass != null && !(step.pass >= 1 && step.pass <= (step.concepts || []).length)) err(where, "pass must be between 1 and the number of concepts");
    if (!str(step.model)) {
      err(where, "needs a model answer");
    } else if (Array.isArray(step.concepts)) {
      const result = gradeText(step.model, step.concepts, step.pass);
      if (!result.passed) {
        err(where, `model answer fails its own concepts (${result.count}/${result.needed}); missing: ${result.hits.filter((hit) => !hit.hit).map((hit) => hit.label).join("; ")}`);
      } else if (result.count < step.concepts.length) {
        warn(where, `model answer misses: ${result.hits.filter((hit) => !hit.hit).map((hit) => hit.label).join("; ")}`);
      }
    }
  },
  api(step, where) {
    if (!str(step.prompt)) err(where, "needs a prompt");
    if (!Array.isArray(step.endpoints) || step.endpoints.length === 0) err(where, "needs endpoints");
    for (const endpoint of step.endpoints || []) {
      if (!str(endpoint.purpose)) err(where, "endpoint needs a purpose");
      const methods = Array.isArray(endpoint.method) ? endpoint.method : [endpoint.method];
      if (methods.some((method) => !HTTP_METHODS.includes(method))) err(where, `bad method ${endpoint.method}`);
      const paths = Array.isArray(endpoint.path) ? endpoint.path : [endpoint.path];
      if (paths.some((value) => !str(value) || !value.startsWith("/"))) err(where, "paths start with /");
    }
    const rows = (step.endpoints || []).map((endpoint) => ({ method: [].concat(endpoint.method)[0], path: [].concat(endpoint.path)[0] }));
    if (!gradeApi(step, rows).correct) err(where, "the first listed method/path of each endpoint should grade as correct");
  },
  build(step, where) {
    if (!str(step.prompt)) err(where, "needs a prompt");
    if (!Array.isArray(step.palette) || step.palette.length < 3) err(where, "needs a palette of 3+ components");
    for (const type of step.palette || []) {
      if (!isKnownType(type)) err(where, `unknown palette type "${type}"`);
    }
    const rules = step.rules || {};
    const specs = [
      ...(rules.nodes || []).map((rule) => rule.type),
      ...(rules.edges || []).flatMap((rule) => [rule.from, rule.to]),
      ...(rules.paths || []).flatMap((rule) => rule.through || []),
      ...(rules.forbidden || []).flatMap((rule) => [rule.from, rule.to])
    ];
    for (const spec of specs) {
      try {
        const types = expandSpec(spec);
        if (![...types].some((type) => (step.palette || []).includes(type))) err(where, `rule uses "${spec}" but nothing in the palette provides it`);
      } catch (error) {
        err(where, error.message);
      }
    }
    for (const rule of [...(rules.nodes || []), ...(rules.edges || []), ...(rules.paths || []), ...(rules.forbidden || [])]) {
      if (!str(rule.why)) warn(where, "every rule should explain why");
    }
    for (const graph of [step.start, step.solution].filter(Boolean)) {
      validateGraph(graph, where);
    }
    if (!step.solution) {
      err(where, "needs a solution graph");
    } else {
      try {
        const result = gradeGraph(step.solution, rules);
        const failed = result.checks.filter((check) => !check.ok);
        if (failed.length) err(where, `solution fails its own rules: ${failed.map((check) => check.text).join("; ")}`);
      } catch (error) {
        err(where, error.message);
      }
      for (const node of step.solution.nodes || []) {
        if (!(step.palette || []).includes(node.type)) err(where, `solution uses "${node.type}" which isn't in the palette`);
      }
    }
  },
  code(step, where) {
    if (!str(step.prompt)) err(where, "needs a prompt");
    if (!Array.isArray(step.tests) || step.tests.length === 0) err(where, "needs tests");
  }
};

function validateGraph(graph, where) {
  const ids = new Set();
  for (const node of graph.nodes || []) {
    if (!str(node.id)) err(where, "graph node needs an id");
    if (ids.has(node.id)) err(where, `graph node id repeats: ${node.id}`);
    ids.add(node.id);
    if (!isKnownType(node.type)) err(where, `graph node has unknown type "${node.type}"`);
    if (node.x != null && !(node.x >= 0 && node.x <= 100)) err(where, `node ${node.id} x must be 0–100`);
    if (node.y != null && !(node.y >= 0 && node.y <= 100)) err(where, `node ${node.id} y must be 0–100`);
  }
  for (const edge of graph.edges || []) {
    const from = Array.isArray(edge) ? edge[0] : edge.from;
    const to = Array.isArray(edge) ? edge[1] : edge.to;
    if (!ids.has(from) || !ids.has(to)) err(where, `edge references a missing node: ${from} → ${to}`);
  }
}

function validateVisual(visual, where) {
  if (!VISUALS.has(visual.kind)) {
    err(where, `unknown visual kind "${visual.kind}"`);
    return;
  }
  if (visual.kind === "flow" && !(Array.isArray(visual.steps) && visual.steps.length >= 2)) err(where, "flow visual needs 2+ steps");
  if (visual.kind === "diagram") validateGraph(visual, where);
  if (visual.kind === "bars" && !(Array.isArray(visual.items) && visual.items.every((item) => str(item.label) && typeof item.value === "number"))) err(where, "bars need items with label and numeric value");
  if (visual.kind === "stats" && !(Array.isArray(visual.items) && visual.items.length > 0)) err(where, "stats need items");
  if (visual.kind === "compare" && !(visual.left?.points && visual.right?.points)) err(where, "compare needs left and right with points");
  if (visual.kind === "table" && !(Array.isArray(visual.columns) && Array.isArray(visual.rows))) err(where, "table needs columns and rows");
}

// ── entry ───────────────────────────────────────────────────────────────────

function validateSubjectFile(file) {
  subjectCount += 1;
  const subject = readJson(file);
  const where = path.relative(root, file);
  if (!subject) return null;
  const folderId = path.basename(path.dirname(file));
  if (subject.id != null && (!str(subject.id) || !ID.test(subject.id))) err(where, "subject id must be kebab-case");
  if (subject.id && subject.id !== folderId) warn(where, `id "${subject.id}" differs from its folder name "${folderId}"`);
  if (!str(subject.title)) err(where, "subject needs a title");
  if (!str(subject.description)) warn(where, "subject has no description");
  if (subject.icon && !SUBJECT_ICONS.includes(subject.icon)) warn(where, `unknown icon "${subject.icon}" (use one of: ${SUBJECT_ICONS.join(", ")})`);
  if (subject.color && !/^#[0-9a-f]{6}$/i.test(subject.color)) err(where, "color must be a hex like #2f6df6");
  return subject;
}

function validateEntry(entryPath) {
  const stat = fs.statSync(entryPath);
  if (stat.isDirectory()) {
    if (fs.existsSync(path.join(entryPath, "subject.json"))) {
      validateSubjectFile(path.join(entryPath, "subject.json"));
      for (const child of fs.readdirSync(entryPath).sort()) {
        if (child !== "subject.json" && !child.startsWith(".")) validateEntry(path.join(entryPath, child));
      }
    } else if (fs.existsSync(path.join(entryPath, "course.json"))) {
      const course = readJson(path.join(entryPath, "course.json"));
      if (course) validateCourse(course, entryPath, path.relative(root, path.join(entryPath, "course.json")));
    } else {
      // A folder of subjects (like subjects/ itself).
      for (const child of fs.readdirSync(entryPath).sort()) {
        const childPath = path.join(entryPath, child);
        if (fs.statSync(childPath).isDirectory() || child.endsWith(".json")) validateEntry(childPath);
      }
    }
    return;
  }
  const where = path.relative(root, entryPath);
  if (/\.(txt|md|markdown)$/i.test(entryPath)) {
    if (path.basename(entryPath).toLowerCase() === "readme.md") return;
    validateQuick(entryPath, where);
    return;
  }
  if (!entryPath.endsWith(".json")) return;
  if (path.basename(entryPath) === "subject.json") {
    validateSubjectFile(entryPath);
    return;
  }
  const data = readJson(entryPath);
  if (data?.units) validateCourse(data, path.dirname(entryPath), where);
  else if (data?.stages) validateProject(data, where);
  else if (data?.lessons) validateUnit(data, where);
  else err(where, "not a course, unit, or project (expected units, lessons, or stages)");
}

// Plain-text quick courses are checked the way the app reads them.
function validateQuick(file, where) {
  courseCount += 1;
  try {
    const raw = parseCourseSource(fs.readFileSync(file, "utf8"), path.basename(file));
    const course = normalizeCourse(raw);
    for (const note of raw.notes || []) warn(where, `line ${note.line}: ${note.message}`);
    for (const warning of course.warnings) warn(where, warning);
    for (const unit of course.units) {
      for (const lesson of unit.lessons) {
        lessonCount += 1;
        for (const step of lesson.steps) counts[step.type] = (counts[step.type] || 0) + 1;
      }
    }
  } catch (error) {
    err(where, error.message);
  }
}

validateEntry(path.resolve(target));

const summary = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([type, count]) => `${type} ${count}`).join(" · ");
console.log(`${subjectCount ? `${subjectCount} subject(s) · ` : ""}${courseCount} course(s) · ${lessonCount} lessons · ${projectCount} projects · ${summary}`);
for (const warning of warnings) console.log(`  warn  ${warning}`);
for (const error of errors) console.log(`  ERROR ${error}`);
console.log(errors.length ? `\n✗ ${errors.length} error(s), ${warnings.length} warning(s)` : `\n✓ valid (${warnings.length} warning(s))`);
process.exit(errors.length ? 1 : 0);
