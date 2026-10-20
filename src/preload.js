const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("testFiles", {
  listBuiltinContent: () => ipcRenderer.invoke("content:builtin"),
  openCourseFile: () => ipcRenderer.invoke("courses:open"),
  openContentFolder: () => ipcRenderer.invoke("content:folder"),
  saveMarkdown: (payload) => ipcRenderer.invoke("tests:saveMarkdown", payload),
  runCode: (payload) => ipcRenderer.invoke("code:run", payload),
  execCode: (payload) => ipcRenderer.invoke("code:exec", payload),
  partnerStatus: () => ipcRenderer.invoke("partner:status"),
  partnerSetKey: (key) => ipcRenderer.invoke("partner:setKey", key),
  partnerClearKey: () => ipcRenderer.invoke("partner:clearKey"),
  partnerReply: (payload) => ipcRenderer.invoke("partner:reply", payload),
  partnerCoach: (payload) => ipcRenderer.invoke("partner:coach", payload),
  loadProgress: () => ipcRenderer.invoke("progress:load"),
  saveProgress: (content) => ipcRenderer.invoke("progress:save", content),
  progressPath: () => ipcRenderer.invoke("progress:path"),
  loadLibrary: () => ipcRenderer.invoke("library:load"),
  saveLibrary: (content) => ipcRenderer.invoke("library:save", content),
  libraryPath: () => ipcRenderer.invoke("library:path")
});
