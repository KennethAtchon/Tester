import { test } from "node:test";
import assert from "node:assert/strict";
import { splitSentences, spokenText, createSpeechGate, rms, mouthTimeline, shapeAt } from "../src/renderer/lib/speech.js";

const FRAME = 0.128; // 2048 samples at 16 kHz, the size listen() records in

// Feeds `seconds` of one level; returns the gate's last answer.
function feed(gate, level, seconds) {
  let state;
  for (let t = 0; t < seconds; t += FRAME) {
    state = gate.push(level, FRAME);
    if (state === "done") {
      return state;
    }
  }
  return state;
}

test("splitSentences keeps punctuation and drops empty parts", () => {
  assert.deepEqual(splitSentences("Hi! Sorry I'm late. Is that okay?"), ["Hi!", "Sorry I'm late.", "Is that okay?"]);
  assert.deepEqual(splitSentences("  one line without a stop "), ["one line without a stop"]);
  assert.deepEqual(splitSentences(""), []);
});

test("spokenText drops stage directions but keeps the words", () => {
  assert.equal(spokenText("*glances at the station clock, then back at him* Um... you okay?"), "Um... you okay?");
  assert.equal(spokenText("Okay *laughs* , fine."), "Okay, fine.");
  assert.equal(spokenText("No actions here."), "No actions here.");
});

// Real Kokoro output for "Hi! Sorry I'm late," (af_heart).
const KOKORO_TOKENS = [
  { text: "Hi", phonemes: "hˈI", start: 0.275, end: 0.575 },
  { text: "!", phonemes: "!", start: 0.575, end: 0.6625 },
  { text: "Sorry", phonemes: "sˈɔɹi", start: 0.6625, end: 0.9375 },
  { text: "I'm", phonemes: "ˌIm", start: 0.9375, end: 1.05 },
  { text: "late", phonemes: "lˈAt", start: 1.05, end: 1.225 },
  { text: ",", phonemes: ",", start: 1.225, end: 1.2625 }
];

test("mouthTimeline: closed before speech, vowels open the mouth, m closes it", () => {
  const timeline = mouthTimeline(KOKORO_TOKENS);
  assert.equal(shapeAt(timeline, 0.1), "closed", "silence before the first word");
  assert.equal(shapeAt(timeline, 0.5), "open", "the I in 'Hi' (aɪ)");
  assert.equal(shapeAt(timeline, 0.75), "oh", "the ɔ in 'Sorry'");
  assert.equal(shapeAt(timeline, 1.03), "closed", "the m in 'I'm'");
  assert.equal(shapeAt(timeline, 1.12), "ee", "the A in 'late' (eɪ)");
  assert.equal(shapeAt(timeline, 2), "closed", "after the last word");
});

test("mouthTimeline merges flickers shorter than 40 ms and skips punctuation", () => {
  const timeline = mouthTimeline([{ phonemes: "tɑ", start: 0, end: 0.06 }, { phonemes: ".", start: 0.06, end: 0.2 }]);
  assert.ok(timeline.every((segment) => segment.end - segment.start >= 0.03));
  assert.equal(timeline.length, 1);
  assert.deepEqual(mouthTimeline([]), []);
});

test("silence alone never ends the turn", () => {
  const gate = createSpeechGate();
  assert.equal(feed(gate, 0.002, 10), "waiting");
  assert.equal(gate.spoke, false);
});

test("speech followed by a pause ends the turn", () => {
  const gate = createSpeechGate();
  feed(gate, 0.002, 1);
  assert.equal(feed(gate, 0.2, 1.5), "speaking");
  assert.equal(feed(gate, 0.002, 0.5), "speaking", "a short pause mid-sentence keeps listening");
  assert.equal(feed(gate, 0.2, 0.5), "speaking");
  assert.equal(feed(gate, 0.002, 1.2), "done");
  assert.equal(gate.spoke, true);
});

test("a short burst is forgotten", () => {
  const gate = createSpeechGate();
  feed(gate, 0.002, 1);
  feed(gate, 0.3, FRAME);
  assert.equal(feed(gate, 0.002, 2), "waiting");
  assert.equal(gate.spoke, false);
});

test("a noisy room raises the threshold", () => {
  const gate = createSpeechGate();
  assert.equal(feed(gate, 0.05, 3), "waiting", "steady hum is the floor, not speech");
  assert.equal(feed(gate, 0.3, 1), "speaking");
  assert.equal(feed(gate, 0.05, 1.2), "done");
});

test("rms of a constant signal is its magnitude", () => {
  assert.equal(rms(new Float32Array([0.5, -0.5, 0.5, -0.5])), 0.5);
  assert.equal(rms(new Float32Array([])), 0);
});
