// Library: every course, and the one-step ways to add more. Drop a file
// anywhere on the window, pick one, paste plain-text notes (previewed live),
// or put files in the courses folder so they load on every launch.

import { h } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { button, chip, meter, pageHead, plural } from "../components.js";
import { catalog, removeImportedCourse } from "../../state/catalog.js";
import { courseStats } from "../../state/learner.js";
import { parseCourseSource, normalizeCourse } from "../../domain/courseFormat.js";
import { importFromDialog, importText, openCoursesFolder, copyText } from "../../io/io.js";
import { navigate, refresh } from "../router.js";
import { toast } from "../toast.js";

const SAMPLE = `# Networking basics
## Ports and protocols
Q: Which port does HTTPS use by default?
- 80
* 443
- 22
Why: 443 is HTTPS; 80 is plain HTTP; 22 is SSH.

Q: What does DNS do?
A: Resolves a domain name to an IP address.

> A concept card: lines starting with > teach before you ask.`;

let pasteOpen = false;
let pasteText = "";

export function renderLibrary(root) {
  const page = h("div", { class: "page" });
  root.append(page);
  const { courses, errors } = catalog();

  page.append(pageHead({ eyebrow: "Library", title: "Courses", sub: "Built-in courses load from the courses folder automatically. Adding your own takes one step." }));
  page.append(addPanel());

  if (errors.length) {
    page.append(h("div", { class: "callout callout-bad" }, icon("alert"), h("div", null, h("strong", { text: "Some course files couldn't be read:" }), h("ul", null, errors.map((error) => h("li", { text: `${error.path}: ${error.error}` }))))));
  }

  page.append(
    h(
      "div",
      { class: "library-grid" },
      courses.map((course) => {
        const stats = courseStats(course.id);
        return h(
          "article",
          { class: "library-card", style: { "--course": course.color } },
          h("div", { class: "library-stripe" }),
          h(
            "div",
            { class: "library-body" },
            h("div", { class: "library-meta" }, chip(course.source === "builtin" ? "Built-in" : "Added by you", { tone: course.source === "builtin" ? "accent" : null }), course.fileName && h("span", { class: "muted small", text: course.fileName })),
            h("h3", { class: "library-title", text: course.title }),
            (course.tagline || course.description) && h("p", { class: "library-desc", text: course.tagline || course.description }),
            h("p", { class: "muted small", text: [plural(course.unitKeys.length, "unit"), plural(stats.total, "lesson"), stats.labsTotal && plural(stats.labsTotal, "project")].filter(Boolean).join(" · ") }),
            h("div", { class: "library-progress" }, meter(stats.progress, { label: "Progress" }), h("span", { class: "muted small", text: `${stats.done}/${stats.total}` })),
            h(
              "div",
              { class: "library-actions" },
              button(stats.done ? "Continue" : "Open", { variant: "go", size: "sm", onClick: () => navigate("course", course.id) }),
              course.source !== "builtin" &&
                button("", {
                  variant: "ghost",
                  size: "sm",
                  iconName: "trash",
                  title: "Remove course and its progress",
                  onClick: () => {
                    if (window.confirm(`Remove “${course.title}” and all its progress?`)) {
                      removeImportedCourse(course.id);
                      toast(`Removed “${course.title}”.`);
                      refresh();
                    }
                  }
                })
            )
          )
        );
      })
    )
  );
}

function addPanel() {
  const preview = h("p", { class: "paste-preview muted small" });
  const area = h("textarea", {
    class: "input paste-area",
    rows: 10,
    spellcheck: "false",
    placeholder: SAMPLE,
    value: pasteText,
    "aria-label": "Paste course text",
    onInput: (event) => {
      pasteText = event.target.value;
      updatePreview();
    }
  });
  const updatePreview = () => {
    if (!pasteText.trim()) {
      preview.textContent = "Paste plain-text Q/A notes or course JSON. A preview appears here.";
      return;
    }
    try {
      const course = normalizeCourse(parseCourseSource(pasteText, "pasted notes"));
      const lessons = course.units.reduce((sum, unit) => sum + unit.lessons.length, 0);
      const steps = course.units.reduce((sum, unit) => sum + unit.lessons.reduce((inner, lesson) => inner + lesson.steps.length, 0), 0);
      preview.textContent = `✓ “${course.title}” — ${plural(lessons, "lesson")}, ${plural(steps, "step")}${course.projects.length ? `, ${plural(course.projects.length, "project")}` : ""}.`;
      preview.className = "paste-preview is-ok small";
    } catch (error) {
      preview.textContent = error.message;
      preview.className = "paste-preview is-bad small";
    }
  };
  updatePreview();

  return h(
    "section",
    { class: "add-panel" },
    h(
      "div",
      { class: "dropzone" },
      h("span", { class: "dropzone-icon" }, icon("upload", { size: 26 })),
      h(
        "div",
        { class: "dropzone-text" },
        h("strong", { text: "Drop a course file anywhere on this window" }),
        h("span", { text: "Course JSON, an older test file, or plain-text Q/A notes (.txt / .md)." })
      ),
      h(
        "div",
        { class: "dropzone-actions" },
        button("Choose file…", { variant: "go", iconName: "folder", onClick: async () => { const course = await importFromDialog(); if (course) navigate("course", course.id); } }),
        button(pasteOpen ? "Hide paste" : "Paste notes", { iconName: "copy", onClick: () => { pasteOpen = !pasteOpen; refresh(); } }),
        button("Courses folder", { variant: "ghost", iconName: "folder", title: "Files here load automatically on every launch", onClick: openCoursesFolder })
      )
    ),
    pasteOpen &&
      h(
        "div",
        { class: "paste-panel" },
        area,
        h(
          "div",
          { class: "paste-foot" },
          preview,
          h(
            "div",
            { class: "row-gap" },
            button("Copy example", { variant: "ghost", size: "sm", onClick: () => copyText(SAMPLE, "Example copied — paste it and edit.") }),
            button("Create course", {
              variant: "go",
              onClick: () => {
                const course = importText(pasteText, "pasted notes");
                if (course) {
                  pasteText = "";
                  pasteOpen = false;
                  navigate("course", course.id);
                }
              }
            })
          )
        ),
        h("p", { class: "muted small" }, "Format: ", h("code", { text: "# Title" }), " · ", h("code", { text: "## Lesson" }), " · ", h("code", { text: "Q:" }), " question · ", h("code", { text: "- wrong" }), " / ", h("code", { text: "* right" }), " options · ", h("code", { text: "A:" }), " typed answer · ", h("code", { text: "Why:" }), " explanation · ", h("code", { text: ">" }), " concept card. Full guide: ", h("code", { text: "courses/README.md" }), ".")
      )
  );
}

