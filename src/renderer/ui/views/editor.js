// The course editor: write a course in plain text (the quick format in
// domain/courseFormat.js, or course JSON) and watch it take shape in a live
// preview. Insert buttons drop in a ready-made step of each type. Saving adds
// the course to a subject; editing keeps its id, so progress carries over.

import { h, append } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { button, chip, plural } from "../components.js";
import { catalog, getSubject, getCourse, courseSource } from "../../state/catalog.js";
import { parseCourseSource, normalizeCourse } from "../../domain/courseFormat.js";
import { plain } from "../../lib/markup.js";
import { importText } from "../../io/io.js";
import { TYPE_LABELS } from "../exercises/index.js";
import { navigate, href } from "../router.js";

const SNIPPETS = [
  { label: "Lesson", text: "## Lesson title" },
  { label: "Unit", text: "## Unit: Unit title" },
  { label: "Learn card", text: "Learn: The idea\nExplain one idea in two or three sentences." },
  { label: "Multiple choice", text: "Q: Your question?\n- A wrong answer\n* The right answer\n- Another wrong answer\nWhy: Why the right answer is right." },
  { label: "Typed answer", text: "Q: Your question?\nA: The answer in a few words\nWhy: Why that's the answer." },
  { label: "Number", text: "Number: Solve 2x + 5 = 17\nA: 6\nStep: Subtract 5 from both sides: 2x = 12\nStep: Divide both sides by 2: x = 6" },
  { label: "Estimate", text: "Estimate: How many seconds are in a day?\nA: 86400 seconds\nWhy: 24 × 60 × 60." },
  { label: "Sort", text: "Sort: Which group does each belong to?\n[Group A] First item\n[Group B] Second item\n[Group A] Third item\n[Group B] Fourth item" },
  { label: "Order", text: "Order: Put these in order.\n1. First\n2. Second\n3. Third" },
  { label: "Match", text: "Match: Match each term to its meaning.\n- Term one -> Meaning one\n- Term two -> Meaning two\n- Term three -> Meaning three" },
  { label: "Fill in", text: "Fill: The [[answer]] goes in the blank, and [[this|that]] accepts either word.\nBank: answer, this, decoy" }
];

const GUIDE = [
  ["# Title", "Course title. Lines right after it become the description."],
  ["## Unit: Name", "Starts a unit (optional) to group the lessons below it."],
  ["## Lesson name", "Starts a lesson."],
  ["Learn: Title", "A concept card. The lines below are its text; “- ” lines become bullets."],
  ["> A key idea", "A short concept card."],
  ["Q: Question", "Then “- wrong” and “* right” options (several * = select all), or “A: answer” for a typed answer graded on its key words."],
  ["Number: Question", "An exact answer: “A: 42”, “A: -3/4”, “A: 9.8 m/s²”, or “A: 3.14 ± 0.01”."],
  ["Estimate: Question", "A ballpark number, right within 30%: “A: 86400 seconds”."],
  ["Sort: Prompt", "Then “[Bucket] item” lines."],
  ["Order: Prompt", "Then “1. first”, “2. second”… in the right order. The app shuffles them."],
  ["Match: Prompt", "Then “- left -> right” lines."],
  ["Fill: Text with [[blanks]]", "[[a|b]] accepts either. Add “Bank: word, word” for tap-to-fill."],
  ["Why: / Hint:", "Explanation and hint for the step above."],
  ["Given: label = value / Step: …", "Facts shown above a Number or Estimate, and worked-solution lines."]
];

const drafts = new Map();

function starterText(subject) {
  return `# ${subject.title} basics
A short description of what this course covers.

## First lesson
Learn: The big idea
Explain one idea in two or three sentences. Short is better.

Q: A question that checks the idea?
- A tempting wrong answer
* The right answer
- Another wrong answer
Why: One sentence on why the right answer is right.
`;
}

