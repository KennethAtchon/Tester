// Exercise kit, part 1: concept, choice, sort, order, match.
//
// Every exercise is a factory: create(step, ctx) → {
//   el            the interactive body
//   ready()       can the learner press Check yet?
//   check()       grade → { correct, score, verdict, response, chosen? }
//   show(result)  lock the body and mark right/wrong pieces
//   explain(r)    extra feedback (worked solutions, checklists) or null
//   autoHint()    give a nudge in-place; returns a sentence describing it
//   hotkey(key)   optional keyboard handling; return true if used
// }
// ctx: { onChange(), submit(), instant, recallFirst, seen }

import { h } from "../../lib/dom.js";
import { rich } from "../../lib/markup.js";
import { icon } from "../icons.js";
import { renderVisual } from "./visuals.js";
import { gradeChoice, choiceAnswers, isMulti, misconceptionFor, gradeSort, gradeOrder, gradeMatch } from "../../domain/grading.js";

const LETTERS = "ABCDEFG";

export function shuffled(list, avoidIdentity = false) {
  let copy = [...list];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    copy = [...list];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    if (!avoidIdentity || copy.some((value, index) => value !== list[index])) {
      break;
    }
  }
  return copy;
}

function verdictOf(correct, score) {
  if (correct) {
    return "correct";
  }
  return score >= 0.5 ? "partial" : "wrong";
}

// ── concept ─────────────────────────────────────────────────────────────────

export function concept(step) {
  const visual = step.visual ? renderVisual(step.visual) : null;
  return {
    el: h("div", { class: "concept" }, h("div", { class: "concept-body rich" }, rich(step.body || "")), visual && h("div", { class: "concept-visual" }, visual)),
    ready: () => true,
    check: () => ({ correct: true, score: 1, verdict: "concept" })
  };
}

// ── choice ──────────────────────────────────────────────────────────────────

export function choice(step, ctx) {
  const multi = isMulti(step);
  const order = step.options.length === 2 && /^(true|false)$/i.test(step.options[0]) ? step.options : shuffled(step.options);
  const state = { selected: [], recalling: Boolean(ctx.recallFirst && step.options.length > 2), recall: "", eliminated: new Set(), locked: false };
  const el = h("div", { class: "choice" });

  const paint = () => {
    el.replaceChildren();
    if (state.recalling) {
      const box = h("textarea", {
        class: "input recall-box",
        rows: 2,
        placeholder: "What's the answer? Type it or just think it — then show the options.",
        value: state.recall,
        "aria-label": "Recall before seeing options",
        onInput: (event) => {
          state.recall = event.target.value;
        },
        onKeydown: (event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            showOptions();
          }
        }
      });
      el.append(
        h(
          "div",
          { class: "recall" },
          h("p", { class: "recall-head" }, icon("eye", { size: 16 }), h("strong", { text: "Recall first. " }), "Producing an answer beats recognizing one."),
          box,
          h("button", { type: "button", class: "btn btn-sm", onClick: showOptions }, "Show options", h("kbd", { text: "Enter" }))
        )
      );
      requestAnimationFrame(() => box.focus());
      return;
    }
    if (state.recall.trim()) {
      el.append(h("p", { class: "recalled" }, "You recalled: ", h("em", { text: state.recall.trim() })));
    }
    if (multi) {
      el.append(h("p", { class: "choice-note", text: "Select all that apply." }));
    }
    const list = h("div", { class: "options", role: multi ? "group" : "radiogroup" });
    order.forEach((option, index) => {
      const chosen = state.selected.includes(option);
      list.append(
        h(
          "button",
          {
            type: "button",
            class: ["option", chosen && "is-chosen", state.eliminated.has(option) && "is-eliminated"],
            role: multi ? "checkbox" : "radio",
            "aria-checked": String(chosen),
            disabled: state.locked || state.eliminated.has(option),
            dataset: { option },
            onClick: () => toggle(option)
          },
          h("span", { class: "option-key", text: LETTERS[index] || "" }),
          h("span", { class: "option-text" }, rich(option, { inline: true }))
        )
      );
    });
    el.append(list);
  };

  const showOptions = () => {
    state.recalling = false;
    paint();
    ctx.onChange();
  };

  const toggle = (option) => {
    if (state.locked) {
      return;
    }
    state.selected = multi ? (state.selected.includes(option) ? state.selected.filter((value) => value !== option) : [...state.selected, option]) : [option];
    paint();
    ctx.onChange();
    if (ctx.instant && !multi) {
      ctx.submit();
    }
  };

  paint();

  return {
    el,
    ready: () => !state.recalling && state.selected.length > 0,
    check() {
      const result = gradeChoice(step, state.selected);
      const response = [state.recall.trim() && `Recalled: ${state.recall.trim()}`, `Chose: ${state.selected.join("; ")}`].filter(Boolean).join(" · ");
      if (result.selfGrade) {
        return { correct: null, score: null, verdict: "self", response, chosen: state.selected };
      }
      return { correct: result.correct, score: result.score, verdict: verdictOf(result.correct, result.score), response, chosen: state.selected, detail: result };
    },
    show() {
      state.locked = true;
      paint();
      const answers = new Set(choiceAnswers(step) || []);
      for (const button of el.querySelectorAll(".option")) {
        const option = button.dataset.option;
        const chosen = state.selected.includes(option);
        if (answers.has(option)) {
          button.classList.add(chosen ? "is-correct" : "is-missed");
          button.append(icon("check", { size: 18, className: "option-mark" }));
        } else if (chosen) {
          button.classList.add("is-wrong");
          button.append(icon("x", { size: 18, className: "option-mark" }));
          const note = misconceptionFor(step, option);
          if (note) {
            button.append(h("span", { class: "option-note" }, h("strong", { text: "Why not: " }), note));
          }
        }
      }
    },
    explain: () => null,
    autoHint() {
      const answers = new Set(choiceAnswers(step) || []);
      const wrong = order.filter((option) => !answers.has(option) && !state.eliminated.has(option));
      if (answers.size === 0 || wrong.length <= 1) {
        return null;
      }
      state.eliminated.add(wrong[Math.floor(Math.random() * wrong.length)]);
      state.selected = state.selected.filter((option) => !state.eliminated.has(option));
      if (state.recalling) {
        state.recalling = false;
      }
      paint();
      ctx.onChange();
      return "One wrong option is crossed out.";
    },
    hotkey(key) {
      if (state.recalling) {
        return false;
      }
      const index = LETTERS.indexOf(key.toUpperCase());
      if (index >= 0 && index < order.length && !state.eliminated.has(order[index])) {
        toggle(order[index]);
        return true;
      }
      return false;
    }
  };
}

