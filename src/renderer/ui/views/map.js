// Skill map + skill detail. The map shows every enrolled library as a grid of
// skills shaded by mastery, with prerequisite locks (overridable —
// autonomy beats forced funnels), a placement check for new libraries, and a
// capstone gated by mastery. The detail page shows one skill's items.

import { h } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { button, card, pageHead, pct, chip, emptyState, shadeByMastery, masteryLabel, statTile, meter } from "../components.js";
import { catalog, getSkill, removeLibrary } from "../../state/catalog.js";
import { progress } from "../../state/progress.js";
import { skillStats, libraryStats, UNLOCK_THRESHOLD, masteryOf, unlockSkill } from "../../state/learner.js";
import { retrievability } from "../../domain/fsrs.js";
import { formatDue, formatAgo } from "../../lib/time.js";
import { buildSession } from "../../state/sessions.js";
import { formatExampleName } from "../../lib/util.js";
import { startSession } from "./session.js";
import { href, refresh, navigate } from "../router.js";
import { importFromDisk, importSample, importExample, listExamples, enrolledFileNames } from "../../io/io.js";
import { toast } from "../toast.js";

export function renderMap(root) {
  const page = h("div", { class: "page" });
  root.append(page);

  const addActions = [
    button("Open JSON…", { iconName: "folder", onClick: async () => (await importFromDisk()) && refresh() }),
    button("Sample", { variant: "ghost", iconName: "sparkle", onClick: async () => (await importSample()) && refresh() })
  ];

  page.append(pageHead({ eyebrow: "Library", title: "Skill map", sub: "Each tile is a skill. Shading shows mastery — how much of it you could recall right now.", actions: addActions }));

  const examples = h("div", { class: "example-strip" });
  page.append(examples);
  listExamples().then((files) => {
    const enrolled = enrolledFileNames();
    const available = files.filter((fileName) => !enrolled.has(fileName));
    if (available.length === 0) {
      examples.remove();
      return;
    }
    examples.append(
      h("span", { class: "example-strip-label", text: "Add an example:" }),
      ...available.map((fileName) =>
        button(formatExampleName(fileName), { size: "sm", variant: "ghost", iconName: "plus", onClick: async () => (await importExample(fileName)) && refresh() })
      )
    );
  });

  const libraries = catalog().libraries;
  if (libraries.length === 0) {
    page.append(emptyState({ iconName: "map", title: "No libraries yet", body: "Open a test library JSON, or add one of the examples above." }));
    return;
  }

  for (const broken of catalog().broken) {
    page.append(h("div", { class: "callout callout-bad" }, icon("alert"), h("div", { text: `Couldn't read library “${broken.key}”: ${broken.error}` })));
  }

  for (const library of libraries) {
    page.append(librarySection(library));
  }

  page.append(
    h(
      "div",
      { class: "legend-row", "aria-hidden": "true" },
      h("span", { text: "Mastery" }),
      [0, 0.25, 0.5, 0.75, 1].map((value) => shadeByMastery(h("span", { class: "legend-swatch" }), value)),
      h("span", { text: "0% → 100%" })
    )
  );
}

