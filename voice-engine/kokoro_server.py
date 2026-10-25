"""Talk mode's voice: official Kokoro behind a JSON-lines pipe.

src/voice.js starts this with `uv run` and writes one request per line:
    {"id": 1, "text": "Hi there!", "voice": "af_heart"}
and reads one reply per line:
    {"id": 1, "wav": "<base64>", "tokens": [{"text": "Hi", "phonemes": "hˈI", "start": 0.27, "end": 0.57}, ...]}
or {"id": 1, "error": "..."}. The first line printed is {"ready": true}.

Pronunciation is misaki, Kokoro's own G2P, with espeak-ng for unknown words.
The espeak-ng build bundled with misaki looks for its data on the machine it
was built on, so a Homebrew espeak-ng is used instead (brew install espeak-ng).
"""

import base64
import io
import json
import os
import sys
from pathlib import Path

ESPEAK_LIBRARIES = ["/opt/homebrew/lib/libespeak-ng.dylib", "/usr/local/lib/libespeak-ng.dylib"]

# Replies get a private copy of stdout. Everything else that writes to stdout,
# including child processes (misaki runs pip to fetch its spaCy model), goes
# to stderr, so it can't corrupt the pipe.
replies = os.fdopen(os.dup(1), "w", buffering=1)
os.dup2(2, 1)
sys.stdout = sys.stderr


def send(message):
    replies.write(json.dumps(message) + "\n")
    replies.flush()


def use_system_espeak():
    import misaki.espeak  # noqa: F401  (sets the bundled library, overridden below)
    from phonemizer.backend.espeak.wrapper import EspeakWrapper

    for library in ESPEAK_LIBRARIES:
        if Path(library).exists():
            EspeakWrapper.set_library(library)
            EspeakWrapper.set_data_path(str(Path(library).parent.parent / "share" / "espeak-ng-data"))
            return
    send({"fatal": "Talk mode needs espeak-ng for pronunciation. Install it with: brew install espeak-ng"})
    sys.exit(1)


def main():
    use_system_espeak()
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline

    pipelines = {}
    send({"ready": True})
    for line in sys.stdin:
        request = json.loads(line)
        try:
            voice = request["voice"]
            # Kokoro voices start with their accent: a = American, b = British.
            lang = voice[0]
            if lang not in pipelines:
                pipelines[lang] = KPipeline(lang_code=lang, repo_id="hexgrad/Kokoro-82M")
            chunks, tokens, offset = [], [], 0.0
            for result in pipelines[lang](request["text"], voice=voice, speed=request.get("speed", 1)):
                chunks.append(result.audio.numpy())
                for token in result.tokens or []:
                    if token.start_ts is not None and token.end_ts is not None:
                        tokens.append({"text": token.text, "phonemes": token.phonemes or "", "start": offset + token.start_ts, "end": offset + token.end_ts})
                offset += len(chunks[-1]) / 24000
            buffer = io.BytesIO()
            sf.write(buffer, np.concatenate(chunks), 24000, format="WAV", subtype="PCM_16")
            send({"id": request["id"], "wav": base64.b64encode(buffer.getvalue()).decode(), "tokens": tokens})
        except Exception as error:  # reported to the app, which shows it
            send({"id": request.get("id"), "error": f"{type(error).__name__}: {error}"})


if __name__ == "__main__":
    main()