// ── sort: items into buckets ────────────────────────────────────────────────

export function sort(step, ctx) {
  const items = shuffled(step.items.map((item, index) => ({ ...item, index })));
  const state = { placement: step.items.map(() => null), picked: null, locked: false, result: null };
  const el = h("div", { class: "sort" });

  const chip = (item) =>
    h(
      "button",
      {
        type: "button",
        class: ["chip-card", state.picked === item.index && "is-picked", state.result && (state.result.perItem[item.index] ? "is-right" : "is-wrong")],
        draggable: state.locked ? null : "true",
        disabled: state.locked,
        dataset: { index: String(item.index) },
        onClick: () => {
          if (state.locked) {
            return;
          }
          if (state.placement[item.index] != null) {
            state.placement[item.index] = null;
            state.picked = item.index;
          } else {
            state.picked = state.picked === item.index ? null : item.index;
          }
          paint();
          ctx.onChange();
        },
        onDragstart: (event) => {
          event.dataTransfer.setData("text/plain", String(item.index));
          state.picked = item.index;
        }
      },
      rich(item.text, { inline: true }),
      state.result && !state.result.perItem[item.index] && h("span", { class: "chip-fix", text: `→ ${item.bucket}` })
    );

  const place = (bucket) => {
    if (state.locked || state.picked == null) {
      return;
    }
    state.placement[state.picked] = bucket;
    const next = items.find((item) => state.placement[item.index] == null);
    state.picked = next ? next.index : null;
    paint();
    ctx.onChange();
  };

  const paint = () => {
    const pool = items.filter((item) => state.placement[item.index] == null);
    el.replaceChildren(
      h("div", { class: ["sort-pool", pool.length === 0 && "is-empty"] }, pool.length ? pool.map(chip) : h("span", { class: "muted small", text: state.locked ? "" : "All placed — check when ready." })),
      h(
        "div",
        { class: "sort-buckets", style: { "--cols": String(Math.min(step.buckets.length, 3)) } },
        step.buckets.map((bucket) =>
          h(
            "div",
            {
              class: ["bucket", state.picked != null && !state.locked && "is-target"],
              role: "button",
              tabindex: state.locked ? null : "0",
              "aria-label": `Place in ${bucket}`,
              onClick: () => place(bucket),
              onKeydown: (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  place(bucket);
                }
              },
              onDragover: (event) => event.preventDefault(),
              onDrop: (event) => {
                event.preventDefault();
                state.picked = Number(event.dataTransfer.getData("text/plain"));
                place(bucket);
              }
            },
            h("div", { class: "bucket-title", text: bucket }),
            h("div", { class: "bucket-items" }, items.filter((item) => state.placement[item.index] === bucket).map(chip))
          )
        )
      )
    );
  };

  state.picked = items[0]?.index ?? null;
  paint();

  return {
    el,
    ready: () => state.placement.every((value) => value != null),
    check() {
      const result = gradeSort(step, state.placement);
      return { correct: result.correct, score: result.score, verdict: verdictOf(result.correct, result.score), response: step.items.map((item, index) => `${item.text} → ${state.placement[index]}`).join("; "), detail: result };
    },
    show(result) {
      state.locked = true;
      state.result = result.detail;
      state.picked = null;
      paint();
    },
    explain(result) {
      const wrong = step.items.filter((item, index) => !result.detail.perItem[index] && item.why);
      return wrong.length ? h("ul", { class: "explain-list" }, wrong.map((item) => h("li", null, h("strong", { text: `${item.text}: ` }), item.why))) : null;
    },
    autoHint() {
      const target = items.find((item) => state.placement[item.index] !== item.bucket);
      if (!target) {
        return null;
      }
      state.placement[target.index] = target.bucket;
      paint();
      ctx.onChange();
      return `Placed “${target.text}” for you.`;
    }
  };
}

