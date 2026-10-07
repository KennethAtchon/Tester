// Subjects are the top level of the catalog: subject → courses → units →
// lessons. Built-in subjects come from subjects/<id>/subject.json; the
// learner can create their own from a preset or from scratch.

import { slugify } from "../lib/util.js";

export const SUBJECT_ICONS = ["layers", "sigma", "flask", "leaf", "code", "chat", "landmark", "music", "briefcase", "palette", "heart", "globe", "compass", "book"];

export const SUBJECT_COLORS = ["#2f6df6", "#5b4cf0", "#8b5cf6", "#0f9fb3", "#1f9d55", "#c27f00", "#f26b2a", "#e0483a", "#e4579a", "#64708a"];

// One click fills in a sensible name, icon, and color.
export const SUBJECT_PRESETS = [
  { title: "Math", icon: "sigma", color: "#5b4cf0", description: "Numbers, algebra, geometry, and the reasoning behind them." },
  { title: "Science", icon: "flask", color: "#0f9fb3", description: "How the physical and natural world works." },
  { title: "Biology", icon: "leaf", color: "#1f9d55", description: "Living things, from cells to ecosystems." },
  { title: "Programming", icon: "code", color: "#2f6df6", description: "Writing, reading, and reasoning about code." },
  { title: "Languages", icon: "chat", color: "#e4579a", description: "Vocabulary, grammar, and real conversation." },
  { title: "History", icon: "landmark", color: "#c27f00", description: "People, events, and why they mattered." },
  { title: "Music", icon: "music", color: "#f26b2a", description: "Theory, ear training, and instruments." },
  { title: "Business", icon: "briefcase", color: "#64708a", description: "Strategy, finance, and how companies work." },
  { title: "Art & design", icon: "palette", color: "#8b5cf6", description: "Visual thinking, composition, and craft." },
  { title: "Health", icon: "heart", color: "#e0483a", description: "The body, medicine, and staying well." }
];

// Courses that don't name a subject land here.
export const GENERAL_SUBJECT = { id: "general", title: "General", description: "Courses that aren't in a subject yet.", icon: "book", color: "#64708a" };

export function normalizeSubject(raw, source) {
  const title = typeof raw?.title === "string" ? raw.title.trim() : "";
  if (!title) {
    throw new Error("A subject needs a title.");
  }
  const id = slugify(raw.id || title);
  return {
    id,
    title,
    description: typeof raw.description === "string" ? raw.description.trim() : "",
    icon: SUBJECT_ICONS.includes(raw.icon) ? raw.icon : "book",
    color: /^#[0-9a-f]{6}$/i.test(raw.color || "") ? raw.color : SUBJECT_COLORS[hashText(id) % SUBJECT_COLORS.length],
    source
  };
}

function hashText(text) {
  let value = 0;
  for (const char of text) {
    value = (value * 31 + char.charCodeAt(0)) >>> 0;
  }
  return value;
}
