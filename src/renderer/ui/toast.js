// Transient status messages, announced to screen readers.

import { h } from "../lib/dom.js";
import { icon } from "./icons.js";

const ICONS = { info: "sparkle", success: "check", error: "alert" };

export function toast(message, { tone = "info", timeout = 4200 } = {}) {
  const region = document.querySelector("#toastRegion");
  if (!region) {
    return;
  }
  const element = h(
    "div",
    { class: `toast toast-${tone}`, role: tone === "error" ? "alert" : "status" },
    icon(ICONS[tone] || "sparkle", { size: 16 }),
    h("span", { text: message })
  );
  region.append(element);
  setTimeout(() => {
    element.classList.add("is-leaving");
    setTimeout(() => element.remove(), 250);
  }, timeout);
}