// ── order: arrange into sequence ────────────────────────────────────────────

export function order(step, ctx) {
  const state = { order: shuffled(step.items.map((_, index) => index), true), locked: false, result: null, dragging: null };
  const el = h("div", { class: "order" });

  const move = (from, to) => {
    if (to < 0 || to >= state.order.length || state.locked) {
      return;
    }
    const [value] = state.order.splice(from, 1);
    state.order.splice(to, 0, value);
    paint();
    ctx.onChange();
  };

  const paint = () => {
    el.replaceChildren(
      h(
        "ol",
        { class: "order-list" },
        state.order.map((itemIndex, position) =>
          h(
            "li",
            {
              class: ["order-item", state.result && (state.result.perPosition[position] ? "is-right" : "is-wrong")],
              draggable: state.locked ? null : "true",
              onDragstart: (event) => {
                state.dragging = position;
                event.dataTransfer.setData("text/plain", String(position));
              },
              onDragover: (event) => event.preventDefault(),
              onDrop: (event) => {
                event.preventDefault();
                move(Number(event.dataTransfer.getData("text/plain")), position);
              }
            },
            h("span", { class: "order-pos", text: String(position + 1) }),
            !state.locked && h("span", { class: "order-grip", "aria-hidden": "true" }, icon("grip", { size: 16 })),
            h("span", { class: "order-text" }, rich(step.items[itemIndex], { inline: true })),
            !state.locked &&
              h(
                "span",
                { class: "order-buttons" },
                h("button", { type: "button", class: "icon-btn", "aria-label": "Move up", disabled: position === 0, onClick: () => move(position, position - 1) }, icon("chevronUp", { size: 16 })),
                h("button", { type: "button", class: "icon-btn", "aria-label": "Move down", disabled: position === state.order.length - 1, onClick: () => move(position, position + 1) }, icon("chevronDown", { size: 16 }))
              )
          )
        )
      )
    );
  };

  paint();

  return {
    el,
    ready: () => true,
    check() {
      const result = gradeOrder(step, state.order);
      return { correct: result.correct, score: result.score, verdict: verdictOf(result.correct, result.score), response: state.order.map((index) => step.items[index]).join(" → "), detail: result };
    },
    show(result) {
      state.locked = true;
      state.result = result.detail;
      paint();
    },
    explain(result) {
      if (result.correct) {
        return null;
      }
      return h("div", { class: "explain-block" }, h("div", { class: "explain-label", text: "Correct order" }), h("ol", { class: "explain-order" }, step.items.map((item) => h("li", null, rich(item, { inline: true })))));
    },
    autoHint() {
      const position = state.order.findIndex((itemIndex, index) => itemIndex !== index);
      if (position < 0) {
        return null;
      }
      move(state.order.indexOf(position), position);
      return `Item ${position + 1} is now in place.`;
    }
  };
}

