// Entry point: loads saved progress and the built-in courses, applies the
// theme and sound settings, rolls the streak forward, sends first-time
// learners to setup, and lets a course file be dropped anywhere on the
// window. Everything else lives in the focused modules below.

import { initProgress, onProgressChange, progress, settings } from "./state/progress.js";
import { loadBuiltinCourses } from "./state/catalog.js";
import { rollStreak } from "./state/learner.js";
import { initTheme } from "./ui/theme.js";
import { renderRail } from "./ui/rail.js";
import { registerViews, startRouter, route, navigate } from "./ui/router.js";
import { toast } from "./ui/toast.js";
import { setSoundEnabled } from "./lib/sound.js";
import { importFiles } from "./io/io.js";
import { renderPlayer, hasActivePlay } from "./ui/player.js";
import { renderHome } from "./ui/views/home.js";
import { renderCourse } from "./ui/views/course.js";
import { renderLab } from "./ui/views/lab.js";
import { renderPractice } from "./ui/views/practice.js";
import { renderProgress } from "./ui/views/progress.js";
import { renderLibrary } from "./ui/views/library.js";
import { renderSettings } from "./ui/views/settings.js";
import { renderWelcome } from "./ui/views/welcome.js";

await initProgress();
initTheme();
setSoundEnabled(settings().sound);
await loadBuiltinCourses();

const streak = rollStreak();
if (streak.usedFreezes > 0) {
  toast(`A streak freeze covered ${streak.usedFreezes === 1 ? "a missed day" : `${streak.usedFreezes} missed days`}. Your streak is intact.`, { timeout: 6000 });
}

registerViews(
  {
    home: renderHome,
    course: renderCourse,
    lab: renderLab,
    practice: renderPractice,
    progress: renderProgress,
    library: renderLibrary,
    settings: renderSettings,
    play: renderPlayer,
    welcome: renderWelcome
  },
  { onRender: renderRail }
);

let railFrame = 0;
onProgressChange(() => {
  cancelAnimationFrame(railFrame);
  railFrame = requestAnimationFrame(renderRail);
});

// Drop a course file anywhere to add it.
let dragDepth = 0;
const overlay = document.querySelector("#dropOverlay");
const hasFiles = (event) => [...(event.dataTransfer?.types || [])].includes("Files");
window.addEventListener("dragenter", (event) => {
  if (hasFiles(event)) {
    dragDepth += 1;
    overlay.hidden = false;
  }
});
window.addEventListener("dragleave", (event) => {
  if (hasFiles(event)) {
    dragDepth = Math.max(0, dragDepth - 1);
    overlay.hidden = dragDepth === 0;
  }
});
window.addEventListener("dragover", (event) => {
  if (hasFiles(event)) {
    event.preventDefault();
  }
});
window.addEventListener("drop", async (event) => {
  if (!hasFiles(event)) {
    return;
  }
  event.preventDefault();
  dragDepth = 0;
  overlay.hidden = true;
  if (hasActivePlay()) {
    toast("Finish or close this session first, then drop the file again.");
    return;
  }
  const course = await importFiles([...event.dataTransfer.files]);
  if (course) {
    navigate("course", course.id);
  }
});

if (!progress().profile.onboarded && route().name !== "welcome") {
  location.hash = "#/welcome";
}
startRouter();
