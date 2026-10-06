// Shared presentational pieces: buttons, cards, stat tiles, meters, rings,
// chips, and empty states. Views compose these instead of hand-building DOM.

import { h, s } from "../lib/dom.js";
import { icon } from "./icons.js";

export function button(label, { variant = "default", size = null, iconName = null, iconAfter = null, onClick = null, disabled = false, title = null, kbd = null, className = null, type = "button", attrs = {} } = {}) {
  return h(
    "button",
    {
      type,
      class: ["btn", `btn-${variant}`, size && `btn-${size}`, !label && "btn-icon-only", className],
      onClick,
      disabled,
      title,
      "aria-label": !label ? title : null,
      ...attrs
    },
    iconName && icon(iconName),
    label && h("span", { class: "btn-label", text: label }),
    kbd && h("kbd", { text: kbd }),
    iconAfter && icon(iconAfter)
  );
}

export function linkButton(label, href, options = {}) {
  const element = button(label, options);
  element.addEventListener("click", () => {
    location.hash = href;
  });
  return element;
}

export function pageHead({ eyebrow = null, title, sub = null, actions = [], back = null }) {
  return h(
    "header",
    { class: "page-head" },
    h(
      "div",
      { class: "page-head-text" },
      back && h("a", { class: "back-link", href: back.href }, icon("arrowLeft", { size: 16 }), back.label),
      eyebrow && h("p", { class: "eyebrow", text: eyebrow }),
      h("h1", { class: "page-title", text: title }),
      sub && h("p", { class: "page-sub", text: sub })
    ),
    actions.length > 0 && h("div", { class: "page-actions" }, actions)
  );
}

export function card({ title = null, sub = null, actions = null, className = null, tag = "section" } = {}, ...children) {
  return h(
    tag,
    { class: ["card", className] },
    (title || actions) &&
      h(
        "div",
        { class: "card-head" },
        h("div", null, title && h("h2", { class: "card-title", text: title }), sub && h("p", { class: "card-sub", text: sub })),
        actions && h("div", { class: "card-actions" }, actions)
      ),
    children
  );
}

export function statTile({ label, value, sub = null, tone = null }) {
  return h(
    "div",
    { class: ["stat-tile", tone && `tone-${tone}`] },
    h("div", { class: "stat-label", text: label }),
    h("div", { class: "stat-value", text: value }),
    sub && h("div", { class: "stat-sub", text: sub })
  );
}

export function meter(value, { tone = "accent", label = null, className = null } = {}) {
  const clamped = Math.max(0, Math.min(1, value || 0));
  return h(
    "div",
    {
      class: ["meter", `meter-${tone}`, className],
      role: "meter",
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "aria-valuenow": String(Math.round(clamped * 100)),
      "aria-label": label,
      style: { "--v": `${(clamped * 100).toFixed(1)}%` }
    },
    h("span", { class: "meter-fill" })
  );
}

// Circular progress ring with a centered label.
export function ring(value, { size = 64, stroke = 6, label = null, sublabel = null, tone = "accent", ariaLabel = null } = {}) {
  const clamped = Math.max(0, Math.min(1, value || 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return h(
    "div",
    { class: ["ring", `ring-${tone}`], style: { width: `${size}px`, height: `${size}px` }, role: "img", "aria-label": ariaLabel || label },
    s(
      "svg",
      { width: size, height: size, viewBox: `0 0 ${size} ${size}`, "aria-hidden": "true" },
      s("circle", { class: "ring-track", cx: size / 2, cy: size / 2, r: radius, "stroke-width": stroke, fill: "none" }),
      s("circle", {
        class: "ring-fill",
        cx: size / 2,
        cy: size / 2,
        r: radius,
        "stroke-width": stroke,
        fill: "none",
        "stroke-linecap": "round",
        "stroke-dasharray": circumference.toFixed(2),
        "stroke-dashoffset": (circumference * (1 - clamped)).toFixed(2),
        transform: `rotate(-90 ${size / 2} ${size / 2})`
      })
    ),
    (label || sublabel) &&
      h("div", { class: "ring-label" }, label && h("strong", { text: label }), sublabel && h("span", { text: sublabel }))
  );
}

export function chip(text, { tone = null, iconName = null, title = null } = {}) {
  return h("span", { class: ["chip", tone && `chip-${tone}`], title }, iconName && icon(iconName, { size: 14 }), text);
}

export function emptyState({ iconName = "sparkle", title, body = null, actions = [] }) {
  return h(
    "div",
    { class: "empty" },
    h("div", { class: "empty-icon" }, icon(iconName, { size: 28 })),
    h("h2", { class: "empty-title", text: title }),
    body && h("p", { class: "empty-body", text: body }),
    actions.length > 0 && h("div", { class: "empty-actions" }, actions)
  );
}

// Single-choice button group (accessible as a radio group).
export function segmented(options, value, onChange, { label = null, size = null } = {}) {
  const group = h("div", { class: ["segmented", size && `segmented-${size}`], role: "radiogroup", "aria-label": label });
  for (const option of options) {
    const selected = option.value === value;
    group.append(
      h(
        "button",
        {
          type: "button",
          role: "radio",
          "aria-checked": String(selected),
          class: ["segment", selected && "is-selected"],
          title: option.title || null,
          onClick: (clickEvent) => {
            for (const sibling of group.children) {
              sibling.classList.toggle("is-selected", sibling === clickEvent.currentTarget);
              sibling.setAttribute("aria-checked", String(sibling === clickEvent.currentTarget));
            }
            onChange(option.value);
          }
        },
        option.label
      )
    );
  }
  return group;
}

export function pct(value, digits = 0) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

export function masteryLabel(value) {
  if (value >= 0.8) {
    return "Mastered";
  }
  if (value >= 0.5) {
    return "Strengthening";
  }
  if (value > 0.05) {
    return "Building";
  }
  return "Not started";
}

// Sets the mastery shade (a blue step from surface → accent) on an element.
export function shadeByMastery(element, value) {
  const clamped = Math.max(0, Math.min(1, value || 0));
  element.style.setProperty("--mastery", `${Math.round(clamped * 100)}%`);
  element.style.setProperty("--tint", `${Math.round(clamped * 22)}%`);
  return element;
}

export function plural(count, noun, pluralNoun = `${noun}s`) {
  return `${count} ${count === 1 ? noun : pluralNoun}`;
}
