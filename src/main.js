const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { runCode } = require("./runner/runCode");
const { runExec } = require("./runner/runExec");

const appRoot = path.dirname(__dirname);
const coursesPath = path.join(appRoot, "courses");
const resultsPath = path.join(appRoot, "results");

// Learner progress (memory model, review log, settings) lives in the user-data
// folder, not the repo, so personal study history never ends up in commits.
function progressFilePath() {
  return path.join(app.getPath("userData"), "learning-progress.json");
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

// Built-in courses: every *.json file in courses/, and every folder with a
// course.json whose "units"/"projects" list file names to inline.
ipcMain.handle("courses:builtin", async () => {
  let entries = [];
  try {
    entries = await fs.readdir(coursesPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const courses = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const entryPath = path.join(coursesPath, entry.name);
    try {
      if (entry.isDirectory()) {
        const manifestPath = path.join(entryPath, "course.json");
        const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        manifest.units = await inlineParts(entryPath, manifest.units);
        manifest.projects = await inlineParts(entryPath, manifest.projects);
        courses.push({ path: manifestPath, course: manifest });
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
        courses.push({ path: entryPath, course: JSON.parse(await fs.readFile(entryPath, "utf8")) });
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        courses.push({ path: entryPath, error: error.message });
      }
    }
  }
  return courses;
});

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
    inlined.push(JSON.parse(await fs.readFile(partPath, "utf8")));
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

ipcMain.handle("courses:folder", async () => {
  await fs.mkdir(coursesPath, { recursive: true });
  return shell.openPath(coursesPath);
});

ipcMain.handle("code:run", async (_event, payload) => runCode(payload));

ipcMain.handle("code:exec", async (_event, payload) => runExec(payload));

ipcMain.handle("progress:load", async () => {
  try {
    return await fs.readFile(progressFilePath(), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
});

// Write-then-rename so a crash mid-save can't leave a truncated file. Saves
// are chained so two in flight never race on the temp file.
let progressSaveChain = Promise.resolve();

ipcMain.handle("progress:save", async (_event, content) => {
  if (typeof content !== "string") {
    throw new Error("Progress must be a JSON string.");
  }
  const filePath = progressFilePath();
  const tempPath = `${filePath}.tmp`;
  const write = async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(tempPath, content, "utf8");
    await fs.rename(tempPath, filePath);
  };
  progressSaveChain = progressSaveChain.then(write, write);
  await progressSaveChain;
  return { filePath };
});

ipcMain.handle("progress:path", async () => progressFilePath());

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