function librarySection(library) {
  const stats = libraryStats(library.key);
  const actions = [
    button("Practice mix", { variant: "primary", size: "sm", iconName: "layers", title: "Interleaved across every skill", onClick: () => startSession(buildSession("library", { libKey: library.key })) })
  ];
  if (stats.seen === 0) {
    actions.push(button("Placement check", { size: "sm", iconName: "compass", title: "Skip what you already know", onClick: () => startSession(buildSession("placement", { libKey: library.key })) }));
  }
  actions.push(
    stats.capstoneReady
      ? button(stats.capstoneBest != null ? `Capstone · best ${pct(stats.capstoneBest)}` : "Capstone", { size: "sm", iconName: "trophy", onClick: () => startSession(buildSession("capstone", { libKey: library.key })) })
      : button("Capstone", { size: "sm", iconName: "lock", disabled: true, title: `Unlocks when every skill reaches ${pct(UNLOCK_THRESHOLD)} mastery (lowest now ${pct(stats.minMastery)})` }),
    button("Mock exam", { size: "sm", variant: "ghost", iconName: "exam", onClick: () => navigate("exam", library.key) }),
    button("", {
      size: "sm",
      variant: "ghost",
      iconName: "trash",
      title: "Remove library and its progress",
      onClick: () => {
        if (window.confirm(`Remove “${library.title}” and all its progress? This can't be undone.`)) {
          removeLibrary(library.key);
          toast(`Removed “${library.title}”.`);
          refresh();
        }
      }
    })
  );

  return h(
    "section",
    { class: "library" },
    h(
      "div",
      { class: "library-head" },
      h(
        "div",
        { class: "library-title-block" },
        h("h2", { class: "library-title", text: library.title }),
        library.description && h("p", { class: "library-desc", text: library.description }),
        h(
          "div",
          { class: "library-stats" },
          chip(`${pct(stats.mastery)} mastery`, { tone: stats.mastery >= 0.8 ? "good" : null }),
          chip(`${stats.seen}/${stats.total} items seen`),
          stats.due > 0 && chip(`${stats.due} due`, { tone: "accent", iconName: "clock" }),
          library.fileName && chip(library.fileName, { iconName: "book", title: library.sourcePath })
        )
      ),
      h("div", { class: "library-actions" }, actions)
    ),
    h("div", { class: "skill-grid" }, library.skills.map((skill) => skillTile(skill)))
  );
}

function skillTile(skill) {
  const stats = skillStats(skill.key);
  const locked = !stats.unlocked;
  const prerequisites = skill.prerequisites.map((key) => getSkill(key)).filter(Boolean);

  const tile = h(
    "a",
    { class: ["skill-tile", locked && "is-locked", stats.mastered && "is-mastered"], href: href("skill", skill.key) },
    h(
      "div",
      { class: "skill-tile-top" },
      h("span", { class: "skill-tile-index", text: String(skill.index + 1).padStart(2, "0") }),
      locked ? icon("lock", { size: 16 }) : stats.mastered ? icon("check", { size: 16 }) : null
    ),
    h("h3", { class: "skill-tile-title", text: skill.title }),
    skill.topic && h("p", { class: "skill-tile-topic", text: skill.topic }),
    h(
      "div",
      { class: "skill-tile-foot" },
      h("strong", { class: "skill-tile-pct", text: pct(stats.mastery) }),
      h("span", { class: "skill-tile-meta", text: locked ? `After ${prerequisites.map((prerequisite) => prerequisite.title).join(", ")}` : `${masteryLabel(stats.mastery)} · ${stats.seen}/${stats.total}${stats.due ? ` · ${stats.due} due` : ""}` })
    ),
    h("span", { class: "skill-tile-bar", style: { "--v": `${Math.round(stats.mastery * 100)}%` } })
  );
  return shadeByMastery(tile, stats.mastery);
}

// ── Skill detail ────────────────────────────────────────────────────────────

const TYPE_LABELS = {
  single_choice: "Choice",
  multiple_choice: "Multi-select",
  true_false: "True/false",
  short_answer: "Short",
  long_answer: "Open",
  code_run: "Code"
};

