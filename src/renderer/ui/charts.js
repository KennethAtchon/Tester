// Small SVG chart kit for Insights. Thin marks, hairline grid, one axis, text
// in ink tokens (never series color), a hover/focus tooltip on every mark, and
// a table view for every chart so no value is gated behind hover.

import { h, s } from "../lib/dom.js";

const W = 560;
const PAD = { top: 16, right: 16, bottom: 30, left: 40 };

// Wraps a chart with a title, subtitle, legend, and a chart/table toggle.
export function chartCard({ title, sub = null, legend = null, chart, table, note = null }) {
  const body = h("div", { class: "chart-body" }, chart);
  let showingTable = false;
  const toggle = h("button", {
    type: "button",
    class: "btn btn-ghost btn-sm",
    text: "Table",
    "aria-pressed": "false",
    onClick: () => {
      showingTable = !showingTable;
      toggle.textContent = showingTable ? "Chart" : "Table";
      toggle.setAttribute("aria-pressed", String(showingTable));
      body.replaceChildren(showingTable ? table : chart);
    }
  });
  return h(
    "section",
    { class: "card chart-card" },
    h("div", { class: "card-head" }, h("div", null, h("h2", { class: "card-title", text: title }), sub && h("p", { class: "card-sub", text: sub })), h("div", { class: "card-actions" }, toggle)),
    legend && h("div", { class: "chart-legend" }, legend),
    body,
    note && h("p", { class: "chart-note", text: note })
  );
}

export function legendItem(label, kind = "dot", variant = "series") {
  return h("span", { class: "legend-item" }, h("span", { class: `legend-key key-${kind} key-${variant}` }), label);
}

export function dataTable(columns, rows) {
  return h(
    "div",
    { class: "table-wrap" },
    h(
      "table",
      { class: "table table-compact" },
      h("thead", null, h("tr", null, columns.map((column) => h("th", { text: column })))),
      h("tbody", null, rows.map((row) => h("tr", null, row.map((cell) => h("td", { text: cell == null ? "—" : String(cell) })))))
    )
  );
}

