// Pure helpers for Talk mode: splitting a line into sentences (each is voiced
// separately, so she starts talking while the rest is being made) and deciding
// when the learner has finished speaking.

// The words to say out loud: stage directions the partner sometimes writes
// despite its instructions ("*glances at the clock*") are dropped.
export function spokenText(text) {
  return String(text ?? "")
    .replace(/\*[^*]*\*/g, " ")
    .replace(/\s+([,.!?…])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitSentences(text) {
  return String(text ?? "")
    .split(/(?<=[.!?…])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

// Kokoro's phonemes (misaki's symbols) → the mouth shapes a face pack has.
// "closed" is the portrait itself. Diphthongs are written as one capital
// letter (A = eɪ, I = aɪ, O = oʊ, Q = əʊ, W = aʊ, Y = ɔɪ). Anything not listed
// (most consonants) shows the mouth slightly open.
const SHAPE_OF = {
  closed: "pbm",
  open: "æɑɒʌaɐIW",
  ee: "iɪeɛA",
  oh: "oɔOQYuʊwɜ"
};
const PHONEME_SHAPE = new Map(Object.entries(SHAPE_OF).flatMap(([shape, chars]) => [...chars].map((char) => [char, shape])));
const NOT_SOUNDS = /[ˈˌːˑ.,!?…;:'"“”‘’()\-—\s]/;
const MIN_SHAPE = 0.04; // seconds; shorter flickers merge into their neighbour (sounds run ~50–70 ms)

// tokens: [{ phonemes, start, end }] in seconds → [{ start, end, shape }],
// with "closed" in the gaps between words.
export function mouthTimeline(tokens) {
  const segments = [];
  const push = (start, end, shape) => {
    const last = segments.at(-1);
    if (last && (last.shape === shape || end - start < MIN_SHAPE)) {
      last.end = end;
    } else {
      segments.push({ start, end, shape });
    }
  };
  let cursor = 0;
  for (const token of tokens || []) {
    const sounds = [...String(token.phonemes ?? "")].filter((char) => !NOT_SOUNDS.test(char));
    if (!sounds.length || !(token.end > token.start)) {
      continue;
    }
    if (token.start > cursor) {
      push(cursor, token.start, "closed");
    }
    const step = (token.end - token.start) / sounds.length;
    sounds.forEach((char, index) => push(token.start + index * step, token.start + (index + 1) * step, PHONEME_SHAPE.get(char) || "slight"));
    cursor = token.end;
  }
  return segments;
}

export function shapeAt(timeline, seconds) {
  for (const segment of timeline) {
    if (seconds < segment.start) {
      return "closed";
    }
    if (seconds < segment.end) {
      return segment.shape;
    }
  }
  return "closed";
}

// An energy gate fed one microphone level (RMS) per audio frame. The noise
// floor is the quietest level heard, drifting up slowly if the room gets
// louder; speech is anything `ratio` times above it. The turn is over after
// `endSilence` seconds of quiet that follow at least `minSpeech` seconds of
// speech. A shorter burst (a cough, a click) is forgotten once it goes quiet.
export function createSpeechGate({ endSilence = 0.9, minSpeech = 0.25, minLevel = 0.01, ratio = 3 } = {}) {
  let floor = null;
  let speech = 0;
  let quiet = 0;
  return {
    get spoke() {
      return speech >= minSpeech;
    },
    // → "waiting" (nothing yet), "speaking", or "done"
    push(level, seconds) {
      floor = floor === null || level < floor ? level : floor + (level - floor) * 0.002;
      if (level > Math.max(minLevel, floor * ratio)) {
        speech += seconds;
        quiet = 0;
      } else if (speech > 0) {
        quiet += seconds;
        if (quiet >= endSilence) {
          if (speech >= minSpeech) {
            return "done";
          }
          speech = 0;
        }
      }
      return speech >= minSpeech ? "speaking" : "waiting";
    }
  };
}

export function rms(samples) {
  let sum = 0;
  for (const value of samples) {
    sum += value * value;
  }
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}
