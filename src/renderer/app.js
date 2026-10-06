// Entry point: loads the learner's saved progress, applies the theme, rolls
// the streak forward, then hands the window to the router. All behaviour lives
// in the focused modules below; this file is just composition.

import { initProgress, onProgressChange } from "./state/progress.js";
import { rollStreak } from "./state/learner.js";
import { initTheme } from "./ui/theme.js";
import { renderRail } from "./ui/rail.js";
import { registerViews, startRouter } from "./ui/router.js";
import { toast } from "./ui/toast.js";
import { renderToday } from "./ui/views/today.js";
import { renderMap, renderSkill } from "./ui/views/map.js";
import { renderSession } from "./ui/views/session.js";
import { renderMistakes } from "./ui/views/mistakes.js";
import { renderInsights } from "./ui/views/insights.js";
import { renderExam } from "./ui/views/exam.js";
import { renderSettings } from "./ui/views/settings.js";

await initProgress();
initTheme();

const streak = rollStreak();
if (streak.usedFreezes > 0) {
  toast(`A streak freeze covered ${streak.usedFreezes === 1 ? "a missed day" : `${streak.usedFreezes} missed days`}. Your streak is intact.`, { timeout: 6000 });
}

registerViews(
  {
    today: renderToday,
    map: renderMap,
    skill: renderSkill,
    session: renderSession,
    mistakes: renderMistakes,
    insights: renderInsights,
    exam: renderExam,
    settings: renderSettings
  },
  { onRender: renderRail }
);

// Keep the rail's counts and streak live as attempts are recorded.
let railFrame = 0;
onProgressChange(() => {
  cancelAnimationFrame(railFrame);
  railFrame = requestAnimationFrame(renderRail);
});

startRouter();
