// Mistake notebook (a Progress tab): every miss with what you answered, the
// right answer, and why — plus the wrong options you keep picking, and a drill
// built from open entries. An entry clears when you get it right on a later day.

import { h } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { button, card, chip, emptyState, plural } from "../components.js";
import { rich } from "../../lib/markup.js";
import { getItem, getLesson } from "../../state/catalog.js";
import { progress } from "../../state/progress.js";
import { reviewPlay } from "../../state/sessions.js";
import { CONFIDENCE_LEVELS, misconceptionFor, choiceAnswers } from "../../domain/grading.js";
import { formatAgo } from "../../lib/time.js";
import { stepPrompt, answerSummary, TYPE_LABELS } from "../exercises/index.js";
import { startPlay } from "../player.js";

const FILTERS = [
  { id: "open", label: "Open", test: (mistake) => !mistake.resolvedAt },
  { id: "hyper", label: "Confident misses", test: (mistake) => mistake.hyper },
  { id: "resolved", label: "Fixed", test: (mistake) => Boolean(mistake.resolvedAt) },
  { id: "all", label: "All", test: () => true }
];

let activeFilter = "open";

export function mistakesPanel(rerender) {
  const panel = h("div", { class: "panel" });
  const all = Object.values(progress().mistakes).filter((mistake) => getItem(mistake.item));
  const open = all.filter((mistake) => !mistake.resolvedAt);

  panel.append(
    h(
      "div",
      { class: "panel-head" },
      h("p", { class: "muted", text: "Every miss with its reason. Drilling your own mistakes is the most targeted practice there is." }),
      button(open.length ? `Drill open mistakes (${open.length})` : "Drill open mistakes", { variant: "go", iconName: "target", disabled: open.length === 0, onClick: () => startPlay(reviewPlay({ kind: "mistakes" }), { returnTo: "progress/mistakes" }) })
    )
  );

  if (all.length === 0) {
    panel.append(emptyState({ iconName: "notebook", title: "No mistakes yet", body: "Misses from lessons, reviews, and games land here with the right answer and why." }));
    return panel;
  }

  const confusions = topConfusions();
  if (confusions.length > 0) {
    panel.append(
      card(
        { title: "Your top confusions", sub: "Wrong options you've picked more than once usually point at one specific misconception." },
        h(
          "ul",
          { class: "confusion-list" },
          confusions.map((entry) =>
            h(
              "li",
              { class: "confusion" },
              h("span", { class: "confusion-count", text: `×${entry.count}` }),
              h("div", null, h("p", { class: "confusion-pick" }, "Picked ", h("strong", { text: `“${entry.option}”` }), entry.correct ? [" instead of ", h("strong", { text: `“${entry.correct}”` })] : null), h("p", { class: "muted small", text: entry.prompt }), entry.note && h("p", { class: "confusion-note", text: entry.note }))
            )
          )
        )
      )
    );
  }

  panel.append(
    h(
      "div",
      { class: "filter-bar", role: "tablist" },
      FILTERS.map((filter) =>
        h(
          "button",
          { type: "button", role: "tab", "aria-selected": String(activeFilter === filter.id), class: ["filter", activeFilter === filter.id && "is-active"], onClick: () => { activeFilter = filter.id; rerender(); } },
          filter.label,
          h("span", { class: "filter-count", text: String(all.filter(filter.test).length) })
        )
      )
    )
  );

  const visible = all.filter(FILTERS.find((filter) => filter.id === activeFilter).test).sort((a, b) => b.lastTs - a.lastTs);
  panel.append(visible.length ? h("div", { class: "mistake-list" }, visible.map(mistakeCard)) : h("p", { class: "muted", text: "Nothing in this view." }));
  return panel;
}

function mistakeCard(mistake) {
  const item = getItem(mistake.item);
  const step = item.step;
  const lesson = getLesson(item.lessonKey);
  const yours = mistake.revealed ? "(asked to see the answer)" : mistake.chosen?.length ? mistake.chosen.join("; ") : mistake.response || "(blank)";
  const notes = (mistake.chosen || []).map((option) => misconceptionFor(step, option)).filter(Boolean);
  const confidence = mistake.confidence ? CONFIDENCE_LEVELS[mistake.confidence - 1]?.label : null;

  return h(
    "article",
    { class: ["mistake", mistake.resolvedAt && "is-resolved", mistake.hyper && "is-hyper"] },
    h(
      "div",
      { class: "mistake-meta" },
      chip(lesson?.title || "Lesson"),
      chip(TYPE_LABELS[step.type]),
      mistake.hyper && chip("confident miss", { tone: "bad", iconName: "alert" }),
      confidence && chip(`you said: ${confidence}`),
      mistake.count > 1 && chip(`missed ${plural(mistake.count, "time")}`),
      h("span", { class: "mistake-when", text: formatAgo(mistake.lastTs) })
    ),
    h("h3", { class: "mistake-prompt", text: stepPrompt(step) }),
    h(
      "div",
      { class: "compare" },
      h("div", { class: "compare-col" }, h("div", { class: "compare-label", text: "You answered" }), h("p", { class: "compare-text", text: yours })),
      h("div", { class: "compare-col is-model" }, h("div", { class: "compare-label", text: "Answer" }), h("p", { class: "compare-text", text: answerSummary(step) || "—" }))
    ),
    notes.map((note) => h("p", { class: "mistake-note" }, h("strong", { text: "Why not: " }), note)),
    step.why && h("div", { class: "mistake-why rich" }, rich(step.why)),
    h("p", { class: "mistake-status" }, mistake.resolvedAt ? [icon("check", { size: 15 }), `Fixed ${formatAgo(mistake.resolvedAt)} — right on a later day.`] : [icon("clock", { size: 15 }), "Open — clears when you get it right on a later day."])
  );
}

function topConfusions() {
  const counts = new Map();
  for (const entry of progress().log) {
    if (entry.correct || !entry.chosen) {
      continue;
    }
    const item = getItem(entry.item);
    const answers = item && item.step.type === "choice" ? choiceAnswers(item.step) : null;
    if (!answers) {
      continue;
    }
    for (const option of entry.chosen) {
      if (answers.includes(option)) {
        continue;
      }
      const id = `${entry.item}\u0000${option}`;
      const existing = counts.get(id) || { count: 0, option, prompt: stepPrompt(item.step), correct: answers.length === 1 ? answers[0] : null, note: misconceptionFor(item.step, option) };
      existing.count += 1;
      counts.set(id, existing);
    }
  }
  return [...counts.values()].filter((entry) => entry.count > 1).sort((a, b) => b.count - a.count).slice(0, 5);
}
