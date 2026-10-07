// Practice: every game in one place. Pick what you feel like playing, choose
// which games appear on Home, and whether they draw from the subject you're
// studying or from every subject. All of them feed the same memory model, so
// what you learn in one shows up in the others.

import { h } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { pageHead, segmented } from "../components.js";
import { progress, persist, settings } from "../../state/progress.js";
import { catalog, currentSubject } from "../../state/catalog.js";
import { GAMES } from "../../domain/games.js";
import { refresh } from "../router.js";
import { enabledGames, gameCard } from "./games.js";

export function renderPractice(root) {
  const page = h("div", { class: "page" });
  root.append(page);
  const enabled = enabledGames();

  const subject = currentSubject();
  const withContent = catalog().subjects.filter((entry) => entry.courseIds.length > 0);
  const scopeControl =
    subject && withContent.length > 1
      ? h(
          "div",
          { class: "scope-control" },
          h("span", { class: "muted small", text: "Questions from" }),
          segmented(
            [
              { value: "subject", label: subject.title },
              { value: "all", label: "All subjects" }
            ],
            settings().practiceScope,
            (value) => {
              settings().practiceScope = value;
              persist();
              refresh();
            },
            { label: "Which subjects games draw from" }
          )
        )
      : null;

  page.append(pageHead({ eyebrow: "Practice", title: "Choose how to play", sub: "Every game runs on the same learning engine, so there's no wrong choice. Pin the ones you like to Home.", actions: scopeControl ? [scopeControl] : [] }));

  page.append(
    h(
      "div",
      { class: "practice-grid" },
      GAMES.map((game) =>
        h(
          "div",
          { class: ["practice-item", enabled.has(game.id) && "is-pinned"] },
          gameCard(game, { large: true }),
          h("p", { class: "practice-science" }, icon("sparkle", { size: 14 }), h("span", { text: game.science })),
          !game.required &&
            h(
              "label",
              { class: "switch" },
              h("input", {
                type: "checkbox",
                checked: enabled.has(game.id),
                onChange: (event) => {
                  const games = new Set(enabledGames());
                  if (event.target.checked) {
                    games.add(game.id);
                  } else {
                    games.delete(game.id);
                  }
                  progress().profile.games = [...games];
                  persist();
                  refresh();
                }
              }),
              h("span", { class: "switch-track" }),
              h("span", { text: "Show on Home" })
            )
        )
      )
    )
  );
}
