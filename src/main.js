const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { runCode } = require("./runner/runCode");
const { runExec } = require("./runner/runExec");

const appRoot = path.dirname(__dirname);
const subjectsPath = path.join(appRoot, "subjects");
const resultsPath = path.join(appRoot, "results");

// Two files in the user-data folder, never the repo: the learner's progress
// (memory model, review log, settings), and their library (subjects and
// courses they created or imported). Content and progress stay separate so a
// progress reset never touches what was authored.
function progressFilePath() {
  return path.join(app.getPath("userData"), "learning-progress.json");
}

function libraryFilePath() {
  return path.join(app.getPath("userData"), "library.json");
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: "Recall",
    backgroundColor: "#f6f5f1",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Built-in content lives in subjects/. Each subject is a folder with a
// subject.json and its courses inside: a course is a folder with a
// course.json (whose "units"/"projects" list file names to inline) or a
// single .json file. Courses at the top level belong to no subject folder and
// may name one with a "subject" field.
ipcMain.handle("content:builtin", async () => {
  const result = { subjects: [], courses: [], errors: [] };
  for (const entry of await listDir(subjectsPath)) {
    const entryPath = path.join(subjectsPath, entry.name);
    try {
      if (entry.isDirectory() && (await exists(path.join(entryPath, "subject.json")))) {
        const subject = await readJson(path.join(entryPath, "subject.json"));
        subject.id ||= entry.name;
        result.subjects.push({ path: path.join(entryPath, "subject.json"), subject });
        for (const child of await listDir(entryPath)) {
          if (child.name !== "subject.json") {
            await addCourse(result, path.join(entryPath, child.name), child, subject.id);
          }
        }
      } else {
        await addCourse(result, entryPath, entry, null);
      }
    } catch (error) {
      result.errors.push({ path: entryPath, error: error.message });
    }
  }
  return result;
});

async function addCourse(result, entryPath, entry, subjectId) {
  try {
    if (entry.isDirectory()) {
      const manifestPath = path.join(entryPath, "course.json");
      if (!(await exists(manifestPath))) {
        return;
      }
      const manifest = await readJson(manifestPath);
      manifest.units = await inlineParts(entryPath, manifest.units);
      manifest.projects = await inlineParts(entryPath, manifest.projects);
      result.courses.push({ path: manifestPath, course: manifest, subjectId });
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      result.courses.push({ path: entryPath, course: await readJson(entryPath), subjectId });
    }
  } catch (error) {
    result.errors.push({ path: entryPath, error: error.message });
  }
}

async function listDir(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function inlineParts(folder, parts) {
  if (!Array.isArray(parts)) {
    return [];
  }
  const inlined = [];
  for (const part of parts) {
    if (typeof part !== "string") {
      inlined.push(part);
      continue;
    }
    const partPath = path.resolve(folder, part);
    if (path.relative(folder, partPath).startsWith("..")) {
      throw new Error(`Course part must live inside the course folder: ${part}`);
    }
    inlined.push(await readJson(partPath));
  }
  return inlined;
}

ipcMain.handle("courses:open", async () => {
  const result = await dialog.showOpenDialog({
    title: "Add a course",
    filters: [
      { name: "Courses", extensions: ["json", "txt", "md"] },
      { name: "All Files", extensions: ["*"] }
    ],
    properties: ["openFile"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  return { canceled: false, filePath, content: await fs.readFile(filePath, "utf8") };
});

ipcMain.handle("content:folder", async () => {
  await fs.mkdir(subjectsPath, { recursive: true });
  return shell.openPath(subjectsPath);
});

ipcMain.handle("code:run", async (_event, payload) => runCode(payload));

ipcMain.handle("code:exec", async (_event, payload) => runExec(payload));

// progress:* and library:* each load and save one JSON file.
for (const [name, filePath] of [["progress", progressFilePath], ["library", libraryFilePath]]) {
  ipcMain.handle(`${name}:load`, async () => {
    try {
      return await fs.readFile(filePath(), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  });
  ipcMain.handle(`${name}:save`, async (_event, content) => saveJsonFile(filePath(), content));
  ipcMain.handle(`${name}:path`, async () => filePath());
}

// Write-then-rename so a crash mid-save can't leave a truncated file. Saves
// to the same file are chained so two in flight never race on the temp file.
const saveChains = new Map();

async function saveJsonFile(filePath, content) {
  if (typeof content !== "string") {
    throw new Error("Expected a JSON string.");
  }
  const tempPath = `${filePath}.tmp`;
  const write = async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(tempPath, content, "utf8");
    await fs.rename(tempPath, filePath);
  };
  const chain = (saveChains.get(filePath) || Promise.resolve()).then(write, write);
  saveChains.set(filePath, chain);
  await chain;
  return { filePath };
}

ipcMain.handle("tests:saveMarkdown", async (_event, { defaultName, tent, markdown }) => {
  const fileName = sanitizeMarkdownFileName(defaultName);
  const safeTent = sanitizeTentDir(tent);
  const dirPath = safeTent ? path.join(resultsPath, safeTent) : resultsPath;
  const filePath = path.join(dirPath, fileName);

  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(filePath, markdown, "utf8");

  return {
    canceled: false,
    filePath
  };
});

function sanitizeMarkdownFileName(fileName) {
  const fallbackName = "test-answers.md";
  const safeName = typeof fileName === "string" ? path.basename(fileName) : fallbackName;
  const markdownName = safeName.toLowerCase().endsWith(".md") ? safeName : `${safeName}.md`;

  return markdownName.replace(/[^a-zA-Z0-9._-]/g, "-") || fallbackName;
}

function sanitizeTentDir(tent) {
  if (typeof tent !== "string" || !tent.trim()) {
    return "";
  }

  const safe = tent.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "");

  if (!safe || safe === "." || safe === "..") {
    return "";
  }

  return safe;
}
