# EXIF and map/dialog regression

For the separate production PWA lifecycle regression, see `docs/PWA.md` and
run `node tests/browser/pwa.mjs` after building. It manages its own local server.

For the broader UI audit, run `node tests/browser/interface.mjs` against the
local production preview (`STORM_TEST_URL`, default port 6422). It covers seven
viewport sizes, section history/scroll, 120 observations, large photo lists,
validation/focus, co-located map records, category contrast, unavailable data,
editing/export and invalid imports. Screenshots and its report are written to
the temporary directory printed at completion. See `docs/UI-audit.md`.

Start a local Vite dev or preview server. Run `node tests/browser/exif-map.mjs`
with an externally available Playwright installation. No dependency is added to
Storm Archive. Optional environment variables:

- `PLAYWRIGHT_MODULE`: import specifier or file URL of Playwright's entry module.
- `CHROME_EXECUTABLE`: installed Chrome/Chromium executable (otherwise Playwright's browser).
- `STORM_TEST_URL`: local server URL (default `http://127.0.0.1:6418`).
- `STORM_SCREENSHOT_DIR`: existing directory for optional dialog/lightbox screenshots.

Every scenario creates and disposes an isolated browser context. The script
never attaches to a user's profile or clears existing browser data. It tests
real EXIF parsing, sequential uploads, saving/editing, real Leaflet markers and
popups, dialog stacking, focus, Escape, nested photo/discard dialogs, scrolling,
mobile navigation and archive preservation. Public map tile requests are
blocked; no tile response is needed to test Leaflet's actual DOM layers.

The three 32×24 JPEG fixtures are test inputs only. `first.jpg` and `later.jpg`
contain local shooting times 2020-06-15/16 18:30, GPS 56.5/57.5 N and 44.25 E,
camera Regression Fixture camera, 50mm, ISO 200, f/4 and 1/250s. `no-exif.jpg`
has no EXIF. Component tests separately cover asynchronous manual edits, cleared
dates, undated legacy events, failed files and partial coordinate input.
