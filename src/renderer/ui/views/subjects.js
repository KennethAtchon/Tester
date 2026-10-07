// Subjects: every subject as a card, plus one page per subject with its
// courses, its Design Lab projects, and the ways to add a course. Learners
// manage their own subjects here too (there are no accounts yet, so the
// learner is also the author): create one from a preset or from scratch,
// edit it, move courses between subjects, or delete it.

import { h } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { button, chip, meter, pageHead, plural, openDialog, emptyState } from "../components.js";
import { catalog, getSubject, coursesIn, currentSubjectId, setCurrentSubject, createSubject, updateSubject, deleteSubject, moveCourse, removeCourse } from "../../state/catalog.js";
import { subjectStats, subjectNextLesson, courseStats } from "../../state/learner.js";
import { lessonPlay } from "../../state/sessions.js";
import { SUBJECT_PRESETS, SUBJECT_ICONS, SUBJECT_COLORS } from "../../domain/subjects.js";
import { importFromDialog, openContentFolder } from "../../io/io.js";
import { startPlay } from "../player.js";
import { navigate, refresh, href } from "../router.js";
import { toast } from "../toast.js";
import { projectCard } from "./lab.js";

// ── all subjects ────────────────────────────────────────────────────────────

export function renderSubjects(root) {
  const page = h("div", { class: "page" });
  root.append(page);
  const { subjects, errors } = catalog();
  const current = currentSubjectId();

  page.append(pageHead({ eyebrow: "Subjects", title: "What are you learning?", sub: "Each subject has its own courses, path, and progress. Switch any time, or add your own." }));

  if (errors.length) {
    page.append(h("div", { class: "callout callout-bad" }, icon("alert"), h("div", null, h("strong", { text: "Some content couldn't be read:" }), h("ul", null, errors.map((error) => h("li", { text: `${error.path}: ${error.error}` }))))));
  }

  page.append(
    h(
      "div",
      { class: "subject-grid" },
      subjects.map((subject) => subjectCard(subject, { current: subject.id === current })),
      h(
        "button",
        { type: "button", class: "subject-card is-new", onClick: () => subjectDialog() },
        h("span", { class: "subject-new-icon" }, icon("plus", { size: 26 })),
        h("strong", { text: "New subject" }),
        h("span", { class: "muted small", text: "Math, science, a language — anything you want to learn." })
      )
    )
  );
}

export function subjectBadge(subject, { size = 22 } = {}) {
  return h("span", { class: "subject-badge", style: { "--subject": subject.color } }, icon(subject.icon, { size }));
}

function subjectCard(subject, { current }) {
  const stats = subjectStats(subject.id);
  return h(
    "a",
    { class: "subject-card", href: href("subject", subject.id), style: { "--subject": subject.color } },
    h("div", { class: "subject-card-top" }, subjectBadge(subject, { size: 26 }), current && h("span", { class: "subject-current", text: "Studying" })),
    h("strong", { class: "subject-card-title", text: subject.title }),
    subject.description && h("p", { class: "subject-card-desc", text: subject.description }),
    h("div", { class: "subject-card-foot" }, stats.total ? [meter(stats.progress, { label: `${subject.title} progress` }), h("span", { class: "muted small", text: `${plural(stats.courses, "course")} · ${stats.done}/${stats.total} lessons` })] : h("span", { class: "muted small", text: stats.courses ? plural(stats.courses, "course") : "No courses yet" }))
  );
}

// ── one subject ─────────────────────────────────────────────────────────────

