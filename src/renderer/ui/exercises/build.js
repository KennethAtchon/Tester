// The architecture canvas: add components from a palette, drag them around,
// and connect them by dragging from a box's ● handle onto another box (or
// click ● then click the target). Click a line or box and press Delete to
// remove it. Graded by graph rules (domain/architecture.js), with a
// checklist explaining each rule and the reference design to compare.

import { h, s, isTyping } from "../../lib/dom.js";
import { icon } from "../icons.js";
import { COMPONENTS, gradeGraph } from "../../domain/architecture.js";
import { nodeElement, nodeLabel, layoutEdges, renderDiagram, nextUid } from "./diagram.js";

export function build(step, ctx) {
  const state = {
    nodes: (step.start?.nodes || []).map((node) => ({ ...node, x: node.x ?? 10, y: node.y ?? 50 })),
    edges: (step.start?.edges || []).map((edge) => (Array.isArray(edge) ? { from: edge[0], to: edge[1] } : { ...edge })),
    selectedNode: null,
    selectedEdge: null,
    connectFrom: null,
    locked: false,
    result: null,
    showSolution: false
  };
  let counter = state.nodes.length;

  const svg = s("svg", { class: "arch-edges", "aria-hidden": "true" });
  svg.dataset.uid = nextUid();
  const ghost = s("line", { class: "arch-edge is-ghost", visibility: "hidden" });
  const board = h("div", { class: "arch-board build-board", tabindex: "0", "aria-label": "Design canvas" });
  const status = h("div", { class: "build-status", role: "status" });
  const solutionSlot = h("div", { class: "build-solution" });

  const palette = h(
    "div",
    { class: "build-palette", "aria-label": "Components" },
    h("div", { class: "palette-title", text: "Components" }),
    step.palette.map((type) => {
      const meta = COMPONENTS[type];
      return h(
        "button",
        {
          type: "button",
          class: ["palette-item", `hue-${meta.hue}`],
          draggable: "true",
          title: meta.description,
          onClick: () => addNode(type),
          onDragstart: (event) => event.dataTransfer.setData("application/x-component", type)
        },
        h("span", { class: "arch-node-icon" }, icon(meta.icon, { size: 16 })),
        h("span", { class: "palette-label", text: meta.label })
      );
    })
  );

  const el = h(
    "div",
    { class: "build" },
    h(
      "div",
      { class: "build-main" },
      palette,
      h(
        "div",
        { class: "build-stage" },
        board,
        h(
          "div",
          { class: "build-toolbar" },
          h("span", { class: "build-help" }, "Drag from ", h("span", { class: "port-dot" }), " to connect · select + Delete to remove"),
          h("button", { type: "button", class: "btn btn-ghost btn-sm", onClick: () => removeSelected() }, icon("trash", { size: 14 }), "Delete"),
          h("button", { type: "button", class: "btn btn-ghost btn-sm", onClick: () => clearAll() }, "Clear")
        ),
        status
      )
    ),
    solutionSlot
  );

  // ── model ────────────────────────────────────────────────────────────────

  function addNode(type, x = null, y = null) {
    if (state.locked) {
      return;
    }
    counter += 1;
    const position = x == null ? freeSpot() : { x, y };
    state.nodes.push({ id: `n${counter}`, type, x: position.x, y: position.y });
    state.selectedNode = `n${counter}`;
    state.selectedEdge = null;
    paint();
    ctx.onChange();
  }

  // Next open slot on a roomy grid (boxes are ~150px wide), then the gaps
  // between grid rows, so new components never land on top of each other.
  function freeSpot() {
    const slots = [];
    for (const y of [50, 18, 82]) {
      for (const x of [12, 37, 62, 87]) {
        slots.push({ x, y });
      }
    }
    for (const y of [34, 66]) {
      for (const x of [24, 50, 76]) {
        slots.push({ x, y });
      }
    }
    const open = slots.find((slot) => !state.nodes.some((node) => Math.abs(node.x - slot.x) < 13 && Math.abs(node.y - slot.y) < 14));
    return open || { x: 20 + Math.random() * 60, y: 20 + Math.random() * 60 };
  }

  function connect(from, to) {
    if (from === to || state.edges.some((edge) => (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from))) {
      return;
    }
    state.edges.push({ from, to });
    ctx.onChange();
  }

  function removeSelected() {
    if (state.locked) {
      return;
    }
    if (state.selectedEdge != null) {
      state.edges.splice(state.selectedEdge, 1);
      state.selectedEdge = null;
    } else if (state.selectedNode) {
      state.nodes = state.nodes.filter((node) => node.id !== state.selectedNode);
      state.edges = state.edges.filter((edge) => edge.from !== state.selectedNode && edge.to !== state.selectedNode);
      state.selectedNode = null;
    }
    paint();
    ctx.onChange();
  }

  function clearAll() {
    if (state.locked) {
      return;
    }
    state.nodes = (step.start?.nodes || []).map((node) => ({ ...node, x: node.x ?? 10, y: node.y ?? 50 }));
    state.edges = [];
    state.selectedNode = null;
    state.selectedEdge = null;
    paint();
    ctx.onChange();
  }

  // ── view ─────────────────────────────────────────────────────────────────

  function paint() {
    board.replaceChildren(svg);
    svg.append(ghost);
    for (const node of state.nodes) {
      const element = nodeElement(node, { interactive: !state.locked });
      element.classList.toggle("is-selected", state.selectedNode === node.id);
      element.classList.toggle("is-connecting", state.connectFrom === node.id);
      if (!state.locked) {
        const port = h("span", { class: "arch-port", title: "Drag to another box to connect", "aria-label": `Connect ${nodeLabel(node)}` });
        port.addEventListener("pointerdown", (event) => startConnect(event, node.id));
        element.append(port);
        if (node.type === "service" || node.type === "worker") {
          element.addEventListener("dblclick", () => rename(node));
        }
        element.addEventListener("pointerdown", (event) => startDrag(event, node));
      }
      board.append(element);
    }
    if (state.nodes.length <= (step.start?.nodes?.length || 0) && !state.locked) {
      board.append(h("div", { class: "board-empty", text: "Click or drag components from the left to start your design." }));
    }
    requestAnimationFrame(drawEdges);
    status.textContent = `${state.nodes.length} components · ${state.edges.length} connections`;
  }

  function drawEdges() {
    const marks = state.result ? null : null;
    layoutEdges(svg, board, state, {
      selected: state.selectedEdge,
      marks,
      onSelect: state.locked
        ? null
        : (index) => {
            state.selectedEdge = index;
            state.selectedNode = null;
            paint();
          }
    });
    svg.append(ghost);
  }

  function rename(node) {
    const label = window.prompt("Name this component", node.label || COMPONENTS[node.type].label);
    if (label != null) {
      node.label = label.trim().slice(0, 28) || undefined;
      paint();
    }
  }

  // ── pointer interactions ─────────────────────────────────────────────────

  function toPercent(event) {
    const rect = board.getBoundingClientRect();
    return {
      x: Math.max(6, Math.min(94, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(8, Math.min(92, ((event.clientY - rect.top) / rect.height) * 100))
    };
  }

  function startDrag(event, node) {
    if (event.button !== 0 || event.target.closest(".arch-port")) {
      return;
    }
    event.preventDefault();
    const origin = { x: event.clientX, y: event.clientY };
    let moved = false;
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    const onMove = (moveEvent) => {
      if (!moved && Math.hypot(moveEvent.clientX - origin.x, moveEvent.clientY - origin.y) < 4) {
        return;
      }
      moved = true;
      const point = toPercent(moveEvent);
      node.x = point.x;
      node.y = point.y;
      element.style.left = `${node.x}%`;
      element.style.top = `${node.y}%`;
      drawEdges();
    };
    const onUp = () => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerup", onUp);
      if (!moved) {
        if (state.connectFrom && state.connectFrom !== node.id) {
          connect(state.connectFrom, node.id);
          state.connectFrom = null;
        } else {
          state.selectedNode = state.selectedNode === node.id ? null : node.id;
          state.selectedEdge = null;
        }
        paint();
      }
    };
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerup", onUp);
  }

  function startConnect(event, fromId) {
    event.preventDefault();
    event.stopPropagation();
    const rect = board.getBoundingClientRect();
    const fromElement = board.querySelector(`.arch-node[data-id="${fromId}"]`);
    const fromBox = fromElement.getBoundingClientRect();
    const start = { x: fromBox.left - rect.left + fromBox.width / 2, y: fromBox.top - rect.top + fromBox.height / 2 };
    const origin = { x: event.clientX, y: event.clientY };
    let moved = false;
    const onMove = (moveEvent) => {
      if (Math.hypot(moveEvent.clientX - origin.x, moveEvent.clientY - origin.y) > 4) {
        moved = true;
      }
      ghost.setAttribute("x1", start.x);
      ghost.setAttribute("y1", start.y);
      ghost.setAttribute("x2", moveEvent.clientX - rect.left);
      ghost.setAttribute("y2", moveEvent.clientY - rect.top);
      ghost.setAttribute("visibility", "visible");
    };
    const onUp = (upEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      ghost.setAttribute("visibility", "hidden");
      if (!moved) {
        // Click-to-connect: remember the source, the next box click finishes.
        state.connectFrom = state.connectFrom === fromId ? null : fromId;
        paint();
        return;
      }
      const target = document.elementFromPoint(upEvent.clientX, upEvent.clientY)?.closest(".arch-node");
      if (target && board.contains(target)) {
        connect(fromId, target.dataset.id);
      }
      paint();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  board.addEventListener("pointerdown", (event) => {
    if (event.target === board || event.target === svg) {
      state.selectedNode = null;
      state.selectedEdge = null;
      state.connectFrom = null;
      paint();
    }
  });
  board.addEventListener("dragover", (event) => event.preventDefault());
  board.addEventListener("drop", (event) => {
    const type = event.dataTransfer.getData("application/x-component");
    if (type) {
      event.preventDefault();
      const point = toPercent(event);
      addNode(type, point.x, point.y);
    }
  });
  board.addEventListener("keydown", (event) => {
    if ((event.key === "Delete" || event.key === "Backspace") && !isTyping()) {
      event.preventDefault();
      removeSelected();
    }
  });
  new ResizeObserver(() => drawEdges()).observe(board);

  paint();

  const graph = () => ({ nodes: state.nodes.map(({ id, type, label }) => ({ id, type, label })), edges: state.edges.map(({ from, to }) => ({ from, to })) });

  return {
    el,
    wide: true,
    ready: () => state.nodes.length >= 2 && state.edges.length >= 1,
    check() {
      const result = gradeGraph(graph(), step.rules);
      const verdict = result.passed ? "correct" : result.score >= 0.5 ? "partial" : "wrong";
      return {
        correct: result.passed,
        score: result.score,
        verdict,
        response: `${state.nodes.map((node) => nodeLabel(node)).join(", ")} | ${state.edges.map((edge) => `${edge.from}-${edge.to}`).join(", ")}`,
        detail: result,
        graph: graph()
      };
    },
    show(result) {
      state.locked = true;
      state.result = result.detail;
      state.selectedNode = null;
      state.selectedEdge = null;
      paint();
      el.classList.add("is-locked");
    },
    explain(result) {
      const checks = result.detail.checks;
      const list = h(
        "ul",
        { class: "rule-checks" },
        checks.map((check) =>
          h(
            "li",
            { class: check.ok ? "is-hit" : "is-miss" },
            h("span", { class: "check-mark" }, icon(check.ok ? "check" : "x", { size: 14 })),
            h("div", null, h("strong", { text: check.text }), check.why && h("span", { class: "rule-why", text: check.why }))
          )
        )
      );
      const toggle = h(
        "button",
        {
          type: "button",
          class: "btn btn-sm",
          onClick: () => {
            state.showSolution = !state.showSolution;
            toggle.querySelector(".btn-label").textContent = state.showSolution ? "Hide reference design" : "Compare with the reference design";
            solutionSlot.replaceChildren(
              ...(state.showSolution && step.solution ? [h("div", { class: "explain-label", text: "Reference design" }), renderDiagram(step.solution, { className: "solution-board" })] : [])
            );
          }
        },
        icon("eye", { size: 14 }),
        h("span", { class: "btn-label", text: "Compare with the reference design" })
      );
      return h(
        "div",
        { class: "explain-block" },
        h("div", { class: "explain-label", text: `Design checks · ${checks.filter((check) => check.ok).length} of ${checks.length} · ${Math.round(result.detail.score * 100)}%` }),
        list,
        step.solution && toggle
      );
    },
    autoHint() {
      const failing = gradeGraph(graph(), step.rules).checks.find((check) => !check.ok);
      return failing ? `Next, work on: ${failing.text}.` : "Every check passes — press Check.";
    },
    hotkey(key) {
      if ((key === "Delete" || key === "Backspace") && (state.selectedNode || state.selectedEdge != null)) {
        removeSelected();
        return true;
      }
      return false;
    }
  };
}
