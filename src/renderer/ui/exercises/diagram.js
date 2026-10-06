// Architecture diagram rendering shared by concept visuals, the build canvas,
// and reference solutions. Nodes are absolutely positioned boxes (x/y are
// percentages of the board); edges are an SVG overlay drawn between box
// borders, re-laid out whenever the board resizes.

import { h, s } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { COMPONENTS } from "../../domain/architecture.js";

export function nodeLabel(node) {
  return node.label || COMPONENTS[node.type]?.label || node.type;
}

export function nodeElement(node, { interactive = false } = {}) {
  const meta = COMPONENTS[node.type] || { icon: "box", hue: "slate" };
  return h(
    "div",
    {
      class: ["arch-node", `hue-${meta.hue}`, interactive && "is-interactive"],
      dataset: { id: node.id },
      style: { left: `${node.x}%`, top: `${node.y}%` },
      title: meta.description || ""
    },
    h("span", { class: "arch-node-icon" }, icon(meta.icon, { size: 16 })),
    h("span", { class: "arch-node-label", text: nodeLabel(node) })
  );
}

// Draws edges (center to center, trimmed to box borders) with arrowheads.
export function layoutEdges(svg, board, graph, { selected = null, onSelect = null, marks = null } = {}) {
  fitNodes(board, graph.nodes);
  const rect = board.getBoundingClientRect();
  const width = rect.width || 600;
  const height = rect.height || 360;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren(
    s("defs", null,
      s("marker", { id: `arrow-${svg.dataset.uid}`, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" },
        s("path", { d: "M0,0 L10,5 L0,10 z", class: "arch-arrow" })))
  );

  const boxes = new Map();
  for (const element of board.querySelectorAll(".arch-node")) {
    const box = element.getBoundingClientRect();
    boxes.set(element.dataset.id, {
      x: box.left - rect.left + box.width / 2,
      y: box.top - rect.top + box.height / 2,
      w: box.width / 2 + 4,
      h: box.height / 2 + 4
    });
  }

  graph.edges.forEach((edge, index) => {
    const from = boxes.get(edge.from);
    const to = boxes.get(edge.to);
    if (!from || !to) {
      return;
    }
    const start = trim(from, to);
    const end = trim(to, from);
    const mark = marks?.[index];
    const line = s("line", {
      class: ["arch-edge", selected === index && "is-selected", mark && `is-${mark}`].filter(Boolean).join(" "),
      x1: start.x, y1: start.y, x2: end.x, y2: end.y,
      "marker-end": `url(#arrow-${svg.dataset.uid})`
    });
    svg.append(line);
    // Skip labels on very short edges, where they'd sit on top of the boxes.
    if (edge.label && Math.hypot(end.x - start.x, end.y - start.y) > 64) {
      svg.append(s("text", { class: "arch-edge-label", x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 6, "text-anchor": "middle", text: edge.label }));
    }
    if (onSelect) {
      const hit = s("line", { class: "arch-edge-hit", x1: start.x, y1: start.y, x2: end.x, y2: end.y });
      hit.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        onSelect(index);
      });
      svg.append(hit);
    }
  });
}

// x/y are box centres in percent, so a box near an edge would hang off the
// board. Pin each box fully inside instead.
function fitNodes(board, nodes) {
  const width = board.clientWidth;
  const height = board.clientHeight;
  if (!width || !height) {
    return;
  }
  const elements = new Map([...board.querySelectorAll(".arch-node")].map((element) => [element.dataset.id, element]));
  for (const node of nodes) {
    const element = elements.get(node.id);
    if (!element) {
      continue;
    }
    const halfWidth = element.offsetWidth / 2 + 6;
    const halfHeight = element.offsetHeight / 2 + 6;
    element.style.left = `${Math.max(halfWidth, Math.min(width - halfWidth, (node.x / 100) * width))}px`;
    element.style.top = `${Math.max(halfHeight, Math.min(height - halfHeight, (node.y / 100) * height))}px`;
  }
}

// Point where the segment from a's center toward b's center leaves a's box.
function trim(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    return { x: a.x, y: a.y };
  }
  const scale = Math.min(Math.abs(a.w / (dx || 1e-9)), Math.abs(a.h / (dy || 1e-9)));
  return { x: a.x + dx * Math.min(scale, 1), y: a.y + dy * Math.min(scale, 1) };
}

let uid = 0;

// A read-only diagram (concept visuals, reference solutions).
export function renderDiagram(graph, { className = "" } = {}) {
  const normalized = {
    nodes: graph.nodes.map((node) => ({ ...node, x: node.x ?? 50, y: node.y ?? 50 })),
    edges: (graph.edges || []).map((edge) => (Array.isArray(edge) ? { from: edge[0], to: edge[1], label: edge[2] } : edge))
  };
  const svg = s("svg", { class: "arch-edges", "aria-hidden": "true" });
  svg.dataset.uid = String((uid += 1));
  const board = h("div", { class: ["arch-board", "is-static", className] }, svg, normalized.nodes.map((node) => nodeElement(node)));
  const describe = normalized.edges.map((edge) => `${nodeLabel(normalized.nodes.find((node) => node.id === edge.from) || {})} → ${nodeLabel(normalized.nodes.find((node) => node.id === edge.to) || {})}`).join(", ");
  board.setAttribute("role", "img");
  board.setAttribute("aria-label", `Diagram: ${describe}`);
  const observer = new ResizeObserver(() => layoutEdges(svg, board, normalized));
  observer.observe(board);
  requestAnimationFrame(() => layoutEdges(svg, board, normalized));
  return board;
}

export function nextUid() {
  uid += 1;
  return String(uid);
}
