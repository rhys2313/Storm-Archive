# Storm Archive branding

The user explicitly assigned **лого.png** (document with lightning) to the UI
and **ава.png** (pixel cloud, lightning and Storm Archive wordmark) to the app icon.
The two `*-original.png` files are byte-for-byte originals, both opaque RGB PNG,
1254 × 1254. Their SHA-256 values and crop coordinates are in `assets.json`.

Only empty outer background margins are cropped. Every output is resized
directly from its source crop with nearest-neighbour sampling: no tracing,
recolouring, filtering, optical thickening or invented transparency. The
document retains its original antialiased source pixels; the pixel artwork
retains its original rectangular shapes. Neither source supports a true SVG.

`prepare.py` reproduces the assets with Python + Pillow, independently of the
web build (no added npm dependency). Runtime URLs include a hash of both
originals and the preparation recipe, so a new source or recipe gets a new URL.
When regenerating, update StormMark, index.html and manifest.json to the printed
version, inspect the result, and remove the now-unreferenced version directory.

Runtime assets in `public/branding/<version>/`:

| File | Size | Use |
| --- | --- | --- |
| logo.png | 288 × 288 | Sidebar, mobile header, empty archive |
| favicon-16.png / favicon-32.png | 16 / 32 square | Browser tabs |
| apple-touch-icon.png | 180 × 180 | Apple home screen metadata |
| pwa-192.png / pwa-512.png | 192 / 512 square | Chromium PWA, purpose `any` |
| pwa-maskable-512.png | 512 × 512 | Android masks, purpose `maskable` |

`public/favicon.ico` contains independently prepared 16, 32, 48, 64, 128 and
256 px PNG entries. It also serves as a future Windows packaging resource.
`avatar-master-1024.png` and the untouched original are available for future
Android/Windows packaging; these large source assets are outside public and
are not precached or shipped with the website. No native app is built here.

The separate opaque maskable icon fits the **entire cloud and wordmark** inside
a 38% radius, leaving room within the guaranteed 40% safe circle. Do not mark
the ordinary edge-filling icon as maskable. Padding is intentional here.
At 16 px the original wordmark cannot be readable; its composition is retained
instead of redrawing or removing letters. Inspect small icons at actual size.

Existing service worker release hashing includes every runtime asset. Updating
icons does not clear IndexedDB, localStorage, photos or observations. Apply the
ordinary app update or close saved app windows and reopen. Installed OS icons
have a separate browser/platform lifecycle: Chromium can request a user review
of changed icons, and iOS/Android/Windows must be checked on actual devices.
Do not advise clearing site data to refresh an icon.
