# Storm Archive branding

The user explicitly assigned **лого.png** (document with lightning) to the UI
and **ава.png** (pixel cloud, lightning and Storm Archive wordmark) to the app icon.
The two `*-original.png` files are byte-for-byte originals, both opaque RGB PNG,
1254 × 1254. Their SHA-256 values and crop coordinates are in `assets.json`.

Only empty outer margins are cropped. The UI logo's dark raster background,
including the lightning cutout, is removed with an alpha matte derived from
the source luminance. Dark noise is excluded and edge RGB is decontaminated
to avoid a baked-in dark or light fringe. No tracing, erosion or dilation
is applied. The user approved two contrast versions:
original white for the dark theme and existing interface ink #1b201a for
the light theme. Both have exactly the same alpha channel and geometry.

The user subsequently requested smooth document diagonals. Its alpha channel
is resized once to 576×576 with Lanczos antialiasing, then shared by both solid
ink colours; normal browser sampling is used at the unchanged UI sizes. This
retains subpixel edge coverage without dark/white matte contamination.

App icons are resized directly from the source crop with nearest-neighbour
sampling. The app icon, its black background, pixel shapes and all generated
icon bytes are unchanged by this correction; its intentional opaque field
is appropriate for launcher masks. Neither source supports a true SVG.

`prepare.py` reproduces the assets with Python + Pillow, independently of the
web build (no added npm dependency). Runtime URLs include a hash of both
originals and the preparation recipe, so a new source or recipe gets a new URL.
When regenerating, update StormMark, index.html and manifest.json to the printed
version, inspect the result, and remove the now-unreferenced version directory.

Runtime assets in `public/branding/<version>/`:

| File | Size | Use |
| --- | --- | --- |
| logo.png / logo-on-light.png | 576 × 576, RGBA | Same transparent UI logo, white/dark ink |
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
