const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { runCode } = require("./runner/runCode");
const { runExec } = require("./runner/runExec");

const appRoot = path.dirname(__dirname);
const examplesPath = path.join(appRoot, "examples");
const samplePath = path.join(appRoot, "sample-tests.json");
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
    backgroundColor: "#f7f7f5",
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

ipcMain.handle("tests:open", async () => {
  const result = await dialog.showOpenDialog({
    title: "Load Test JSON",
    defaultPath: examplesPath,
    filters: [
      { name: "JSON Files", extensions: ["json"] },
      { name: "All Files", extensions: ["*"] }
    ],
    properties: ["openFile"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, "utf8");

  return {
    canceled: false,
    filePath,
    content
  };
});

ipcMain.handle("tests:sample", async () => {
  const candidatePaths = [
    samplePath,
    path.join(app.getAppPath(), "sample-tests.json"),
    path.join(process.cwd(), "sample-tests.json")
  ];

  let filePath = "";
  let content = "";

  for (const candidatePath of candidatePaths) {
    try {
      content = await fs.readFile(candidatePath, "utf8");
      filePath = candidatePath;
      break;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  if (!content) {
    throw new Error("Could not find sample-tests.json next to the app.");
  }

  return {
    filePath,
    content
  };
});

ipcMain.handle("tests:listExamples", async () => {
  const entries = await fs.readdir(examplesPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .sort((first, second) => first.localeCompare(second));
});

ipcMain.handle("tests:example", async (_event, fileName) => {
  if (typeof fileName !== "string" || !fileName.toLowerCase().endsWith(".json")) {
    throw new Error("Example file must be a JSON file.");
  }

  const filePath = path.join(examplesPath, path.basename(fileName));
  const relativePath = path.relative(examplesPath, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Example file must live inside the examples folder.");
  }

  const content = await fs.readFile(filePath, "utf8");

  return {
    filePath,
    content
  };
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
