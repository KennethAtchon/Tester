// Visuals for concept cards: flow, diagram, bars, stats, compare, table.
// Every one carries information (dual coding), none is decoration.

import { h } from "../../lib/dom.js";
import { rich } from "../../lib/markup.js";
import { icon } from "../icons.js";
import { renderDiagram } from "./diagram.js";

export function renderVisual(visual) {
  switch (visual?.kind) {
    case "flow":
      return flow(visual);
    case "diagram":
      return renderDiagram(visual, { className: "visual-diagram" });
    case "bars":
      return bars(visual);
    case "stats":
      return stats(visual);
    case "compare":
      return compare(visual);
    case "table":
      return table(visual);
    default:
      return null;
  }
}

function flow(visual) {
  const row = h("ol", { class: "visual-flow", "aria-label": visual.steps.join(" then ") });
  visual.steps.forEach((step, index) => {
    row.append(h("li", { class: "flow-step" }, h("span", { class: "flow-num", text: String(index + 1) }), h("span", { class: "flow-text" }, rich(step, { inline: true }))));
    if (index < visual.steps.length - 1) {
      row.append(h("li", { class: "flow-arrow", "aria-hidden": "true" }, icon("arrowRight", { size: 16 })));
    }
  });
  return row;
}

// Horizontal bars; log scale for magnitudes that span orders (latency).
function bars(visual) {
  const values = visual.items.map((item) => item.value);
  const max = Math.max(...values);
  const min = Math.min(...values.filter((value) => value > 0));
  const scale = (value) => {
    if (!visual.log) {
      return value / max;
    }
    const low = Math.log10(min) - 0.5;
    return (Math.log10(Math.max(value, min)) - low) / (Math.log10(max) - low);
  };
  return h(
    "div",
    { class: "visual-bars" },
    visual.items.map((item) =>
      h(
        "div",
        { class: "bar-row" },
        h("span", { class: "bar-label", text: item.label }),
        h("span", { class: "bar-track" }, h("span", { class: "bar-fill", style: { "--v": `${Math.max(2, scale(item.value) * 100).toFixed(1)}%` } })),
        h("span", { class: "bar-value", text: item.display || `${formatValue(item.value)}${visual.unit ? ` ${visual.unit}` : ""}` })
      )
    ),
    visual.log && h("p", { class: "visual-note", text: "Log scale — each step right is ×10." })
  );
}

function formatValue(value) {
  return value >= 1e6 ? `${(value / 1e6).toLocaleString()}M` : value.toLocaleString();
}

function stats(visual) {
  return h(
    "div",
    { class: "visual-stats" },
    visual.items.map((item) => h("div", { class: "vstat" }, h("strong", { text: item.value }), h("span", { text: item.label })))
  );
}

function compare(visual) {
  const side = (data, tone) =>
    h(
      "div",
      { class: ["compare-side", `tone-${tone}`] },
      h("h4", { text: data.title }),
      h("ul", null, data.points.map((point) => h("li", null, rich(point, { inline: true }))))
    );
  return h("div", { class: "visual-compare" }, side(visual.left, "a"), h("span", { class: "compare-vs", text: "vs" }), side(visual.right, "b"));
}

function table(visual) {
  return h(
    "div",
    { class: "visual-table" },
    h(
      "table",
      null,
      h("thead", null, h("tr", null, visual.columns.map((column) => h("th", { text: column })))),
      h("tbody", null, visual.rows.map((row) => h("tr", null, row.map((cell) => h("td", null, rich(String(cell), { inline: true }))))))
    )
  );
}
