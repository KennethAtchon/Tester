// Design Lab: complete systems designed end to end — requirements,
// estimation, API, data model, architecture, deep dives — each stage graded.
// Guided mode gives feedback as you go; interview mode is timed with feedback
// only at the end, plus a Markdown export for an outside review.

import { h } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { button, chip, pageHead, emptyState } from "../components.js";
import { progress } from "../../state/progress.js";
import { catalog } from "../../state/catalog.js";
import { projectPlay } from "../../state/sessions.js";
import { gradeLetter } from "../../domain/rewards.js";
import { startPlay } from "../player.js";
import { navigate } from "../router.js";

export function renderLab(root) {
  const page = h("div", { class: "page" });
  root.append(page);
  const projects = [...catalog().projects.values()];

  page.append(pageHead({ eyebrow: "Design Lab", title: "Build real systems", sub: "Each project walks a full design: requirements → estimation → API → data model → architecture → deep dives. Every stage is graded, and the scorecard shows exactly what to tighten." }));

  if (projects.length === 0) {
    page.append(emptyState({ iconName: "layers", title: "No projects yet", body: "Projects come with courses. The System Design course includes four.", actions: [button("Library", { onClick: () => navigate("library") })] }));
    return;
  }

  page.append(
    h("div", { class: "project-grid" }, projects.map((project) => projectCard(project, { returnTo: "lab" }))),
    h(
      "section",
      { class: "card how-graded" },
      h("h2", { class: "card-title", text: "How your design is graded" }),
      h(
        "ul",
        { class: "how-list" },
        [
          ["Requirements & data", "Sorting and choices with a reason for every answer."],
          ["Estimation", "Your number vs. the worked answer: within 30% is a hit, within 2× gets partial credit."],
          ["API", "Each endpoint's method and path, forgiving of /v1 prefixes, plurals, and {id} styles."],
          ["Architecture", "Your diagram is checked as a graph: required components, connections, request paths, and shortcuts that must not exist. Each rule explains itself, and you can compare with a reference design."],
          ["Deep dives", "Trade-off questions, plus a written answer checked for the key ideas (you can override a miss)."]
        ].map(([title, text]) => h("li", null, h("strong", { text: title }), h("span", { text })))
      )
    )
  );
}

export function projectCard(project, { returnTo = "lab" } = {}) {
  const record = progress().lessons[project.key];
  const best = record?.best;
  return h(
    "article",
    { class: "project-card" },
    h(
      "div",
      { class: "project-top" },
      h("span", { class: "project-icon" }, icon("layers", { size: 22 })),
      best != null ? h("span", { class: ["grade-chip", `grade-${gradeLetter(best).toLowerCase()}`], title: `Best ${Math.round(best * 100)}%` }, gradeLetter(best)) : chip(project.difficulty)
    ),
    h("h3", { class: "project-title", text: project.title }),
    project.summary && h("p", { class: "project-summary", text: project.summary }),
    h("div", { class: "project-stages" }, project.stages.map((stage) => h("span", { text: stage.title }))),
    h("p", { class: "muted small", text: `${project.difficulty} · about ${project.minutes} min${best != null ? ` · best ${Math.round(best * 100)}%` : ""}` }),
    h(
      "div",
      { class: "project-actions" },
      button(best != null ? "Design again" : "Start", { variant: "go", iconName: "play2", onClick: () => startPlay(projectPlay(project.key), { returnTo }) }),
      button("Interview mode", { variant: "ghost", iconName: "clock", title: "45 minutes, no hints, feedback at the end", onClick: () => startPlay(projectPlay(project.key, { interview: true }), { returnTo }) })
    )
  );
}
