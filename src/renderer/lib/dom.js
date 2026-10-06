// Tiny DOM builder used by every view. Text always goes in via textContent,
// never innerHTML, so library content can't inject markup.

const SVG_NS = "http://www.w3.org/2000/svg";

export function h(tag, props = null, ...children) {
  const element = document.createElement(tag);
  applyProps(element, props);
  appendChildren(element, children);
  return element;
}

export function s(tag, attrs = null, ...children) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) {
      continue;
    }
    if (name === "text") {
      element.textContent = value;
    } else if (name.startsWith("on") && typeof value === "function") {
      element.addEventListener(name.slice(2).toLowerCase(), value);
    } else {
      element.setAttribute(name, String(value));
    }
  }
  appendChildren(element, children);
  return element;
}

function applyProps(element, props) {
  for (const [name, value] of Object.entries(props || {})) {
    if (value == null || value === false) {
      continue;
    }
    if (name === "class") {
      element.className = Array.isArray(value) ? value.filter(Boolean).join(" ") : value;
    } else if (name === "text") {
      element.textContent = value;
    } else if (name === "style" && typeof value === "object") {
      for (const [property, styleValue] of Object.entries(value)) {
        if (property.startsWith("--")) {
          element.style.setProperty(property, styleValue);
        } else {
          element.style[property] = styleValue;
        }
      }
    } else if (name === "dataset") {
      Object.assign(element.dataset, value);
    } else if (name.startsWith("on") && typeof value === "function") {
      element.addEventListener(name.slice(2).toLowerCase(), value);
    } else if (name === "value" || name === "checked" || name === "disabled" || name === "hidden" || name === "open" || name === "selected") {
      element[name] = value;
    } else if (value === true) {
      element.setAttribute(name, "");
    } else {
      element.setAttribute(name, String(value));
    }
  }
}

// Like element.append, but skips null/false children the way h() does.
export function append(element, ...children) {
  appendChildren(element, children);
  return element;
}

function appendChildren(element, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === true) {
      continue;
    }
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

// True when keyboard shortcuts should stand down (the user is typing).
export function isTyping(target = document.activeElement) {
  if (!target) {
    return false;
  }
  const tag = target.tagName;
  if (tag === "INPUT" && ["radio", "checkbox", "button", "submit", "range"].includes(target.type)) {
    return false;
  }
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable || Boolean(target.closest?.(".CodeMirror"));
}
