# Interface audit — stage 5

The initial production audit used isolated Chrome contexts at 320, 390, 768,
820, 1024 and 1440 CSS pixels, with an empty archive, 120 temporary observations,
long titles/locations/tags, and an observation with 24 photos. No user profile
or archive was opened. The original dark palette and existing application
architecture remain in use.

| Confirmed problem | Change and intended outcome |
| --- | --- |
| At 820px desktop navigation covered the brand, despite no document overflow | Compact tablet header, named icon buttons; one global add action on mobile |
| New sections inherited scroll offsets (statistics opened 438–498px down on phones) | Per-section scroll restoration, browser Back/Forward and direct section URLs |
| Gallery category was lost after leaving the section | Gallery filter and revealed-item count survive navigation |
| Validation kept focus on Save, with errors as far as 415px above the viewport | Focus and scroll to the invalid/missing field, accessible explanations; save failure stays visible |
| Long observation title filled the fixed dialog header | A compact common header; complete title and badges scroll with the record |
| All archive/gallery items were rendered immediately | Progressive lists (36 observations / 48 photos), with search over the complete archive and focus on newly revealed content |
| 24 photo rows pushed notes far below the upload area | First four rows, explicit expansion; all photos/captions remain in the draft |
| New photos could not be previewed until saving; caption fields lacked names | In-form lightbox, named captions, preserved focus/draft; pending uploads and dirty drafts protected on close/unload |
| Inputs could still change while an earlier save was in progress | Disable the form controls during the save, retaining input on failure |
| Failed image decoding had no explanation | A consistent unavailable-image state in cards, gallery, form, detail and lightbox; source data is retained |
| Secondary text and bright gallery badges had poor contrast | Shared readable text token and contrasting badge text; consistent 44px touch controls |
| Narrow warning rows squeezed text beside a wide action button | Wrapping notification layout; complete messages and actions remain available |
| Healthy storage showed a separate nearly empty diagnostic card | Check action sits with the storage summary; conflict/recovery diagnostics remain explicit |
| Monthly chart exposed no numeric series to assistive technology | Accessible monthly counts, readable small-screen chart, explanation of undated records |
| Loading/failed archives could look empty in other sections | Shared loading/recovery presentation before gallery, map or statistics can report an empty archive |
| Multiple observations at exactly the same coordinates covered each other's markers | One count marker with a dated, scrollable list; all records remain independently selectable |
| A fallback notice promised writes even when both stores were unavailable | Correct the notice text for that case; no change to storage/read-only policy |

No storage formats, classifications, import/export rules or service worker
strategies are changed in this stage. Weather basemap tiles still depend on
connectivity; local markers and records remain available offline.

Changed areas in this stage:

- `src/App.jsx`, `src/hooks/useSectionNavigation.js`, `src/components/Header.jsx`,
  `src/components/FilterBar.jsx`: section navigation, history, scroll and filters.
- `src/components/EventCard.jsx`, `src/components/EventDetailModal.jsx`,
  `src/components/EventFormModal.jsx`, `src/components/PhotoLightbox.jsx`,
  `src/components/Modal.jsx`, `src/hooks/useModalLayer.js`: record interactions,
  validation, protected drafts, preview and focus containment.
- `src/components/GalleryView.jsx`, `src/components/ShowMore.jsx`,
  `src/components/ArchiveImage.jsx`, `src/components/MapView.jsx`,
  `src/components/StatsView.jsx`: large collections, image failures, shared
  coordinates, empty states and accessible statistics.
- `src/components/DataBackupModal.jsx`, `src/services/storage.js`: diagnostic
  presentation and unavailable-storage notice wording only for this stage.
- `src/index.css`, `src/services/presentation.js`: responsive layout and contrast.
- `src/test/Interface.test.jsx`, `src/test/ModalKeyboard.test.jsx`,
  `src/test/App.test.jsx`, `src/test/setup.js`, `tests/browser/interface.mjs`,
  `tests/browser/exif-map.mjs`, `tests/browser/pwa.mjs`,
  `tests/browser/README.md`, this document: regression checks and documentation.

Final verification on 2026-10-13:

- All 265 automated tests passed in 12 files (the preceding 248 tests retained).
- Production build and `git diff --check` passed.
- Interface browser regression: 10 scenarios passed, including seven viewports
  from 320px to 1440px and a short landscape viewport, 120 observations,
  111 photos overall, 25 photos in one form, all-category contrast, unavailable
  images/storage, import rejection, export and byte-for-byte data checks.
- EXIF/map/dialog browser regression: four desktop/mobile scenarios passed.
- PWA browser regression: six scenarios passed, including offline workflows,
  multi-window updates and failed-update recovery, migration from the saved
  stage-4 production build, installability diagnostics and a complete Chrome
  restart with the server stopped.

All browser checks used fresh contexts or a temporary profile. No real user
archive was opened or modified. No packages were added and no changes were
committed, published or sent to GitHub.

Repeat the component suite and production build, then run
`tests/browser/interface.mjs`, `tests/browser/exif-map.mjs` and
`tests/browser/pwa.mjs` with the externally supplied Playwright runtime described
in `tests/browser/README.md` and `docs/PWA.md`. The UI script uses only its own
temporary data and writes screenshots to a temporary directory.

Accessibility references:
[dialog keyboard/focus guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
[text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
These targeted checks do not constitute certification or testing with actual
mobile screen readers. Android/iOS OS controls, virtual keyboards and installed
standalone windows still need physical-device verification.
