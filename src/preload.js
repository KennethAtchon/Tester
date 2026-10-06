const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("testFiles", {
  listBuiltinCourses: () => ipcRenderer.invoke("courses:builtin"),
  openCourseFile: () => ipcRenderer.invoke("courses:open"),
  openCoursesFolder: () => ipcRenderer.invoke("courses:folder"),
  saveMarkdown: (payload) => ipcRenderer.invoke("tests:saveMarkdown", payload),
  runCode: (payload) => ipcRenderer.invoke("code:run", payload),
  execCode: (payload) => ipcRenderer.invoke("code:exec", payload),
  loadProgress: () => ipcRenderer.invoke("progress:load"),
  saveProgress: (content) => ipcRenderer.invoke("progress:save", content),
  progressPath: () => ipcRenderer.invoke("progress:path")
});