export function renderSubject(root, [subjectId]) {
  const subject = getSubject(subjectId);
  const page = h("div", { class: "page subject-page" });
  root.append(page);
  if (!subject) {
    page.append(emptyState({ iconName: "grid", title: "That subject isn't here", body: "It may have been deleted.", actions: [button("All subjects", { variant: "go", onClick: () => navigate("subjects") })] }));
    return;
  }

  const stats = subjectStats(subject.id);
  const next = subjectNextLesson(subject.id);
  const isCurrent = subject.id === currentSubjectId();
  const courses = coursesIn(subject.id);
  const projects = courses.flatMap((course) => course.projectKeys);
  const returnTo = `subject/${subject.id}`;

  page.append(
    h("a", { class: "back-link", href: href("subjects") }, icon("arrowLeft", { size: 16 }), "All subjects"),
    h(
      "header",
      { class: "subject-hero", style: { "--course": subject.color } },
      h("span", { class: "subject-hero-icon" }, icon(subject.icon, { size: 30 })),
      h(
        "div",
        { class: "subject-hero-text" },
        h("p", { class: "eyebrow", text: subject.source === "user" ? "Your subject" : "Subject" }),
        h("h1", { class: "course-title", text: subject.title }),
        subject.description && h("p", { class: "course-tagline", text: subject.description }),
        stats.total > 0 && h("div", { class: "course-progress" }, meter(stats.progress, { tone: "light", label: "Subject progress" }), h("span", { text: [plural(stats.courses, "course"), `${stats.done}/${stats.total} lessons`, stats.projects && plural(stats.projects, "project")].filter(Boolean).join(" · ") })),
        h(
          "div",
          { class: "course-actions" },
          next &&
            button(stats.done ? "Continue" : "Start", {
              variant: "light",
              size: "lg",
              iconName: "play2",
              onClick: () => {
                setCurrentSubject(subject.id);
                startPlay(lessonPlay(next.lessonKey), { returnTo });
              }
            }),
          isCurrent
            ? h("span", { class: "subject-studying" }, icon("check", { size: 16 }), "You're studying this")
            : button("Study this subject", { variant: next ? "ghost-light" : "light", iconName: "target", onClick: () => { setCurrentSubject(subject.id); toast(`Now studying ${subject.title}. Home and your games follow it.`); refresh(); } }),
          subject.source === "user" && button("Edit", { variant: "ghost-light", iconName: "pencil", onClick: () => subjectDialog(subject) })
        )
      )
    )
  );

  if (courses.length === 0) {
    page.append(
      h(
        "section",
        { class: "subject-empty" },
        h("h2", { class: "unit-title", text: "Add your first course" }),
        h("p", { class: "muted", text: `${subject.title} is empty. Write a course right here, or bring in one you already have.` }),
        addOptions(subject)
      )
    );
    return;
  }

  page.append(
    h(
      "section",
      { class: "subject-section" },
      h("div", { class: "section-head" }, h("h2", { text: "Courses" }), button("Write a course", { variant: "ghost", size: "sm", iconName: "pencil", onClick: () => navigate("write", subject.id) })),
      h("div", { class: "course-card-grid" }, courses.map((course) => courseCard(course, subject)))
    )
  );

  if (projects.length) {
    page.append(
      h(
        "section",
        { class: "subject-section" },
        h("div", { class: "section-head" }, h("h2", { text: "Design Lab" }), h("a", { class: "section-link", href: href("lab") }, "All projects", icon("arrowRight", { size: 14 }))),
        h("div", { class: "project-grid" }, projects.map((key) => projectCard(catalog().lessons.get(key), { returnTo })))
      )
    );
  }

  page.append(
    h(
      "section",
      { class: "subject-section" },
      h("div", { class: "section-head" }, h("h2", { text: `Add to ${subject.title}` })),
      addOptions(subject)
    )
  );
}

function addOptions(subject) {
  const option = (iconName, title, text, onClick) => h("button", { type: "button", class: "add-option", onClick }, h("span", { class: "add-option-icon" }, icon(iconName, { size: 22 })), h("strong", { text: title }), h("span", { text }));
  return h(
    "div",
    { class: "add-options" },
    option("pencil", "Write a course", "Type lessons in plain text: questions, numbers, sorting, matching. See it take shape as you go.", () => navigate("write", subject.id)),
    option("upload", "Import a file", "Course JSON, an older test file, or .txt / .md notes.", async () => {
      const course = await importFromDialog({ subjectId: subject.id });
      if (course) {
        navigate("course", course.id);
      }
    }),
    h(
      "div",
      { class: "add-option is-static" },
      h("span", { class: "add-option-icon" }, icon("folder", { size: 22 })),
      h("strong", { text: "Drop a file anywhere" }),
      h("span", null, `While this page is open, dropped files join ${subject.title}. Built-in content lives in the `, h("button", { type: "button", class: "link-btn", onClick: openContentFolder }, "subjects folder"), ".")
    )
  );
}

