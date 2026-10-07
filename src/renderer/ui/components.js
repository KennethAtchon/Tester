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

// A modal dialog: Esc, the close button, or a click outside closes it.
export function openDialog({ title, body, actions = [], className = null, onClose = null }) {
  const previous = document.activeElement;
  const backdrop = h("div", { class: "dialog-backdrop" });
  const close = () => {
    document.removeEventListener("keydown", onKey, true);
    backdrop.remove();
    previous?.focus?.();
    onClose?.();
  };
  const onKey = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  };
  const dialog = h(
    "div",
    { class: ["dialog", className], role: "dialog", "aria-modal": "true", "aria-label": title },
    h("header", { class: "dialog-head" }, h("h2", { class: "dialog-title", text: title }), h("button", { type: "button", class: "icon-btn dialog-close", "aria-label": "Close", onClick: close }, icon("x", { size: 16 }))),
    h("div", { class: "dialog-body" }, body),
    actions.length > 0 && h("footer", { class: "dialog-actions" }, actions)
  );
  backdrop.append(dialog);
  backdrop.addEventListener("pointerdown", (event) => {
    if (event.target === backdrop) {
      close();
    }
  });
  document.addEventListener("keydown", onKey, true);
  document.body.append(backdrop);
  requestAnimationFrame(() => dialog.querySelector("input, textarea, select")?.focus());
  return { close, element: dialog };
}

// A small menu anchored under an element. items: { label, iconName?, swatch?,
// active?, onSelect } or "divider".
export function openMenu(anchor, items, { className = null } = {}) {
  const rect = anchor.getBoundingClientRect();
  const layer = h("div", { class: "menu-layer" });
  const close = () => {
    document.removeEventListener("keydown", onKey, true);
    layer.remove();
  };
  const onKey = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      anchor.focus();
    }
  };
  const menu = h(
    "div",
    { class: ["menu", className], role: "menu", style: { left: `${Math.round(rect.left)}px`, top: `${Math.round(rect.bottom + 6)}px`, minWidth: `${Math.round(rect.width)}px` } },
    items.map((item) =>
      item === "divider"
        ? h("div", { class: "menu-divider", role: "separator" })
        : h(
            "button",
            {
              type: "button",
              role: "menuitem",
              class: ["menu-item", item.active && "is-active"],
              onClick: () => {
                close();
                item.onSelect();
              }
            },
            item.swatch ? h("span", { class: "menu-swatch", style: { "--swatch": item.swatch } }, item.iconName && icon(item.iconName, { size: 14 })) : item.iconName && icon(item.iconName, { size: 16 }),
            h("span", { class: "menu-label", text: item.label }),
            item.active && icon("check", { size: 16, className: "menu-check" })
          )
    )
  );
  layer.append(menu);
  layer.addEventListener("pointerdown", (event) => {
    if (event.target === layer) {
      close();
    }
  });
  document.addEventListener("keydown", onKey, true);
  document.body.append(layer);
  requestAnimationFrame(() => menu.querySelector(".menu-item")?.focus());
  return { close };
}
