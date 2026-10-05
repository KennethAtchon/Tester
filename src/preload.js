const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("testFiles", {
  openJson: () => ipcRenderer.invoke("tests:open"),
  openSample: () => ipcRenderer.invoke("tests:sample"),
  listExamples: () => ipcRenderer.invoke("tests:listExamples"),
  openExample: (fileName) => ipcRenderer.invoke("tests:example", fileName),
  saveMarkdown: (payload) => ipcRenderer.invoke("tests:saveMarkdown", payload),
  runCode: (payload) => ipcRenderer.invoke("code:run", payload),
  execCode: (payload) => ipcRenderer.invoke("code:exec", payload),
  loadProgress: () => ipcRenderer.invoke("progress:load"),
  saveProgress: (content) => ipcRenderer.invoke("progress:save", content),
  progressPath: () => ipcRenderer.invoke("progress:path")
});
