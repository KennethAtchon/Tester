// Pure, dependency-free helpers shared across the renderer modules.

export function stringify(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function slugify(value) {
  return stringify(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getUniqueId(id, usedIds) {
  const baseId = id || "item";
  let candidate = baseId;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

export function isAnswered(answer) {
  if (Array.isArray(answer)) {
    return answer.length > 0;
  }
  return Boolean(stringify(answer));
}

// Storage key for the code half of a "both" question. The prose half lives
// under the bare question id; the code half lives under this derived key so a
// single question can hold two distinct answers.
export function codeAnswerKey(questionId) {
  return `${questionId}__code`;
}

export function formatExampleName(fileName) {
  return fileName
    .replace(/\.json$/i, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