export function renderSkill(root, [skillKey]) {
  const skill = getSkill(skillKey);
  const page = h("div", { class: "page" });
  root.append(page);

  if (!skill) {
    page.append(emptyState({ iconName: "map", title: "Skill not found", body: "It may have been removed.", actions: [button("Skill map", { onClick: () => navigate("map") })] }));
    return;
  }

  const stats = skillStats(skill.key);
  const now = Date.now();

  page.append(
    pageHead({
      back: { href: href("map"), label: "Skill map" },
      eyebrow: skill.libTitle,
      title: skill.title,
      sub: skill.topic || null,
      actions: [
        button("Practice this skill", { variant: "primary", iconName: "play", disabled: !stats.unlocked, onClick: () => startSession(buildSession("skill", { skillKey: skill.key })) }),
        stats.seen > 0 && button("Drill weakest", { iconName: "target", onClick: () => startSession(buildSession("weak", { skillKey: skill.key })) }),
        button("Mock exam", { variant: "ghost", iconName: "exam", onClick: () => navigate("exam", skill.libKey, skill.test.id) })
      ].filter(Boolean)
    })
  );

  if (!stats.unlocked) {
    const needs = skill.prerequisites.map((key) => `${getSkill(key)?.title} (${pct(masteryOf(key))})`).join(", ");
    page.append(
      h(
        "div",
        { class: "callout callout-muted" },
        icon("lock", { size: 18 }),
        h("div", null, h("strong", { text: "Recommended after: " }), `${needs}. Unlocks at ${pct(UNLOCK_THRESHOLD)} mastery. `),
        button("Unlock anyway", { size: "sm", onClick: () => { unlockSkill(skill.key); refresh(); } })
      )
    );
  }

  page.append(
    h(
      "div",
      { class: "skill-hero" },
      h("div", { class: "hero-figure" }, h("span", { class: "hero-number", text: pct(stats.mastery) }), h("span", { class: "hero-caption", text: `${masteryLabel(stats.mastery)} — share of this skill you could recall right now` })),
      h(
        "div",
        { class: "stat-row" },
        statTile({ label: "Seen", value: `${stats.seen}/${stats.total}` }),
        statTile({ label: "Due today", value: String(stats.due) }),
        statTile({ label: "Memory strength", value: stats.seen ? pct(stats.strength) : "—", sub: "avg recall chance, seen items" }),
        statTile({ label: "Last practiced", value: stats.lastPracticed ? formatAgo(stats.lastPracticed) : "never" })
      )
    )
  );

  if (skill.relevance || skill.instructions) {
    page.append(
      card(
        { title: skill.relevance ? "Why this matters" : "Instructions" },
        skill.relevance && h("p", { text: skill.relevance }),
        skill.instructions && h("p", { class: "muted", text: skill.instructions })
      )
    );
  }

  if (stats.testedOut) {
    page.append(h("div", { class: "callout callout-good" }, icon("check", { size: 18 }), h("div", { text: "You tested out of the basics here, so new items skip the worked-example steps and go straight to independent recall." })));
  }

  const rows = skill.items.map((itemKey, index) => {
    const item = catalog().items.get(itemKey);
    const memory = progress().items[itemKey];
    const recall = memory ? retrievability(memory, now) : 0;
    const mistake = progress().mistakes[itemKey];
    const status = !memory || memory.state === "new"
      ? chip("New")
      : memory.dueAt <= now
        ? chip("Due", { tone: "accent" })
        : chip(formatDue(memory.dueAt, now));
    return h(
      "tr",
      null,
      h("td", { class: "num muted", text: String(index + 1) }),
      h("td", { class: "item-prompt" }, h("span", { text: item.question.prompt }), mistake && !mistake.resolvedAt && chip("open mistake", { tone: "bad" })),
      h("td", { class: "muted", text: TYPE_LABELS[item.question.type] }),
      h("td", null, status),
      h(
        "td",
        { class: "strength-cell" },
        !memory || memory.state === "new"
          ? h("span", { class: "muted", text: "—" })
          : memory.lastCorrect
            ? [meter(recall, { label: "Recall chance" }), h("span", { class: "num", text: pct(recall) })]
            : chip("Relearning", { tone: "warn", title: "Missed last time — not counted toward mastery until you recall it" })
      )
    );
  });

  page.append(
    card(
      { title: "Items", sub: "Recall chance is the scheduler's estimate that you'd get it right now; reviews land when it drops to your target." },
      h(
        "div",
        { class: "table-wrap" },
        h(
          "table",
          { class: "table" },
          h("thead", null, h("tr", null, h("th", { text: "#" }), h("th", { text: "Prompt" }), h("th", { text: "Type" }), h("th", { text: "Next" }), h("th", { text: "Recall chance" }))),
          h("tbody", null, rows)
        )
      )
    )
  );
}
