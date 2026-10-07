// Entry point: loads saved progress, the learner's own subjects and courses,
// and the built-in subjects; applies the theme and sound settings; rolls the
// streak forward; sends first-time learners to setup; and lets a course file
// be dropped anywhere on the window. Everything else lives in the focused
// modules below.

import { initProgress, onProgressChange, progress, settings, persist } from "./state/progress.js";
import { initLibrary, adoptLegacyImports } from "./state/library.js";
import { loadBuiltinContent, currentSubjectId } from "./state/catalog.js";
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
import { renderSubjects, renderSubject } from "./ui/views/subjects.js";
import { renderEditor } from "./ui/views/editor.js";
import { renderSettings } from "./ui/views/settings.js";
import { renderWelcome } from "./ui/views/welcome.js";

await Promise.all([initProgress(), initLibrary()]);
if (adoptLegacyImports(progress().imports)) {
  delete progress().imports;
  persist();
}
initTheme();
setSoundEnabled(settings().sound);
await loadBuiltinContent();

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
    subjects: renderSubjects,
    subject: renderSubject,
    write: renderEditor,
    library: renderSubjects,
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
  dragDepth = 0;
  overlay.hidden = true;
  // The course editor takes a dropped file into its text box instead.
  if (event.defaultPrevented) {
    return;
  }
  event.preventDefault();
  if (hasActivePlay()) {
    toast("Finish or close this session first, then drop the file again.");
    return;
  }
  // On a subject's page the file joins that subject; elsewhere, the current one.
  const { name, params } = route();
  const subjectId = name === "subject" ? params[0] : currentSubjectId();
  const course = await importFiles([...event.dataTransfer.files], { subjectId });
  if (course) {
    navigate("course", course.id);
  }
});

if (!progress().profile.onboarded && route().name !== "welcome") {
  location.hash = "#/welcome";
}
startRouter();
