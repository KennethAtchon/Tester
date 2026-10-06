// Hash router: "#/name/param/param". Each view is a function
// (container, params) → optional cleanup, re-run on navigation.

const views = new Map();
let cleanup = null;
let afterRender = () => {};

export function registerViews(map, { onRender } = {}) {
  for (const [name, view] of Object.entries(map)) {
    views.set(name, view);
  }
  if (onRender) {
    afterRender = onRender;
  }
}

export function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || "home", params: parts.slice(1) };
}

export function href(name, ...params) {
  return `#/${[name, ...params.map((param) => encodeURIComponent(param))].join("/")}`;
}

export function navigate(name, ...params) {
  const target = href(name, ...params);
  if (location.hash === target) {
    render(false);
  } else {
    location.hash = target;
  }
}

// Re-render the current view in place (after data changes).
export function refresh() {
  render(true);
}

export function startRouter() {
  window.addEventListener("hashchange", () => render(false));
  render(false);
}

function render(keepScroll) {
  const main = document.querySelector("#main");
  const scroll = main.scrollTop;
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  main.replaceChildren();
  const { name, params } = route();
  const view = views.get(name) || views.get("home");
  document.body.dataset.route = views.has(name) ? name : "home";
  const result = view(main, params);
  cleanup = typeof result === "function" ? result : null;
  main.scrollTop = keepScroll ? scroll : 0;
  afterRender();
}
