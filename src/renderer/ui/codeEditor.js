// Upgrades code-answer textareas into CodeMirror 5 editors with a language
// selector. CM5 and its modes are loaded as globals (window.CodeMirror) via
// classic <script> tags in index.html, so this module has no CM import — if CM
// failed to load, the plain textarea still works.

import { getEditorLang, setEditorLang } from "../state/store.js";

// Languages offered in the selector, mapped to the CM5 MIME each vendored mode
// registers. The clike mode covers Java/C/C++/C#. Highlighting only — the
// code_run sandbox always executes JavaScript regardless of this choice.
const LANGUAGES = [
  { value: "javascript", label: "JavaScript", mime: "text/javascript" },
  { value: "typescript", label: "TypeScript", mime: "text/typescript" },
  { value: "python", label: "Python", mime: "text/x-python" },
  { value: "java", label: "Java", mime: "text/x-java" },
  { value: "cpp", label: "C++", mime: "text/x-c++src" },
  { value: "c", label: "C", mime: "text/x-csrc" },
  { value: "csharp", label: "C#", mime: "text/x-csharp" },
  { value: "go", label: "Go", mime: "text/x-go" },
  { value: "rust", label: "Rust", mime: "text/x-rustsrc" },
  { value: "ruby", label: "Ruby", mime: "text/x-ruby" },
  { value: "sql", label: "SQL", mime: "text/x-sql" },
  { value: "css", label: "CSS", mime: "text/css" },
  { value: "xml", label: "XML / HTML", mime: "application/xml" },
  { value: "yaml", label: "YAML", mime: "text/x-yaml" },
  { value: "shell", label: "Shell", mime: "text/x-sh" },
  { value: "json", label: "JSON", mime: "application/json" }
];

const MIME_BY_VALUE = new Map(LANGUAGES.map((lang) => [lang.value, lang.mime]));

