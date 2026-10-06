// Practice: every game in one place. Pick what you feel like playing, and
// choose which games appear on Home. All of them feed the same memory model,
// so what you learn in one shows up in the others.

import { h } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { pageHead } from "../components.js";
import { progress, persist } from "../../state/progress.js";
import { GAMES } from "../../domain/games.js";
import { refresh } from "../router.js";
import { enabledGames, gameCard } from "./games.js";

export function renderPractice(root) {
  const page = h("div", { class: "page" });
  root.append(page);
  const enabled = enabledGames();

  page.append(pageHead({ eyebrow: "Practice", title: "Choose how to play", sub: "Every game runs on the same learning engine, so there's no wrong choice. Pin the ones you like to Home." }));

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
