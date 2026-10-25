"""Cut a face pack's edited images into sprites.

Each edit (a mouth shape or the blink) is lined up with the base on face
landmarks that don't move for that edit, colour-matched to the base around its
edge, and cut to the region that changes (mouth and chin, or the eyes) with a
soft edge. At run time the app draws the base and fades sprites in on top, so
everything outside a sprite is always the original photo.
"""

import json
import urllib.request
from pathlib import Path

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_tasks
from mediapipe.tasks.python import vision

MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"

# MediaPipe face-mesh indices.
LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
CHIN = [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 206, 426, 216, 436, 57, 287]
LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]
UPPER_LIDS = [27, 28, 29, 30, 56, 157, 158, 159, 160, 161, 257, 258, 259, 260, 286, 384, 385, 386, 387, 388]
# Points that stay put while the mouth moves, and while the eyes blink.
STILL_FOR_MOUTH = [33, 133, 362, 263, 168, 6, 10, 234, 454, 1, 4, 70, 300]
STILL_FOR_EYES = [168, 6, 1, 4, 10, 234, 454, 61, 291, 0, 17]


def landmarker(cache):
    model = cache / "face_landmarker.task"
    if not model.exists():
        cache.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(MODEL_URL, model)
    options = vision.FaceLandmarkerOptions(base_options=mp_tasks.BaseOptions(model_asset_path=str(model)), num_faces=1)
    return vision.FaceLandmarker.create_from_options(options)


def points(detector, image):
    result = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(image, cv2.COLOR_BGR2RGB)))
    if not result.face_landmarks:
        raise RuntimeError("no face found")
    height, width = image.shape[:2]
    return np.array([(p.x * width, p.y * height) for p in result.face_landmarks[0]], dtype=np.float32)


def region_mask(shape, pts, indices, grow, feather):
    mask = np.zeros(shape[:2], np.uint8)
    cv2.fillConvexPoly(mask, cv2.convexHull(pts[indices].astype(np.int32)), 255)
    mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (grow * 2 + 1, grow * 2 + 1)))
    return cv2.GaussianBlur(mask.astype(np.float32) / 255.0, (0, 0), feather)


def build_sprites(folder, names, voice):
    folder = Path(folder)
    detector = landmarker(folder.parent / ".models")
    base = cv2.imread(str(folder / "base.png"))
    base_pts = points(detector, base)
    face_width = float(np.linalg.norm(base_pts[234] - base_pts[454]))
    sprites_dir = folder / "sprites"
    sprites_dir.mkdir(exist_ok=True)
    manifest = {"version": 1, "width": base.shape[1], "height": base.shape[0], "voice": voice, "base": "base.jpg", "sprites": {}}
    x, y, w, h = cv2.boundingRect(base_pts.astype(np.int32))
    manifest["face"] = {"x": x, "y": y, "w": w, "h": h}
    report = {}

    for name in names:
        variant = cv2.imread(str(folder / "raw" / f"{name}.png"))
        if variant.shape[:2] != base.shape[:2]:
            variant = cv2.resize(variant, (base.shape[1], base.shape[0]), interpolation=cv2.INTER_LANCZOS4)
        variant_pts = points(detector, variant)
        is_blink = name == "blink"
        still = STILL_FOR_EYES if is_blink else STILL_FOR_MOUTH
        matrix, _ = cv2.estimateAffinePartial2D(variant_pts[still], base_pts[still])
        aligned = cv2.warpAffine(variant, matrix, (base.shape[1], base.shape[0]), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
        moved = cv2.transform(variant_pts[None, still], matrix)[0]
        residual = float(np.mean(np.linalg.norm(moved - base_pts[still], axis=1)) / face_width)

        grow = int(face_width * (0.05 if is_blink else 0.06))
        feather = face_width * 0.025
        if is_blink:
            mask = np.maximum(
                region_mask(base.shape, base_pts, LEFT_EYE + [UPPER_LIDS[i] for i in range(0, 10)], grow, feather),
                region_mask(base.shape, base_pts, RIGHT_EYE + [UPPER_LIDS[i] for i in range(10, 20)], grow, feather),
            )
        else:
            # The jaw can drop in the edit, so the region also covers where the
            # edited lips and chin landed.
            aligned_pts = cv2.transform(variant_pts[None], matrix)[0]
            mask = np.maximum(region_mask(base.shape, base_pts, LIPS + CHIN, grow, feather), region_mask(base.shape, aligned_pts, LIPS + CHIN, grow, feather))

        # Match the patch's colour to the base in a ring just outside the hard region.
        ring = (mask > 0.05) & (mask < 0.5)
        corrected = aligned.astype(np.float32)
        for channel in range(3):
            source, target = corrected[..., channel][ring], base[..., channel][ring].astype(np.float32)
            if source.size:
                corrected[..., channel] = (corrected[..., channel] - source.mean()) * (target.std() / max(source.std(), 1e-3)) + target.mean()
        corrected = np.clip(corrected, 0, 255).astype(np.uint8)
        outside = mask < 0.02
        drift = float(np.mean(np.abs(aligned.astype(np.float32)[outside] - base.astype(np.float32)[outside])))

        ys, xs = np.where(mask > 0.01)
        top, bottom, left, right = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        alpha = (mask[top:bottom, left:right] * 255).astype(np.uint8)
        sprite = np.dstack([corrected[top:bottom, left:right], alpha])
        cv2.imwrite(str(sprites_dir / f"{name}.png"), sprite)
        manifest["sprites"][name] = {"file": f"sprites/{name}.png", "x": int(left), "y": int(top), "w": int(right - left), "h": int(bottom - top)}
        report[name] = {"residual": round(residual, 4), "drift": round(drift, 1)}

    cv2.imwrite(str(folder / "base.jpg"), base, [cv2.IMWRITE_JPEG_QUALITY, 92])
    (folder / "manifest.json").write_text(json.dumps(manifest, indent=2))
    (folder / "report.json").write_text(json.dumps(report, indent=2))
    print("  alignment (residual = landmark error / face width; drift = mean pixel change outside the sprite):", json.dumps(report), flush=True)
