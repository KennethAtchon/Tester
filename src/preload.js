const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("testFiles", {
  openJson: () => ipcRenderer.invoke("tests:open"),
  openSample: () => ipcRenderer.invoke("tests:sample"),
  listExamples: () => ipcRenderer.invoke("tests:listExamples"),
  openExample: (fileName) => ipcRenderer.invoke("tests:example", fileName),
  saveMarkdown: (payload) => ipcRenderer.invoke("tests:saveMarkdown", payload),
  runCode: (payload) => ipcRenderer.invoke("code:run", payload)
});