// Vertical columns from a shared baseline. data: [{ label, value, tip }]
export function columnChart({ data, max = null, height = 200, format = (value) => String(value), band = null, integer = false, ariaLabel }) {
  const innerW = W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const peak = Math.max(1, ...data.map((entry) => entry.value ?? 0));
  // Counts get a top that's a multiple of 4 so every gridline is a whole number.
  const top = max ?? (integer ? Math.max(4, Math.ceil(peak / 4) * 4) : niceMax(peak));
  const slot = innerW / Math.max(1, data.length);
  const barW = Math.min(24, slot * 0.6);
  const y = (value) => PAD.top + innerH - (value / top) * innerH;

  const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${height}`, role: "img", "aria-label": ariaLabel });
  svg.append(gridAndAxis(top, innerH, height, format));

  if (band) {
    svg.append(s("rect", { class: "chart-band", x: PAD.left, width: innerW, y: y(band[1]), height: y(band[0]) - y(band[1]) }));
  }

  data.forEach((entry, index) => {
    const cx = PAD.left + slot * index + slot / 2;
    if (entry.value != null && entry.value > 0) {
      const barH = Math.max(2, (entry.value / top) * innerH);
      svg.append(s("path", { class: "chart-bar", d: roundedTopBar(cx - barW / 2, PAD.top + innerH - barH, barW, barH, Math.min(4, barW / 2)) }));
    }
    svg.append(s("text", { class: "chart-tick", x: cx, y: height - 10, "text-anchor": "middle", text: entry.short ?? entry.label }));
    svg.append(hitTarget(PAD.left + slot * index, PAD.top, slot, innerH, entry.tip ?? `${entry.label}: ${entry.value == null ? "no data" : format(entry.value)}`));
  });
  return svg;
}

// Line with optional area wash, target band, and a snapping crosshair.
// points: [{ x: number, y: number|null, label }], yDomain: [min, max]
export function lineChart({ points, yDomain = [0, 1], height = 200, format = (value) => String(value), band = null, refLine = null, area = false, xTicks = [], ariaLabel }) {
  const innerW = W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const xs = points.map((point) => point.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs, minX + 1);
  const xPos = (value) => PAD.left + ((value - minX) / (maxX - minX)) * innerW;
  const yPos = (value) => PAD.top + innerH - ((value - yDomain[0]) / (yDomain[1] - yDomain[0])) * innerH;

  const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${height}`, role: "img", "aria-label": ariaLabel });
  svg.append(gridAndAxis(yDomain[1], innerH, height, format, yDomain[0]));

  if (band) {
    svg.append(s("rect", { class: "chart-band", x: PAD.left, width: innerW, y: yPos(band[1]), height: yPos(band[0]) - yPos(band[1]) }));
    svg.append(s("text", { class: "chart-band-label", x: PAD.left + innerW - 4, y: yPos(band[1]) - 4, "text-anchor": "end", text: band[2] || "" }));
  }

  if (refLine) {
    svg.append(s("line", { class: "chart-ref", x1: PAD.left, x2: PAD.left + innerW, y1: yPos(refLine.y), y2: yPos(refLine.y) }));
    svg.append(s("text", { class: "chart-band-label", x: PAD.left + innerW - 4, y: yPos(refLine.y) - 5, "text-anchor": "end", text: refLine.label }));
  }

  const valid = points.filter((point) => point.y != null);
  if (valid.length > 0) {
    const d = valid.map((point, index) => `${index ? "L" : "M"}${xPos(point.x).toFixed(1)},${yPos(point.y).toFixed(1)}`).join(" ");
    if (area) {
      svg.append(s("path", { class: "chart-area", d: `${d} L${xPos(valid[valid.length - 1].x).toFixed(1)},${yPos(yDomain[0])} L${xPos(valid[0].x).toFixed(1)},${yPos(yDomain[0])} Z` }));
    }
    svg.append(s("path", { class: "chart-line", d }));
    const last = valid[valid.length - 1];
    svg.append(s("circle", { class: "chart-dot", cx: xPos(last.x), cy: yPos(last.y), r: 4 }));
  }

  for (const tick of xTicks) {
    svg.append(s("text", { class: "chart-tick", x: xPos(tick.x), y: height - 10, "text-anchor": "middle", text: tick.label }));
  }

  // Crosshair: snaps to the nearest x.
  const cross = s("line", { class: "chart-cross", x1: 0, x2: 0, y1: PAD.top, y2: PAD.top + innerH, visibility: "hidden" });
  const marker = s("circle", { class: "chart-dot", r: 4, visibility: "hidden" });
  svg.append(cross, marker);
  const overlay = s("rect", { class: "chart-hit", x: PAD.left, y: PAD.top, width: innerW, height: innerH, tabindex: "0", "aria-label": ariaLabel });
  const showAt = (point) => {
    if (!point) {
      return;
    }
    const px = xPos(point.x);
    cross.setAttribute("x1", px);
    cross.setAttribute("x2", px);
    cross.setAttribute("visibility", "visible");
    if (point.y != null) {
      marker.setAttribute("cx", px);
      marker.setAttribute("cy", yPos(point.y));
      marker.setAttribute("visibility", "visible");
    }
  };
  overlay.addEventListener("pointermove", (event) => {
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    const point = nearest(points, (candidate) => Math.abs(xPos(candidate.x) - x));
    showAt(point);
    showTooltip(event.clientX, event.clientY, point.y == null ? `${point.label}: no data` : `${format(point.y)} · ${point.label}`);
  });
  overlay.addEventListener("pointerleave", () => {
    cross.setAttribute("visibility", "hidden");
    marker.setAttribute("visibility", "hidden");
    hideTooltip();
  });
  overlay.addEventListener("focus", () => {
    const point = valid[valid.length - 1];
    showAt(point);
    const rect = overlay.getBoundingClientRect();
    if (point) {
      showTooltip(rect.right, rect.top, `${format(point.y)} · ${point.label}`);
    }
  });
  overlay.addEventListener("blur", hideTooltip);
  svg.append(overlay);
  return svg;
}

