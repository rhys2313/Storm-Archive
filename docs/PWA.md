# Offline operation and updates

Storm Archive is deployed at the domain root over HTTPS (localhost is allowed
for testing). The manifest uses `/` for its identity, start URL and scope, with
standalone display, 192/512 PNG icons, a separate maskable icon and a 180px Apple
touch icon. The existing install offer is shown only after the browser supplies
`beforeinstallprompt`; Safari uses its native Add to Home Screen action.

`build/pwa.js` generates `dist/sw.js` after Vite writes the production output.
It includes HTML, every emitted JS/CSS chunk (including MapView and exifr),
fonts, manifest and public icons. Each resource has a SHA-256 digest; the worker
and resource list determine the release cache name. Deploy the complete `dist`
directory together. Serve `/sw.js`, `/index.html` and `/manifest.json` with
revalidation (`Cache-Control: no-cache`); hashed `/assets/*` may be immutable.
No hosting account or server configuration is changed by this implementation.

An installation fetches and verifies the entire release before writing its
cache. Any failure rejects installation and removes only that incomplete
release. The UI reports readiness only after the active worker confirms its
resources. Once ready, navigation uses that release's HTML, including online;
HTML cannot advance independently of its JS/CSS. No runtime cache grows with
arbitrary URLs, query parameters or external map tiles.

New releases wait. The update offer asks all open Storm Archive windows whether
they have an open dialog before activation. An unknown or busy window blocks
immediate activation. On controller change each page checks again before
reloading, so a newly opened form is retained. After closing its dialogs the
user can apply the prepared update. Closing all old windows also lets the normal
browser lifecycle activate the update. A page from the legacy release has no
update UI: finish/save work and close its windows once, then reopen normally.
No site-data clearing or reinstallation is needed.
An immediate reopen may overlap activation; the new page then offers the
ordinary update action to finish the transition safely.

Cleanup handles only `storm-archive-app-*` and legacy
`storm-archive-cache-v<number>` CacheStorage entries. It retains the current
release, one previous release for in-flight navigation, and any older release
still needed by an open page. Unidentified legacy clients postpone cleanup.
IndexedDB, localStorage, photos, backups and other applications' caches are
never cleared. Map layers may be unavailable offline; local markers, popups,
records and other tabs remain usable. Reconnection retries visible tiles.

Browser-managed storage can still be evicted under device storage pressure or
removed by the user. Offline readiness does not replace a JSON backup. Actual
installation, OS process termination/relaunch, flight mode, storage pressure,
icon masks and updates should also be checked on Android Chrome and Windows
Chrome/Edge; Safari/iOS needs a separate Add to Home Screen and lifecycle check.

## Regression checks

Brand assets have versioned URLs under `public/branding/`; their preparation,
originals and future native packaging resources are documented in
`resources/branding/README.md`. They use the existing release hash and safe
update flow, without any user-data migration or clearing. The manifest identity,
launch URL, scope and display mode remain stable. The old SVG favicon is not
retained because the new originals are raster images.

An installed app's OS icon can update later than its web content. Chrome 144+
can ask the user to review a changed app icon through **Review app update**;
new icon URLs allow Chromium to detect the change. Saving work, applying the
normal update, closing/reopening the app and accepting that review are safe;
clearing site data is unnecessary. Other browsers/platforms can behave
differently. See [Chrome's icon update lifecycle](https://developer.chrome.com/blog/improvements-to-web-app-updates).

`node tests/browser/branding.mjs` checks actual DOM images, favicons, Chromium
manifest/installability metadata, the maskable safe circle and offline assets
in fresh temporary browser contexts; it does not perform OS-level installation.

Run `npm test -- --silent --maxWorkers=1 --no-file-parallelism`, then
`npm run build`. With an externally available Playwright installation, run
`node tests/browser/pwa.mjs`. `PLAYWRIGHT_MODULE` and `CHROME_EXECUTABLE` work as
described in `tests/browser/README.md`. Optional `STORM_LEGACY_DIST` points to an
untouched previous production output directory containing index.html and sw.js.

The browser script makes isolated contexts and temporary A/B/C builds, hosts
them on an ephemeral loopback port, actually stops the server for offline tests,
then tests updates, missing resources, multiple forms/windows, cache bounds,
foreign-cache preservation, photo bytes and JSON export. It writes screenshots
and report.json under its printed temporary directory. Temporary builds are
left available for diagnosis; no user browser profile or archive is touched.
It also closes and relaunches Chrome with a temporary persistent profile while
the server is stopped, and checks Chromium installability diagnostics outside
incognito mode. This verifies browser persistence, not OS-level installation.
Use separate localhost ports for development and production previews: an
installed production worker intentionally continues serving its pinned release.
Tile failures are simulated without contacting OpenStreetMap. The reconnect
check supplies the existing EXIF test JPEG as a controlled tile response to
verify redraw and notice recovery; it does not validate the external tile service.

## Files in this stage

- `build/pwa.js`, `vite.config.js`: production resource-list generation.
- `src/pwa/sw.js`: versioned worker template; replaces the removed `public/sw.js`.
- `src/services/pwa.js`, `src/components/PwaStatus.jsx`, `src/main.jsx`,
  `src/App.jsx`: registration, readiness and safe update UI.
- `src/components/MapView.jsx`, `src/index.css`: unavailable tiles and reconnect.
- `src/test/PwaWorker.test.js`, `src/test/PwaClient.test.js`, `src/test/setup.js`:
  worker, client and build regressions in Node/jsdom.
- `tests/browser/pwa.mjs`, `tests/browser/README.md`, `docs/PWA.md`:
  production browser checks and operation notes.

Reference: [service worker lifecycle](https://web.dev/articles/service-worker-lifecycle),
[Vite plugin hooks](https://vite.dev/guide/api-plugin),
[browser online-status limitations](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine).
