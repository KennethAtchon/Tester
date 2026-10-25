"""Make a face pack for Talk mode: a photo-real portrait of a character plus
mouth shapes and a blink, cut into sprites the app swaps in time with her voice.

    uv run --python 3.11 --with mediapipe --with opencv-python-headless --with numpy \
        tools/face-pack/make_face_pack.py <characters.json> <out dir> [--stage base|all] [--only id,id]

characters.json: [{"id": "elena", "look": "...", "setting": "...", "voice": "af_heart"}]
Needs FAL_KEY (fal.ai). Every image is billed: the ledger below refuses to go
past --cap dollars. Packs are written to <out dir>/<id>/ (base.png, sprites/,
manifest.json); they belong in the user-data folder, never in this repo.
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

BASE_MODEL = "fal-ai/nano-banana-pro"  # Nano Banana Pro: the most photo-real base
EDIT_MODEL = "fal-ai/nano-banana-2/edit"  # Nano Banana 2: edits that keep the face
PRICE_API = "https://api.fal.ai/v1/models/pricing"
# fal lists a per-image price; 2K may bill above it, so the ledger reserves 1.5x.
RESOLUTION_FACTOR = 1.5
ASPECT = "16:9"
SIZE = "2K"

BASE_PROMPT = (
    "A photorealistic candid portrait photograph of {look} {setting} "
    "She looks straight into the camera with a soft, warm, closed-mouth smile: lips together and relaxed, no teeth showing. "
    "Head and shoulders, face centred in the frame, eye level, the camera about a metre away. "
    "Shot on a full-frame camera with an 85mm lens at f/1.8: shallow depth of field, softly blurred background, soft natural light on her face. "
    "Natural skin texture, true-to-life colour, no retouching, no text, no watermark."
)

KEEP = (
    "Edit this photo. Keep the woman, her face, eyes, hair, skin, makeup, clothes, pose, head position, framing, "
    "lighting, background and camera exactly the same, pixel for pixel. Change only {part}: {change} "
    "Nothing else may change."
)

# Mouth shapes the app maps visemes onto, and the blink.
EDITS = {
    "slight": ("her mouth", "her lips are slightly parted, as if in the middle of saying a soft word; a hint of her upper teeth shows."),
    "open": ("her mouth and jaw", "her mouth is naturally open, as when saying 'ah' in the middle of a sentence; her jaw drops a little and her upper teeth show."),
    "ee": ("her mouth", "her lips are spread a little wider, as when saying 'ee'; her teeth show slightly and her mouth is barely open."),
    "oh": ("her mouth", "her lips are rounded and open, as when saying 'oh'."),
    "blink": ("her eyes", "her eyes are fully closed in a natural, relaxed blink."),
}


def fal_prices():
    query = "&".join(f"endpoint_id={model}" for model in (BASE_MODEL, EDIT_MODEL))
    request = urllib.request.Request(f"{PRICE_API}?{query}", headers={"Authorization": f"Key {os.environ['FAL_KEY']}"})
    with urllib.request.urlopen(request, timeout=30) as response:
        prices = {row["endpoint_id"]: row["unit_price"] for row in json.load(response)["prices"] if row["unit"] == "images"}
    missing = {BASE_MODEL, EDIT_MODEL} - set(prices)
    if missing:
        sys.exit(f"No per-image price listed for {missing}; not spending blind.")
    return {model: price * RESOLUTION_FACTOR for model, price in prices.items()}


class Ledger:
    def __init__(self, cap, path, prices):
        self.cap = cap
        self.path = path
        self.prices = prices
        self.spent = json.loads(path.read_text())["spent"] if path.exists() else 0.0

    def charge(self, model):
        price = self.prices[model]
        if self.spent + price > self.cap + 1e-9:
            sys.exit(f"Spend cap reached: ${self.spent:.3f} spent, next image ${price} would pass the ${self.cap} cap.")
        self.spent += price
        self.path.write_text(json.dumps({"spent": round(self.spent, 4)}))


def generate(model, prompt, ledger, image=None):
    body = {"prompt": prompt, "aspect_ratio": ASPECT, "resolution": SIZE, "output_format": "png", "num_images": 1, "sync_mode": True}
    if image is not None:
        body["image_urls"] = ["data:image/png;base64," + base64.b64encode(image).decode()]
    request = urllib.request.Request(
        f"https://fal.run/{model}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Key {os.environ['FAL_KEY']}"},
    )
    ledger.charge(model)
    with urllib.request.urlopen(request, timeout=300) as response:
        data = json.load(response)
    images = data.get("images") or []
    if not images:
        raise RuntimeError(f"{model} returned no image: {json.dumps(data)[:400]}")
    url = images[0]["url"]
    if url.startswith("data:"):
        return base64.b64decode(url.split(",", 1)[1])
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()


def make_base(character, folder, ledger):
    target = folder / "base.png"
    if target.exists():
        return target
    image = generate(BASE_MODEL, BASE_PROMPT.format(look=character["look"], setting=character["setting"]), ledger)
    target.write_bytes(image)
    return target


def make_edits(folder, ledger):
    base = (folder / "base.png").read_bytes()
    raw = folder / "raw"
    raw.mkdir(exist_ok=True)
    for name, (part, change) in EDITS.items():
        target = raw / f"{name}.png"
        if target.exists():
            continue
        image = generate(EDIT_MODEL, KEEP.format(part=part, change=change), ledger, image=base)
        target.write_bytes(image)
        print(f"  edit {name}", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("characters")
    parser.add_argument("out")
    parser.add_argument("--stage", choices=["base", "all"], default="all")
    parser.add_argument("--only", default="")
    parser.add_argument("--cap", type=float, default=2.0)
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    ledger = Ledger(args.cap, out / "ledger.json", fal_prices())
    wanted = set(filter(None, args.only.split(",")))
    for character in json.loads(Path(args.characters).read_text()):
        if wanted and character["id"] not in wanted:
            continue
        folder = out / character["id"]
        folder.mkdir(exist_ok=True)
        started = time.time()
        make_base(character, folder, ledger)
        print(f"{character['id']}: base ({time.time() - started:.0f}s, ${ledger.spent:.3f} spent so far)", flush=True)
        if args.stage == "all":
            make_edits(folder, ledger)
            from sprites import build_sprites  # mediapipe and opencv are only needed here

            build_sprites(folder, list(EDITS), character.get("voice"))
            print(f"{character['id']}: pack ready (${ledger.spent:.3f} spent so far)", flush=True)


if __name__ == "__main__":
    main()