// Dumbbell per confidence level: hollow ring = what you said, dot = how often
// you were right. The gap between them is miscalibration.
export function calibrationChart(buckets, { height = 220 } = {}) {
  const innerW = W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const slot = innerW / buckets.length;
  const y = (value) => PAD.top + innerH - value * innerH;
  const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${height}`, role: "img", "aria-label": "Calibration: stated confidence versus actual accuracy" });
  svg.append(gridAndAxis(1, innerH, height, (value) => `${Math.round(value * 100)}%`));

  buckets.forEach((bucket, index) => {
    const cx = PAD.left + slot * index + slot / 2;
    if (bucket.accuracy != null) {
      svg.append(s("line", { class: "chart-stem", x1: cx, x2: cx, y1: y(bucket.expected), y2: y(bucket.accuracy) }));
    }
    svg.append(s("circle", { class: "chart-ring", cx, cy: y(bucket.expected), r: 5 }));
    if (bucket.accuracy != null) {
      svg.append(s("circle", { class: "chart-dot", cx, cy: y(bucket.accuracy), r: 5 }));
    }
    svg.append(s("text", { class: "chart-tick", x: cx, y: height - 10, "text-anchor": "middle", text: `${bucket.label} (${Math.round(bucket.expected * 100)}%)` }));
    const tip = bucket.n
      ? `${Math.round(bucket.accuracy * 100)}% right when you said “${bucket.label}” (${bucket.n} answers)`
      : `No “${bucket.label}” answers yet`;
    svg.append(hitTarget(PAD.left + slot * index, PAD.top, slot, innerH, tip));
  });
  return svg;
}

// Calendar heatmap: columns are weeks, rows Monday→Sunday. Sequential ramp.
export function heatmap(cells, { goal, unit = "XP" }) {
  const size = 14;
  const gap = 3;
  const weeks = Math.ceil(cells.length / 7);
  const left = 28;
  const width = left + weeks * (size + gap);
  const height = 7 * (size + gap) + 18;
  const svg = s("svg", { class: "chart heatmap", viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "Practice calendar" });
  ["Mon", "", "Wed", "", "Fri", "", ""].forEach((label, row) => {
    if (label) {
      svg.append(s("text", { class: "chart-tick", x: 0, y: row * (size + gap) + size - 3, text: label }));
    }
  });
  cells.forEach((cell, index) => {
    const column = Math.floor(index / 7);
    const row = index % 7;
    const level = cell.future ? "future" : cell.frozen && cell.count === 0 ? "frozen" : heatLevel(cell.count, goal);
    const rect = s("rect", {
      class: `heat heat-${level}`,
      x: left + column * (size + gap),
      y: row * (size + gap),
      width: size,
      height: size,
      rx: 3
    });
    svg.append(rect);
    if (!cell.future) {
      const tip = `${cell.day}: ${cell.count} ${unit}${cell.met ? " · goal met" : ""}${cell.frozen ? " · streak freeze" : ""}`;
      attachTip(rect, tip);
    }
    // Label a column with its month when it holds the month's first Monday.
    if (index % 7 === 0) {
      const [, month, day] = cell.day.split("-").map(Number);
      if (day <= 7) {
        svg.append(s("text", { class: "chart-tick", x: left + column * (size + gap), y: height - 2, text: new Date(2000, month - 1, 1).toLocaleDateString(undefined, { month: "short" }) }));
      }
    }
  });
  return svg;
}

function heatLevel(count, goal) {
  if (count <= 0) {
    return 0;
  }
  if (count < goal / 2) {
    return 1;
  }
  if (count < goal) {
    return 2;
  }
  if (count < goal * 2) {
    return 3;
  }
  return 4;
}

function gridAndAxis(top, innerH, height, format, bottom = 0) {
  const group = s("g", { class: "chart-grid" });
  const steps = 4;
  for (let index = 0; index <= steps; index += 1) {
    const value = bottom + ((top - bottom) * index) / steps;
    const yy = PAD.top + innerH - (innerH * index) / steps;
    group.append(s("line", { class: index === 0 ? "chart-baseline" : "chart-gridline", x1: PAD.left, x2: W - PAD.right, y1: yy, y2: yy }));
    group.append(s("text", { class: "chart-tick", x: PAD.left - 8, y: yy + 4, "text-anchor": "end", text: format(value) }));
  }
  return group;
}

function hitTarget(x, y, width, height, tip) {
  const rect = s("rect", { class: "chart-hit", x, y, width, height, tabindex: "0", "aria-label": tip });
  attachTip(rect, tip);
  return rect;
}

function attachTip(element, tip) {
  element.addEventListener("pointermove", (event) => showTooltip(event.clientX, event.clientY, tip));
  element.addEventListener("pointerleave", hideTooltip);
  element.addEventListener("focus", () => {
    const rect = element.getBoundingClientRect();
    showTooltip(rect.left + rect.width / 2, rect.top, tip);
  });
  element.addEventListener("blur", hideTooltip);
}

function roundedTopBar(x, y, width, height, radius) {
  const r = Math.min(radius, height);
  return `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`;
}

function nearest(list, distance) {
  return list.reduce((best, candidate) => (!best || distance(candidate) < distance(best) ? candidate : best), null);
}

function niceMax(value) {
  const exponent = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * exponent >= value) {
      return step * exponent;
    }
  }
  return 10 * exponent;
}

let tooltip = null;

function showTooltip(x, y, text) {
  if (!tooltip) {
    tooltip = h("div", { class: "chart-tooltip", role: "tooltip" });
    document.body.append(tooltip);
  }
  tooltip.textContent = text;
  tooltip.style.display = "block";
  const width = tooltip.offsetWidth;
  const left = Math.min(window.innerWidth - width - 8, Math.max(8, x - width / 2));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(8, y - tooltip.offsetHeight - 12)}px`;
}

export function hideTooltip() {
  if (tooltip) {
    tooltip.style.display = "none";
  }
}
