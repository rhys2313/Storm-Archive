"""Offline asset preparation; Pillow is only needed when changing the originals.

Run from any directory: python resources/branding/prepare.py
No tracing, recolouring, alpha extraction or interpolated resizing.
"""
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import struct

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
logo_bytes = (HERE / "logo-original.png").read_bytes()
avatar_bytes = (HERE / "avatar-original.png").read_bytes()
recipe = Path(__file__).read_text(encoding="utf-8").encode("utf-8")
version = sha256(logo_bytes + avatar_bytes + recipe).hexdigest()[:12]
destination = ROOT / "public" / "branding" / version
destination.mkdir(parents=True, exist_ok=True)

logo_box = (324, 324, 930, 930)
avatar_box = (207, 234, 1056, 1083)
logo = Image.open(BytesIO(logo_bytes)).crop(logo_box)
avatar = Image.open(BytesIO(avatar_bytes)).crop(avatar_box)


def resized(image, size):
    return image.resize((size, size), Image.Resampling.NEAREST)


def save(image, path):
    image.save(path, format="PNG", optimize=True)


save(resized(logo, 288), destination / "logo.png")
for name, size in [("favicon-16", 16), ("favicon-32", 32),
                   ("apple-touch-icon", 180), ("pwa-192", 192), ("pwa-512", 512)]:
    save(resized(avatar, size), destination / (name + ".png"))
save(resized(avatar, 1024), HERE / "avatar-master-1024.png")

# The entire original cloud AND wordmark must fit inside the Android safe circle.
# Leave extra room beyond the required 40% radius; retain the opaque black field.
radius = max(((x + .5 - avatar.width / 2) ** 2 +
              (y + .5 - avatar.height / 2) ** 2) ** .5
             for y in range(avatar.height) for x in range(avatar.width)
             if max(avatar.getpixel((x, y))) > 100)
patch_size = int(avatar.width * (.38 * 512) / radius)
maskable = Image.new("RGB", (512, 512), (0, 0, 0))
maskable.paste(resized(avatar, patch_size), ((512 - patch_size) // 2,) * 2)
save(maskable, destination / "pwa-maskable-512.png")

# PNG-backed ICO entries are each resized directly from the source crop.
# Do not let an ICO encoder silently resample smaller entries with smoothing.
frames = []
for size in [16, 32, 48, 64, 128, 256]:
    buffer = BytesIO()
    save(resized(avatar, size), buffer)
    frames.append((size, buffer.getvalue()))
offset = 6 + len(frames) * 16
entries = []
for size, data in frames:
    entries.append(struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0,
                               1, 32, len(data), offset))
    offset += len(data)
(ROOT / "public" / "favicon.ico").write_bytes(
    struct.pack("<HHH", 0, 1, len(frames)) + b"".join(entries) +
    b"".join(data for _, data in frames))

(HERE / "assets.json").write_text(json.dumps({
    "version": version,
    "originals": {
        "logo-original.png": sha256(logo_bytes).hexdigest(),
        "avatar-original.png": sha256(avatar_bytes).hexdigest()
    },
    "logoCrop": logo_box, "avatarCrop": avatar_box,
    "resampling": "nearest", "background": "original opaque RGB",
    "maskablePatchSize": patch_size
}, indent=2) + "\n", encoding="utf-8")
print(f"Prepared public/branding/{version}; maskable patch {patch_size}px")
