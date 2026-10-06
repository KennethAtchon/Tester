// Mistake notebook: every miss with what you answered, the right answer, and
// why — plus your most common confusions (which wrong option you keep picking)
// and a deliberate-practice drill built from the open entries. An entry
// resolves when you get the item right on a later day.

import { h } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { button, card, pageHead, chip, emptyState, plural } from "../components.js";
import { getItem } from "../../state/catalog.js";
import { progress } from "../../state/progress.js";
import { keyFor } from "../../state/learner.js";
import { buildSession } from "../../state/sessions.js";
import { CONFIDENCE_LEVELS, misconceptionFor } from "../../domain/grading.js";
import { formatAgo } from "../../lib/time.js";
import { startSession } from "./session.js";

const FILTERS = [
  { id: "open", label: "Open", test: (mistake) => !mistake.resolvedAt },
  { id: "hyper", label: "Confident misses", test: (mistake) => mistake.hyper },
  { id: "resolved", label: "Resolved", test: (mistake) => Boolean(mistake.resolvedAt) },
  { id: "all", label: "All", test: () => true }
];

let activeFilter = "open";

export function renderMistakes(root) {
  const page = h("div", { class: "page" });
  root.append(page);

  const all = Object.values(progress().mistakes).filter((mistake) => getItem(mistake.item));
  const open = all.filter((mistake) => !mistake.resolvedAt);

  page.append(
    pageHead({
      eyebrow: "Notebook",
      title: "Mistakes",
      sub: "Each error with its reason. Drilling your own mistakes is the most targeted practice there is.",
      actions: [
        button(open.length ? `Drill open mistakes (${open.length})` : "Drill open mistakes", {
          variant: "primary",
          iconName: "target",
          disabled: open.length === 0,
          onClick: () => startSession(buildSession("mistakes"))
        })
      ]
    })
  );

  if (all.length === 0) {
    page.append(emptyState({ iconName: "notebook", title: "No mistakes yet", body: "Misses from your sessions land here automatically, with the right answer and why. A blank notebook early on usually means the material is too easy." }));
    return;
  }

  const confusions = topConfusions();
  if (confusions.length > 0) {
    page.append(
      card(
        { title: "Your top confusions", sub: "Wrong options you've picked — each one usually points at a specific misconception." },
        h(
          "ul",
          { class: "confusion-list" },
          confusions.map((entry) =>
            h(
              "li",
              { class: "confusion" },
              h("span", { class: "confusion-count", text: `×${entry.count}` }),
              h(
                "div",
                null,
                h("p", { class: "confusion-pick" }, "Picked ", h("strong", { text: `“${entry.option}”` }), entry.correct ? [" instead of ", h("strong", { text: `“${entry.correct}”` })] : null),
                h("p", { class: "muted small", text: entry.prompt }),
                entry.note && h("p", { class: "confusion-note", text: entry.note })
              )
            )
          )
        )
      )
    );
  }

  const filterBar = h(
    "div",
    { class: "filter-bar", role: "tablist", "aria-label": "Filter mistakes" },
    FILTERS.map((filter) => {
      const count = all.filter(filter.test).length;
      return h(
        "button",
        {
          type: "button",
          role: "tab",
          "aria-selected": String(activeFilter === filter.id),
          class: ["filter", activeFilter === filter.id && "is-active"],
          onClick: () => {
            activeFilter = filter.id;
            root.replaceChildren();
            renderMistakes(root);
          }
        },
        filter.label,
        h("span", { class: "filter-count", text: String(count) })
      );
    })
  );
  page.append(filterBar);

  const filter = FILTERS.find((entry) => entry.id === activeFilter);
  const visible = all.filter(filter.test).sort((a, b) => b.lastTs - a.lastTs);

  if (visible.length === 0) {
    page.append(h("p", { class: "muted", text: "Nothing in this view." }));
    return;
  }

  page.append(h("div", { class: "mistake-list" }, visible.map(mistakeCard)));
}

function mistakeCard(mistake) {
  const item = getItem(mistake.item);
  const question = item.question;
  const key = keyFor(item);
  const correctAnswer = key.choice ? key.choice.join("; ") : key.text || (key.rubric.length ? key.rubric.join(" · ") : null);
  const yours = mistake.revealed ? "(revealed the answer)" : mistake.chosen?.length ? mistake.chosen.join("; ") : mistake.response || "(blank)";
  const notes = (mistake.chosen || []).map((option) => misconceptionFor(question, option)).filter(Boolean);
  const confidence = mistake.confidence ? CONFIDENCE_LEVELS[mistake.confidence - 1]?.label : null;

  return h(
    "article",
    { class: ["mistake", mistake.resolvedAt && "is-resolved", mistake.hyper && "is-hyper"] },
    h(
      "div",
      { class: "mistake-meta" },
      h("a", { class: "chip chip-link", href: `#/skill/${encodeURIComponent(item.skillKey)}`, text: item.skillTitle }),
      mistake.hyper && chip("confident miss", { tone: "bad", iconName: "alert" }),
      confidence && chip(`you said: ${confidence}`),
      mistake.count > 1 && chip(`missed ${plural(mistake.count, "time")}`),
      h("span", { class: "mistake-when", text: formatAgo(mistake.lastTs) })
    ),
    h("h3", { class: "mistake-prompt", text: question.prompt }),
    h(
      "div",
      { class: "compare" },
      h("div", { class: "compare-col" }, h("div", { class: "compare-label", text: "You answered" }), h("p", { class: "compare-text", text: yours })),
      h("div", { class: "compare-col is-model" }, h("div", { class: "compare-label", text: key.choice ? "Correct" : key.text ? "Model answer" : key.rubric.length ? "A full answer covers" : "Answer" }), h("p", { class: "compare-text", text: correctAnswer || "No answer key in the file." }))
    ),
    notes.map((note) => h("p", { class: "mistake-note" }, h("strong", { text: "Misconception: " }), note)),
    question.why && h("p", { class: "mistake-why" }, h("strong", { text: "Why: " }), question.why),
    h(
      "p",
      { class: "mistake-status" },
      mistake.resolvedAt
        ? [icon("check", { size: 15 }), `Resolved ${formatAgo(mistake.resolvedAt)} — recalled correctly on a later day.`]
        : [icon("clock", { size: 15 }), "Open — resolves when you get it right on a later day."]
    )
  );
}

// Aggregates (item, wrong option) picks across the whole log.
function topConfusions() {
  const counts = new Map();
  for (const entry of progress().log) {
    if (entry.correct || !entry.chosen) {
      continue;
    }
    const item = getItem(entry.item);
    if (!item) {
      continue;
    }
    const key = keyFor(item);
    if (!key.choice) {
      continue;
    }
    for (const option of entry.chosen) {
      if (key.choice.includes(option)) {
        continue;
      }
      const id = `${entry.item}\u0000${option}`;
      const existing = counts.get(id) || {
        count: 0,
        option,
        prompt: item.question.prompt,
        correct: item.question.type === "multiple_choice" ? null : key.choice[0],
        note: misconceptionFor(item.question, option)
      };
      existing.count += 1;
      counts.set(id, existing);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 5);
}
