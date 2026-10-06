// Tiny, safe rich-text renderer for course text: paragraphs (blank lines),
// "- " bullet lists, **bold**, *italic*, and `code`. Builds DOM nodes with
// textContent only — course files can never inject HTML.

export function rich(text, { inline = false } = {}) {
  const fragment = document.createDocumentFragment();
  const source = String(text ?? "");
  if (inline) {
    appendInline(fragment, source.replace(/\s*\n\s*/g, " "));
    return fragment;
  }

  for (const block of source.split(/\n\s*\n/)) {
    const lines = block.split("\n").filter((line) => line.trim() !== "");
    if (lines.length === 0) {
      continue;
    }
    if (lines.every((line) => /^\s*[-•]\s+/.test(line))) {
      const list = document.createElement("ul");
      for (const line of lines) {
        const item = document.createElement("li");
        appendInline(item, line.replace(/^\s*[-•]\s+/, ""));
        list.append(item);
      }
      fragment.append(list);
      continue;
    }
    const paragraph = document.createElement("p");
    lines.forEach((line, index) => {
      if (index > 0) {
        paragraph.append(document.createElement("br"));
      }
      appendInline(paragraph, line);
    });
    fragment.append(paragraph);
  }
  return fragment;
}

// Plain text with the markup stripped — for titles, logs, and exports.
export function plain(text) {
  return String(text ?? "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/`(.+?)`/g, "$1");
}

function appendInline(parent, text) {
  const pattern = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parent.append(text.slice(last, match.index));
    }
    const token = match[0];
    let element;
    if (token.startsWith("**")) {
      element = document.createElement("strong");
      element.textContent = token.slice(2, -2);
    } else if (token.startsWith("`")) {
      element = document.createElement("code");
      element.textContent = token.slice(1, -1);
    } else {
      element = document.createElement("em");
      element.textContent = token.slice(1, -1);
    }
    parent.append(element);
    last = pattern.lastIndex;
  }
  if (last < text.length) {
    parent.append(text.slice(last));
  }
}