function courseCard(course, subject) {
  const stats = courseStats(course.id);
  const mine = course.source === "user";
  return h(
    "article",
    { class: "course-card", style: { "--course": course.color } },
    h("div", { class: "library-stripe" }),
    h(
      "div",
      { class: "library-body" },
      h("div", { class: "library-meta" }, chip(mine ? "Yours" : "Built-in", { tone: mine ? null : "accent" }), course.fileName && h("span", { class: "muted small", text: course.fileName })),
      h("h3", { class: "library-title" }, h("a", { href: href("course", course.id), text: course.title })),
      (course.tagline || course.description) && h("p", { class: "library-desc", text: course.tagline || course.description }),
      h("p", { class: "muted small", text: [plural(course.unitKeys.length, "unit"), plural(stats.total, "lesson"), stats.labsTotal && plural(stats.labsTotal, "project")].filter(Boolean).join(" · ") }),
      stats.total > 0 && h("div", { class: "library-progress" }, meter(stats.progress, { label: "Progress" }), h("span", { class: "muted small", text: `${stats.done}/${stats.total}` })),
      h(
        "div",
        { class: "library-actions" },
        button(stats.done ? "Continue" : "Open", { variant: "go", size: "sm", onClick: () => { setCurrentSubject(subject.id); navigate("course", course.id); } }),
        mine && button("Edit", { variant: "ghost", size: "sm", iconName: "pencil", onClick: () => navigate("write", subject.id, course.id) }),
        mine && button("", { variant: "ghost", size: "sm", iconName: "move", title: "Move to another subject", onClick: () => moveDialog(course, subject) }),
        mine &&
          button("", {
            variant: "ghost",
            size: "sm",
            iconName: "trash",
            title: "Remove course and its progress",
            onClick: () => {
              if (window.confirm(`Remove “${course.title}” and all its progress? This can't be undone.`)) {
                removeCourse(course.id);
                toast(`Removed “${course.title}”.`);
                refresh();
              }
            }
          })
      )
    )
  );
}

function moveDialog(course, from) {
  const targets = catalog().subjects.filter((subject) => subject.id !== from.id);
  const body = targets.length
    ? h(
        "div",
        { class: "move-list" },
        targets.map((subject) =>
          h(
            "button",
            {
              type: "button",
              class: "move-option",
              onClick: () => {
                moveCourse(course.id, subject.id);
                dialog.close();
                toast(`Moved “${course.title}” to ${subject.title}.`);
                refresh();
              }
            },
            subjectBadge(subject, { size: 18 }),
            h("span", { text: subject.title })
          )
        )
      )
    : h("p", { class: "muted", text: "There's no other subject yet. Create one first." });
  const dialog = openDialog({ title: `Move “${course.title}”`, body, actions: [button("New subject…", { variant: "ghost", iconName: "plus", onClick: () => { dialog.close(); subjectDialog(null, { thenMove: course }); } })] });
}

// ── create / edit a subject ─────────────────────────────────────────────────