// Keyword pools for autocomplete, per language value. Suggestions also include
// every word already typed in the editor, so identifiers complete too. Kept to
// common keywords/builtins — not exhaustive — to stay useful without noise.
const KEYWORDS = {
  javascript: ["function", "return", "const", "let", "var", "if", "else", "for", "while", "switch", "case", "break", "continue", "class", "extends", "constructor", "new", "this", "super", "import", "export", "default", "async", "await", "try", "catch", "finally", "throw", "typeof", "instanceof", "null", "undefined", "true", "false", "console", "Promise", "Array", "Object", "JSON", "Math"],
  typescript: ["function", "return", "const", "let", "interface", "type", "enum", "implements", "extends", "public", "private", "protected", "readonly", "class", "constructor", "import", "export", "async", "await", "string", "number", "boolean", "void", "any", "unknown", "never", "this", "new", "if", "else", "for", "while"],
  python: ["def", "return", "class", "self", "import", "from", "as", "if", "elif", "else", "for", "while", "in", "not", "and", "or", "is", "None", "True", "False", "try", "except", "finally", "raise", "with", "lambda", "yield", "global", "nonlocal", "pass", "break", "continue", "print", "len", "range", "enumerate", "dict", "list", "set", "tuple", "str", "int", "float", "__init__"],
  java: ["public", "private", "protected", "class", "interface", "extends", "implements", "static", "final", "void", "return", "new", "this", "super", "if", "else", "for", "while", "switch", "case", "break", "continue", "try", "catch", "finally", "throw", "throws", "import", "package", "int", "long", "double", "boolean", "String", "System", "println"],
  cpp: ["int", "long", "double", "float", "char", "bool", "void", "auto", "const", "return", "class", "struct", "public", "private", "protected", "if", "else", "for", "while", "switch", "case", "break", "continue", "new", "delete", "template", "typename", "namespace", "using", "std", "include", "cout", "cin", "vector", "string"],
  c: ["int", "long", "double", "float", "char", "void", "const", "static", "return", "struct", "typedef", "enum", "union", "if", "else", "for", "while", "switch", "case", "break", "continue", "sizeof", "include", "define", "printf", "scanf", "malloc", "free", "NULL"],
  csharp: ["public", "private", "protected", "internal", "class", "interface", "struct", "static", "void", "return", "new", "this", "base", "if", "else", "for", "foreach", "while", "switch", "case", "break", "continue", "try", "catch", "finally", "throw", "using", "namespace", "var", "string", "int", "bool", "Console", "WriteLine"],
  go: ["func", "return", "package", "import", "var", "const", "type", "struct", "interface", "map", "chan", "go", "defer", "if", "else", "for", "range", "switch", "case", "break", "continue", "select", "nil", "true", "false", "string", "int", "error", "make", "len", "append", "fmt", "Println"],
  rust: ["fn", "let", "mut", "const", "return", "struct", "enum", "trait", "impl", "pub", "use", "mod", "match", "if", "else", "for", "while", "loop", "in", "self", "Self", "Some", "None", "Ok", "Err", "Result", "Option", "Vec", "String", "println", "true", "false"],
  ruby: ["def", "end", "class", "module", "return", "if", "elsif", "else", "unless", "while", "until", "for", "in", "do", "begin", "rescue", "ensure", "raise", "yield", "self", "nil", "true", "false", "puts", "require", "attr_accessor", "new", "each", "map"],
  sql: ["SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "TABLE", "ALTER", "DROP", "JOIN", "INNER", "LEFT", "RIGHT", "OUTER", "ON", "GROUP", "BY", "ORDER", "HAVING", "LIMIT", "DISTINCT", "COUNT", "SUM", "AVG", "AND", "OR", "NOT", "NULL", "AS"],
  css: ["color", "background", "background-color", "display", "flex", "grid", "position", "absolute", "relative", "margin", "padding", "border", "width", "height", "font-size", "font-family", "font-weight", "text-align", "justify-content", "align-items", "transform", "transition", "opacity", "z-index", "overflow"],
  xml: ["div", "span", "class", "id", "href", "src", "html", "head", "body", "title", "script", "style", "link", "meta", "section", "article", "header", "footer", "nav", "button", "input", "form", "label"],
  yaml: ["true", "false", "null", "name", "version", "steps", "jobs", "env", "with", "run", "uses", "on", "push", "branches"],
  shell: ["echo", "export", "if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case", "esac", "function", "return", "local", "read", "cd", "ls", "grep", "sed", "awk", "cat", "mkdir", "rm", "cp", "mv"],
  json: ["true", "false", "null"]
};

// Builds a CM hint function for the given (mutable) language ref. Merges the
// language keyword pool with words already in the buffer, filtered by the word
// prefix under the cursor. Case-insensitive match, results keep original case.
function makeHint(getLang) {
  return function hint(editor) {
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    let start = cursor.ch;
    while (start > 0 && /[\w$]/.test(line.charAt(start - 1))) {
      start -= 1;
    }
    const prefix = line.slice(start, cursor.ch);
    if (!prefix) {
      return null;
    }

    const pool = new Set(KEYWORDS[getLang()] || []);
    // Pull identifiers already present in the document.
    const words = editor.getValue().match(/[A-Za-z_$][\w$]*/g) || [];
    for (const word of words) {
      pool.add(word);
    }

    const lowerPrefix = prefix.toLowerCase();
    const list = [...pool]
      .filter((word) => word.toLowerCase().startsWith(lowerPrefix) && word !== prefix)
      .sort()
      .slice(0, 30);

    if (list.length === 0) {
      return null;
    }

    return {
      list,
      from: window.CodeMirror.Pos(cursor.line, start),
      to: window.CodeMirror.Pos(cursor.line, cursor.ch)
    };
  };
}

// Mounts CM5 on every textarea tagged with data-code-editor inside root. Must
// run AFTER the textareas are attached to the document — CM needs layout to
// build its editor. Safe to call repeatedly; mounted editors are skipped.
export function mountCodeEditors(root, test) {
  if (!window.CodeMirror) {
    return; // graceful fallback: textarea stays fully usable
  }

  root.querySelectorAll("textarea[data-code-editor]").forEach((textarea) => {
    if (textarea.dataset.cmMounted === "true") {
      return;
    }
    textarea.dataset.cmMounted = "true";

    const questionId = textarea.dataset.questionId;
    const defaultLang = textarea.dataset.codeEditor;
    // Mutable so the selector can repoint autocomplete to a new keyword pool.
    let lang = getEditorLang(test.id, questionId, defaultLang);
    const hint = makeHint(() => lang);

    const editor = window.CodeMirror.fromTextArea(textarea, {
      mode: MIME_BY_VALUE.get(lang) || "text/plain",
      lineNumbers: true,
      indentUnit: 2,
      tabSize: 2,
      indentWithTabs: false,
      smartIndent: true,
      autoCloseBrackets: true,
      matchBrackets: true,
      viewportMargin: Infinity, // grow to fit content instead of inner-scrolling
      extraKeys: { "Ctrl-Space": (cm) => cm.showHint({ hint, completeSingle: false }) }
    });

    // Auto-suggest as you type: pop the hint list once 2+ word chars are typed,
    // without auto-picking a single match (so typing keeps flowing).
    editor.on("inputRead", (cm, change) => {
      if (cm.state.completionActive || !/[\w$]/.test(change.text[0] || "")) {
        return;
      }
      const token = cm.getTokenAt(cm.getCursor());
      if (token.string.trim().length >= 2) {
        cm.showHint({ hint, completeSingle: false });
      }
    });

    // Bridge CM edits back to the original textarea and re-fire the input event
    // the form's delegated handler listens for (it keys off questionId/value).
    editor.on("change", () => {
      textarea.value = editor.getValue();
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const selector = buildSelector(lang, (next) => {
      lang = next; // repoints autocomplete's keyword pool
      setEditorLang(test.id, questionId, next);
      editor.setOption("mode", MIME_BY_VALUE.get(next) || "text/plain");
    });

    // Drop the selector just above the editor CM built in place of the textarea.
    editor.getWrapperElement().before(selector);

    // Free-form Run for non-test code answers: executes with the real local
    // interpreter for the currently selected language.
    if (textarea.dataset.run === "free") {
      attachFreeRunner(editor, () => lang);
    }
  });
}

// Languages this app knows how to execute locally (must match runExec.js).
// Others get a disabled Run button explaining they aren't runnable.
const RUNNABLE = new Set(["javascript", "typescript", "python", "ruby", "php", "shell", "go", "c", "cpp"]);

// Adds a Run button + results panel below the editor. Reuses the code_run CSS
// classes so it inherits each theme's styling. getLang reads the live language
// so switching the selector changes what interpreter runs.
function attachFreeRunner(editor, getLang) {
  const toolbar = document.createElement("div");
  toolbar.className = "code-runner-toolbar";

  const runButton = document.createElement("button");
  runButton.type = "button";
  runButton.className = "run-button";
  runButton.textContent = "Run";

  const summary = document.createElement("span");
  summary.className = "run-summary";

  toolbar.append(runButton, summary);

  const results = document.createElement("div");
  results.className = "run-results";

  const wrapper = editor.getWrapperElement();
  wrapper.after(toolbar);
  toolbar.after(results);

  const syncRunnable = () => {
    const runnable = RUNNABLE.has(getLang());
    runButton.disabled = !runnable;
    if (!runnable) {
      summary.textContent = `${getLang()} isn't runnable here`;
      summary.className = "run-summary";
    } else if (!results.hasChildNodes()) {
      summary.textContent = "";
      summary.className = "run-summary";
    }
  };
  // The selector change handler re-runs mount-time closures via getLang, but it
  // doesn't call us back, so refresh the button state whenever Run is hovered.
  toolbar.addEventListener("pointerenter", syncRunnable);
  syncRunnable();

  runButton.addEventListener("click", async () => {
    const language = getLang();
    runButton.disabled = true;
    runButton.textContent = "Running…";
    summary.textContent = "";
    results.replaceChildren();

    try {
      const result = await window.testFiles.execCode({ language, code: editor.getValue() });
      renderExecResult(results, summary, result);
    } catch (error) {
      renderExecResult(results, summary, { ok: false, stdout: "", stderr: error.message });
    } finally {
      runButton.disabled = false;
      runButton.textContent = "Run";
    }
  });
}

function renderExecResult(container, summary, result) {
  container.replaceChildren();

  if (result.unsupported) {
    summary.textContent = "Not runnable";
    summary.className = "run-summary fail";
    container.append(logBlock(result.stderr));
    return;
  }

  if (result.missing) {
    summary.textContent = "Interpreter missing";
    summary.className = "run-summary fail";
    container.append(logBlock(result.stderr, "error"));
    return;
  }

  if (result.ok) {
    summary.textContent = "Ran ✓";
    summary.className = "run-summary pass";
  } else {
    const reason = result.timedOut ? "Timed out" : result.phase === "compile" ? "Compile error" : `Exited ${result.exitCode}`;
    summary.textContent = reason;
    summary.className = "run-summary fail";
  }

  const stdout = result.stdout || "";
  const stderr = result.stderr || "";

  if (stdout) {
    container.append(logLabel("Output"), logBlock(stdout));
  }
  if (stderr) {
    container.append(logLabel(result.ok ? "Stderr" : "Error"), logBlock(stderr, "error"));
  }
  if (!stdout && !stderr) {
    container.append(logBlock("(no output)"));
  }
}

function logLabel(text) {
  const label = document.createElement("div");
  label.className = "run-logs-label";
  label.textContent = text;
  return label;
}

function logBlock(text, variant) {
  const pre = document.createElement("pre");
  pre.className = variant === "error" ? "run-logs error" : "run-logs";
  pre.textContent = text;
  return pre;
}

function buildSelector(current, onChange) {
  const bar = document.createElement("div");
  bar.className = "code-lang-bar";

  const label = document.createElement("span");
  label.className = "code-lang-label";
  label.textContent = "Language";

  const select = document.createElement("select");
  select.className = "code-lang-select";

  // If the question's default isn't in the catalog, surface it anyway so the
  // editor never starts on a language the user didn't ask for.
  const options = MIME_BY_VALUE.has(current)
    ? LANGUAGES
    : [{ value: current, label: current, mime: "text/plain" }, ...LANGUAGES];

  for (const lang of options) {
    const option = document.createElement("option");
    option.value = lang.value;
    option.textContent = lang.label;
    option.selected = lang.value === current;
    select.append(option);
  }

  select.addEventListener("change", () => onChange(select.value));

  bar.append(label, select);
  return bar;
}