// Route: write/<subjectId>[/<courseId>]
export function renderEditor(root, [subjectId, courseId = null]) {
  const editing = courseId ? getCourse(courseId) : null;
  const source = courseId ? courseSource(courseId) : null;
  const subject = getSubject(editing?.subjectId || subjectId) || getSubject(catalog().subjects[0]?.id);
  const page = h("div", { class: "page page-wide editor-page" });
  root.append(page);
  if (!subject || (courseId && !source)) {
    page.append(h("p", { class: "muted", text: "That course can't be edited here." }), button("Back", { onClick: () => history.back() }));
    return null;
  }

  const draftKey = `${subject.id}/${courseId || "new"}`;
  const state = drafts.get(draftKey) || { text: source?.text ?? starterText(subject), subjectId: subject.id, saved: source?.text ?? null };
  drafts.set(draftKey, state);
  const isJson = () => /^\s*[[{]/.test(state.text);

  const area = h("textarea", {
    class: "input editor-text",
    spellcheck: "false",
    value: state.text,
    "aria-label": "Course text",
    onInput: (event) => {
      state.text = event.target.value;
      schedulePreview();
    },
    onKeydown: (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      }
    },
    onDragover: (event) => event.preventDefault(),
    onDrop: async (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (!file) {
        return;
      }
      event.preventDefault();
      if (state.text.trim() && !window.confirm(`Replace the editor's text with ${file.name}?`)) {
        return;
      }
      state.text = await file.text();
      area.value = state.text;
      paintPreview();
    }
  });

  const insert = (snippet) => {
    const start = area.selectionStart ?? area.value.length;
    const before = area.value.slice(0, start);
    const after = area.value.slice(area.selectionEnd ?? start);
    const lead = before.trim() === "" ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const block = `${lead}${snippet.text}\n${after.startsWith("\n") || after === "" ? "" : "\n"}`;
    area.value = before + block + after;
    state.text = area.value;
    // Select the first line's text so typing replaces it.
    const firstLine = snippet.text.split("\n")[0];
    const offset = firstLine.includes(": ") ? firstLine.indexOf(": ") + 2 : firstLine.startsWith("## ") ? 3 : 0;
    const selectStart = before.length + lead.length + offset;
    area.focus();
    area.setSelectionRange(selectStart, before.length + lead.length + firstLine.length);
    paintPreview();
  };

  const subjectSelect = h(
    "select",
    { class: "input input-sm editor-subject", "aria-label": "Subject", onChange: (event) => { state.subjectId = event.target.value; } },
    catalog().subjects.map((entry) => h("option", { value: entry.id, text: entry.title, selected: entry.id === state.subjectId }))
  );

  const saveButton = button(editing ? "Save changes" : "Save course", { variant: "go", iconName: "check", kbd: "Ctrl S", onClick: () => save() });

  function save() {
    const course = importText(state.text, { subjectId: state.subjectId, replaceId: courseId, unique: !courseId, fileName: editing?.fileName || "" });
    if (course) {
      drafts.delete(draftKey);
      navigate("course", course.id);
    }
  }

  const preview = h("div", { class: "editor-preview", "aria-live": "polite" });
  let previewTimer = 0;
  const schedulePreview = () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(paintPreview, 180);
  };

  function paintPreview() {
    let raw;
    let course;
    try {
      raw = parseCourseSource(state.text, "editor");
      course = normalizeCourse(raw);
    } catch (error) {
      preview.replaceChildren(h("div", { class: "editor-status is-bad" }, icon("alert", { size: 16 }), h("span", { text: error.message })));
      saveButton.disabled = true;
      return;
    }
    saveButton.disabled = false;
    const lessons = course.units.reduce((sum, unit) => sum + unit.lessons.length, 0);
    const steps = course.units.reduce((sum, unit) => sum + unit.lessons.reduce((inner, lesson) => inner + lesson.steps.length, 0), 0);
    const notes = [...(raw.notes || []).map((note) => `Line ${note.line}: ${note.message}`), ...course.warnings];
    const showUnits = course.units.length > 1;
    preview.replaceChildren();
    append(
      preview,
      h("div", { class: "editor-status is-ok" }, icon("check", { size: 16 }), h("span", null, h("strong", { text: course.title }), ` — ${plural(lessons, "lesson")}, ${plural(steps, "step")}${course.projects.length ? `, ${plural(course.projects.length, "project")}` : ""}`)),
      notes.length > 0 && h("ul", { class: "editor-notes" }, notes.map((note) => h("li", null, icon("alert", { size: 14 }), h("span", { text: note })))),
      h(
        "div",
        { class: "editor-tree" },
        course.units.map((unit) =>
          h(
            "div",
            { class: "editor-unit" },
            showUnits && h("div", { class: "editor-unit-title", text: unit.title }),
            unit.lessons.map((lesson) =>
              h(
                "div",
                { class: "editor-lesson" },
                h("div", { class: "editor-lesson-title" }, icon("book", { size: 14 }), lesson.title, h("span", { class: "muted small", text: ` · ${plural(lesson.steps.length, "step")}` })),
                h("ol", { class: "editor-steps" }, lesson.steps.map((step) => h("li", null, chip(TYPE_LABELS[step.type] || step.type, { tone: step.type === "concept" ? null : "accent" }), h("span", { class: "editor-step-text", text: plain(step.prompt || step.title || step.text || step.body || "").slice(0, 120) }))))
              )
            )
          )
        )
      )
    );
  }

  const back = editing ? href("course", editing.id) : href("subject", subject.id);
  page.append(
    h("a", { class: "back-link", href: back }, icon("arrowLeft", { size: 16 }), editing ? editing.title : subject.title),
    h(
      "header",
      { class: "page-head editor-head" },
      h("div", { class: "page-head-text" }, h("p", { class: "eyebrow", text: "Course editor" }), h("h1", { class: "page-title", text: editing ? `Edit “${editing.title}”` : `New course in ${subject.title}` })),
      h("div", { class: "page-actions" }, h("label", { class: "editor-subject-field" }, h("span", { class: "muted small", text: "Subject" }), subjectSelect), saveButton)
    ),
    h(
      "div",
      { class: "editor-toolbar", role: "toolbar", "aria-label": "Insert a step" },
      h("span", { class: "editor-toolbar-label", text: "Insert" }),
      SNIPPETS.map((snippet) => h("button", { type: "button", class: "editor-insert", disabled: isJson(), title: isJson() ? "Insert works in the plain-text format" : null, onClick: () => insert(snippet) }, icon("plus", { size: 13 }), snippet.label))
    ),
    h("div", { class: "editor-grid" }, h("div", { class: "editor-main" }, area), h("aside", { class: "editor-side" }, h("div", { class: "editor-side-title", text: "Preview" }), preview)),
    h(
      "details",
      { class: "card editor-guide" },
      h("summary", null, icon("bulb", { size: 16 }), "Format guide"),
      h("table", { class: "table table-compact" }, h("tbody", null, GUIDE.map(([syntax, meaning]) => h("tr", null, h("td", null, h("code", { text: syntax })), h("td", { text: meaning }))))),
      h("p", { class: "muted small" }, "Course JSON works here too, with every step type (including API design and architecture builds). The full schema is in ", h("code", { text: "subjects/README.md" }), ".")
    )
  );

  paintPreview();
  requestAnimationFrame(() => {
    if (!courseId) {
      area.focus();
    }
  });
  return () => clearTimeout(previewTimer);
}
