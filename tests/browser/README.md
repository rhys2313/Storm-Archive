# EXIF and map/dialog regression

For the user-supplied logo and application icons, run
`node tests/browser/branding.mjs` against the production preview. Its seven
scenarios check both themes, desktop/tablet/phone layouts, actual image pixels,
favicon/manifest URLs, maskable safe area, Chromium installability and offline
asset hashes. Its temporary persistent profile is separate from user profiles.
Source originals and preparation details are in `resources/branding/README.md`.

For the separate production PWA lifecycle regression, see `docs/PWA.md` and
run `node tests/browser/pwa.mjs` after building. It manages its own local server.

For the broader UI audit, run `node tests/browser/interface.mjs` against the
local production preview (`STORM_TEST_URL`, default port 6422). It covers eleven
viewport sizes in both light and dark themes, section history/scroll, 120 observations, large photo lists,
validation/focus, co-located map records, category contrast, unavailable data,
editing/export and invalid imports. Screenshots and its report are written to
the temporary directory printed at completion. See `docs/UI-audit.md`.

Run `node tests/browser/redesign.mjs` against the same production preview for
the appearance and interaction regression. Its eight isolated scenarios cover
real EXIF uploads through the footer shortcut, conditional classification,
system/light/dark appearance, persistence and cross-window synchronization,
offline reload, map/dialog exit shielding and focus restoration, backup export,
invalid import and confirmed replacements with byte-for-byte photo preservation.
They also check reduced motion, failed appearance preference storage and theme
initialization before React loads. Control screenshots and report.json go to
the printed temporary directory. Both scripts require a production build with
its generated service worker; a dev server cannot satisfy offline readiness.
The map checks assert computed theme colors and 44 px zoom controls after
Leaflet's lazy stylesheet loads. Cold service-worker preparation allows 45 s
on a busy test machine; readiness and offline behavior are still asserted.
The compact readiness indicator is selected by its accessible status name.
Polish regressions also check empty month tracks, visible nonzero bars, phone
map controls above navigation with offline notices, keyboard access to storage
diagnostics, 44 px archive actions and form clearance after reducing the viewport
height at 375/430 px. Viewport resizing does not emulate a physical Android keyboard.
Single map markers must keep their circular shape after Leaflet's stylesheet
loads, and photo navigation is clicked with native pointer input to catch
pressed-state transforms that could move a control away from the pointer.

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
The native photo swipe also checks that browser history stays on the map and
its popup survives. The photo stage reserves horizontal gestures while keeping
vertical panning and pinch zoom available; component tests cover cancelled and
multi-touch gestures, metadata scrolling and viewer exit.

The three 32×24 JPEG fixtures are test inputs only. `first.jpg` and `later.jpg`
contain local shooting times 2020-06-15/16 18:30, GPS 56.5/57.5 N and 44.25 E,
camera Regression Fixture camera, 50mm, ISO 200, f/4 and 1/250s. `no-exif.jpg`
has no EXIF. Component tests separately cover asynchronous manual edits, cleared
dates, undated legacy events, failed files and partial coordinate input.