// ── match: pair left with right ─────────────────────────────────────────────

export function match(step, ctx) {
  const rights = shuffled(step.pairs.map((_, index) => index), true);
  const state = { pairs: step.pairs.map(() => null), pickedLeft: null, locked: false, result: null };
  const el = h("div", { class: "match" });

  const colorOf = (leftIndex) => (state.pairs[leftIndex] == null ? null : (leftIndex % 6) + 1);

  const paint = () => {
    const pairedRight = new Map(state.pairs.map((right, left) => [right, left]).filter(([right]) => right != null));
    el.replaceChildren(
      h(
        "div",
        { class: "match-cols" },
        h(
          "div",
          { class: "match-col" },
          step.pairs.map((pair, left) =>
            h(
              "button",
              {
                type: "button",
                class: ["match-item", state.pickedLeft === left && "is-picked", colorOf(left) && `pair-${colorOf(left)}`, state.result && (state.result.perPair[left] ? "is-right" : "is-wrong")],
                disabled: state.locked,
                onClick: () => {
                  if (state.pairs[left] != null) {
                    state.pairs[left] = null;
                  }
                  state.pickedLeft = state.pickedLeft === left ? null : left;
                  paint();
                  ctx.onChange();
                }
              },
              colorOf(left) && h("span", { class: "pair-dot", text: String(colorOf(left)) }),
              h("span", null, rich(pair[0], { inline: true }))
            )
          )
        ),
        h(
          "div",
          { class: "match-col" },
          rights.map((right) => {
            const left = pairedRight.get(right);
            return h(
              "button",
              {
                type: "button",
                class: ["match-item", "is-right-side", left != null && `pair-${colorOf(left)}`, state.pickedLeft != null && left == null && "is-target"],
                disabled: state.locked,
                onClick: () => {
                  if (left != null) {
                    state.pairs[left] = null;
                    state.pickedLeft = left;
                  } else if (state.pickedLeft != null) {
                    state.pairs[state.pickedLeft] = right;
                    const next = state.pairs.findIndex((value) => value == null);
                    state.pickedLeft = next >= 0 ? next : null;
                  }
                  paint();
                  ctx.onChange();
                }
              },
              left != null && h("span", { class: "pair-dot", text: String(colorOf(left)) }),
              h("span", null, rich(step.pairs[right][1], { inline: true }))
            );
          })
        )
      )
    );
  };

  state.pickedLeft = 0;
  paint();

  return {
    el,
    ready: () => state.pairs.every((value) => value != null),
    check() {
      const result = gradeMatch(step, state.pairs);
      return { correct: result.correct, score: result.score, verdict: verdictOf(result.correct, result.score), response: step.pairs.map((pair, left) => `${pair[0]} → ${state.pairs[left] == null ? "?" : step.pairs[state.pairs[left]][1]}`).join("; "), detail: result };
    },
    show(result) {
      state.locked = true;
      state.result = result.detail;
      state.pickedLeft = null;
      paint();
    },
    explain(result) {
      const wrong = step.pairs.filter((_, index) => !result.detail.perPair[index]);
      return wrong.length
        ? h("div", { class: "explain-block" }, h("div", { class: "explain-label", text: "Correct pairs" }), h("ul", { class: "explain-list" }, wrong.map((pair) => h("li", null, h("strong", null, rich(pair[0], { inline: true })), " → ", rich(pair[1], { inline: true })))))
        : null;
    },
    autoHint() {
      const left = state.pairs.findIndex((right, index) => right !== index);
      if (left < 0) {
        return null;
      }
      for (let index = 0; index < state.pairs.length; index += 1) {
        if (state.pairs[index] === left) {
          state.pairs[index] = null;
        }
      }
      state.pairs[left] = left;
      paint();
      ctx.onChange();
      return "One pair is matched for you.";
    }
  };
}
