// Small synthesized sound effects (Web Audio — no asset files). Short and
// quiet on purpose: feedback cues, not slot-machine noise. Respects the
// learner's "Sound effects" setting via setSoundEnabled.

let context = null;
let enabled = true;

export function setSoundEnabled(value) {
  enabled = Boolean(value);
}

const CUES = {
  correct: [[660, 0, 0.09], [880, 0.08, 0.14]],
  partial: [[600, 0, 0.12], [660, 0.1, 0.12]],
  wrong: [[220, 0, 0.18], [180, 0.12, 0.2]],
  tap: [[520, 0, 0.04]],
  complete: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.12], [1046, 0.3, 0.3]],
  levelup: [[392, 0, 0.12], [523, 0.1, 0.12], [659, 0.2, 0.12], [784, 0.3, 0.12], [1046, 0.42, 0.4]],
  tick: [[1200, 0, 0.03]]
};

export function play(name) {
  if (!enabled || !CUES[name]) {
    return;
  }
  try {
    context ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = context.currentTime;
    for (const [frequency, start, duration] of CUES[name]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = name === "wrong" ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.08, now + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + start);
      oscillator.stop(now + start + duration + 0.02);
    }
  } catch {
    // Audio is a nicety; never let it break a lesson.
  }
}