// subject: an existing user subject to edit, or null to create one.
// onCreate(id) runs after creating (default: open the new subject's page).
export function subjectDialog(subject = null, { onCreate = null, thenMove = null } = {}) {
  const draft = subject ? { title: subject.title, description: subject.description, icon: subject.icon, color: subject.color } : { title: "", description: "", icon: "book", color: SUBJECT_COLORS[1] };

  const preview = h("div", { class: "subject-preview" });
  const paintPreview = () => {
    preview.replaceChildren(subjectBadge({ icon: draft.icon, color: draft.color }, { size: 26 }), h("div", null, h("strong", { text: draft.title || "Subject name" }), h("span", { class: "muted small", text: draft.description || "A short description (optional)" })));
  };

  const title = h("input", { type: "text", class: "input", placeholder: "e.g. Chemistry", value: draft.title, maxlength: 40, "aria-label": "Subject name", onInput: (event) => { draft.title = event.target.value; paintPreview(); sync(); } });
  const description = h("textarea", { class: "input", rows: 2, placeholder: "What it covers (optional)", value: draft.description, maxlength: 160, "aria-label": "Description", onInput: (event) => { draft.description = event.target.value; paintPreview(); } });

  const iconRow = h("div", { class: "icon-picker", role: "radiogroup", "aria-label": "Icon" });
  const colorRow = h("div", { class: "color-picker", role: "radiogroup", "aria-label": "Color" });
  const paintPickers = () => {
    iconRow.replaceChildren(...SUBJECT_ICONS.map((name) => h("button", { type: "button", role: "radio", "aria-checked": String(draft.icon === name), "aria-label": name, class: ["icon-choice", draft.icon === name && "is-selected"], onClick: () => { draft.icon = name; paintPickers(); paintPreview(); } }, icon(name, { size: 18 }))));
    colorRow.replaceChildren(...SUBJECT_COLORS.map((color) => h("button", { type: "button", role: "radio", "aria-checked": String(draft.color === color), "aria-label": color, class: ["color-choice", draft.color === color && "is-selected"], style: { "--swatch": color }, onClick: () => { draft.color = color; paintPickers(); paintPreview(); } })));
  };

  const presets = !subject &&
    h(
      "div",
      { class: "preset-row" },
      SUBJECT_PRESETS.map((preset) =>
        h(
          "button",
          {
            type: "button",
            class: "preset",
            style: { "--swatch": preset.color },
            onClick: () => {
              Object.assign(draft, { title: preset.title, description: preset.description, icon: preset.icon, color: preset.color });
              title.value = draft.title;
              description.value = draft.description;
              paintPickers();
              paintPreview();
              sync();
            }
          },
          icon(preset.icon, { size: 15 }),
          preset.title
        )
      )
    );

  const save = button(subject ? "Save" : "Create subject", {
    variant: "go",
    onClick: () => {
      const name = draft.title.trim();
      if (!name) {
        title.focus();
        return;
      }
      if (subject) {
        updateSubject(subject.id, { title: name, description: draft.description.trim(), icon: draft.icon, color: draft.color });
        dialog.close();
        toast(`Saved ${name}.`, { tone: "success" });
        refresh();
        return;
      }
      const id = createSubject({ title: name, description: draft.description, icon: draft.icon, color: draft.color });
      dialog.close();
      if (thenMove) {
        moveCourse(thenMove.id, id);
        toast(`Created ${name} and moved “${thenMove.title}” into it.`, { tone: "success" });
        refresh();
      } else if (onCreate) {
        onCreate(id);
      } else {
        toast(`Created ${name}. Add a course to get started.`, { tone: "success" });
        navigate("subject", id);
      }
    }
  });
  const sync = () => {
    save.disabled = !draft.title.trim();
  };

  const actions = [save];
  if (subject) {
    actions.unshift(
      button("Delete subject", {
        variant: "ghost",
        iconName: "trash",
        className: "dialog-danger",
        onClick: () => {
          const count = coursesIn(subject.id).length;
          if (window.confirm(`Delete ${subject.title}${count ? ` and its ${plural(count, "course")}, with all their progress` : ""}? This can't be undone.`)) {
            deleteSubject(subject.id);
            dialog.close();
            toast(`Deleted ${subject.title}.`);
            navigate("subjects");
          }
        }
      })
    );
  }

  const body = h(
    "form",
    { class: "subject-form", onSubmit: (event) => { event.preventDefault(); save.click(); } },
    preview,
    presets && h("div", { class: "field" }, h("span", { class: "field-label", text: "Start from" }), presets),
    h("label", { class: "field" }, h("span", { class: "field-label", text: "Name" }), title),
    h("label", { class: "field" }, h("span", { class: "field-label", text: "Description" }), description),
    h("div", { class: "field" }, h("span", { class: "field-label", text: "Icon" }), iconRow),
    h("div", { class: "field" }, h("span", { class: "field-label", text: "Color" }), colorRow)
  );

  paintPreview();
  paintPickers();
  sync();
  const dialog = openDialog({ title: subject ? `Edit ${subject.title}` : "New subject", body, actions, className: "subject-dialog" });
  return dialog;
}
