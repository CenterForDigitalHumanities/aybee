# aybee tool upgrade — change log and read porting checklist

This document records every change made to the **aybee** tool during its 2025
upgrade and explains how to apply the same changes to the **read** viewer
(`CenterForDigitalHumanities/read`), which shares the same architecture
(AngularJS 1.4.7, `index.html`/`app.js`/`utils.js`/`aybee.html`/`app.css`, `lib/`).

Each section lists: **What changed**, **Why**, and **How to apply to read**.

---

## 1. Framework migration: AngularJS → Web Component + plain ES modules

**What changed**

- Removed AngularJS 1.4.7, `ngRoute`, `ui.bootstrap`, `angular-loading-bar`, `ngSanitize`.
- Removed `lib/` (hotkeys, loading-bar) and `aybee.html` (the Angular template).
- `index.html` now contains a single `<aybee-viewer>` custom element and
  `<script type="module" src="app.js">`.
- `app.js` defines `class AyBeeViewer extends HTMLElement` (light DOM, no Shadow DOM)
  and registers it with `customElements.define('aybee-viewer', AyBeeViewer)`.
- All event handling is delegated: `click`/`change`/`input` listeners on the host
  element dispatch on `data-action` attributes.
- No build step, no bundler, no dependencies. `package.json` only declares
  `"type": "module"` and a `node --test` script for the pure-function modules.
- `index.html` CDN links were refreshed: Skeleton moved from dead `rawgit.com`
  to `cdnjs.cloudflare.com/ajax/libs/skeleton/2.0.4/skeleton.min.css`; Font Awesome
  moved from `maxcdn` to `cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/...`.

**Why**

AngularJS is deprecated and unmaintained. The other tools in the org
(navplace-viewer, OMR_Canvas_Annotator, oh-my-rerum) are plain JS / Web Components
with no build step, so this matches the ecosystem and removes a large dependency.

**How to apply to read**

1. Delete `lib/`, `read.html`, and the Angular script tags from `index.html`.
2. Replace the Angular controller with a custom element (rename `AyBeeViewer` to
   `ReadViewer`, `aybee-viewer` to `read-viewer`).
3. Port the controller's `$scope` state into the element's `this.state` object.
4. Replace `ng-click`/`ng-change`/`ng-model` with `data-action` delegation and
   `data-*` attributes (see `app.js` `onClick`/`onChange`).
5. Replace `$http` with `fetch` (see `fetchJSON` in `app.js`).
6. Replace `$location.search()` with `parseQuery()` from `query.js` (see §5).
7. Replace `ngSanitize` with `sanitizeHtml` from `utils.js` (see §8).

---

## 2. IIIF Presentation API 2 / 3 / 4 support

**What changed**

- New `iiif.js` module with a hand-rolled normalizer that converts any of
  Presentation API 2.0, 3.0, or 4.0 into one internal model:
  `{ id, type, version, label, description, descriptions, metadata, canvases, manifests, collections, annotations }`.
- `detectVersion(data)`:
  - `@context` containing `presentation/2`, `presentation/3`, or `presentation/4`
    wins (the `@context` change is the primary signal for v4).
  - Structural fallback: `sequences` or `@id`/`@type` → v2; otherwise v3.
- `normalize()` handles:
  - v2: `sequences[0].canvases`, `canvas.otherContent[].resources`,
    `a.on` (with `#xywh=`), `a['@type'] === 'oa:Annotation'`,
    body text via `cnt:chars`/`chars`/`@value`/`value`,
    `canvas.images[0].resource['@id']`.
  - v3/v4: `items` containers, `id`/`type`, `motivation` (string or array),
    `target` (string or object), `body` (single or array).
- `getLabel`/`getDescription`/`getMetadata`/`getText`/`getSelector` are the
  version-agnostic accessors used by the UI.
- `getMetadata` wraps label/value objects in `{ label: ... }` before calling
  `getLabel`, so v3 language-map metadata (`{ en: ['Author'] }`) renders
  correctly (fixed during the aybee port; apply the same fix to read).

**Why**

Presentation API 4.0 is released; the tool previously only understood v2.
For the resources of concern (Manifest/Canvas/AnnotationCollection/AnnotationPage)
v3→v4 is nearly identical except for `@context`, so the normalizer treats them
with one code path and only branches on v2.

**How to apply to read**

1. Copy `iiif.js` verbatim (it is pure and has no DOM dependencies).
2. Replace every direct access to `obj.sequences[0].canvases`,
   `canvas.otherContent`, `a.on`, `a['@type']`, `cnt:chars` with the normalizer
   output and accessors.
3. Add the same `detectVersion` logic; do not hard-code `@context` values.
4. Apply the `getMetadata` language-map fix (see above).

---

## 3. Resource types: Manifest, Canvas, AnnotationCollection, AnnotationPage, Collection

**What changed**

- The tool no longer assumes a Manifest. `loadResource` dispatches on the
  normalized `type`:
  - `Collection` → `collectionTemplate` (list of manifests).
  - `Manifest` → viewer with canvases.
  - `Canvas` → viewer with that single canvas.
  - `AnnotationCollection` / `AnnotationPage` → `resolveAnnotationResource`:
    groups annotations by `target`, fetches each target, and if the target is a
    Canvas or Manifest, attaches the annotations to the matching canvas so the
    image can be painted.
- `resolveAnnotationResource` also follows `external` annotation references
  (e.g. an AnnotationPage that points at another page) and merges them.
- `loadExternalAnnotations` fetches `otherContent`/`seeAlso`-style external
  annotation lists for each canvas of a Manifest.

**Why**

Users may be handed a Canvas or an annotation resource directly (e.g. from
oh-my-rerum or a share link). If the target contains enough information to
discover the image, the tool should render it.

**How to apply to read**

1. Port `resolveAnnotationResource` and `loadExternalAnnotations` from `app.js`.
2. In the old controller, the `sequences[0].canvases` access crashes on a Canvas
   resource — replace it with the normalizer's `canvases` array, which is
   populated for all resource types.

---

## 4. LDN Inbox integration (Rerum Inbox by default)

**What changed**

- New `ldn.js` module:
  - `getInboxes()`/`saveInboxes()` — localStorage-backed list of inbox URLs,
    defaulting to `https://inbox.rerum.io/messages`.
  - `getOptIn()`/`setOptIn()` — persisted opt-in flag (default off).
  - `queryInbox(inbox, target)` — `GET <inbox>?target=<uri>`.
  - `extractMessages()` — defensive parsing of the response (array, `.messages`,
    or `.items`).
- Settings modal (gear icon) lets the user add/remove inboxes and toggle the
  opt-in checkbox. The choice persists in localStorage.
- When opt-in is on, `checkLdn()` queries every configured inbox for annotations
  targeting the current canvas or manifest. Results appear in an LDN panel with
  an **Include** button per result; included annotations are merged into the
  canvas and visually distinguished with the `ldn-annotation` class.
- The inbox list is user-configurable so a fork can point at a different LDN
  without code changes.

**Why**

The user asked for a registry of LDN inboxes with Rerum as the default, opt-in
like the Mirador LDN plugin, surfacing annotations that target the rendered
resource and asking whether to include them.

**How to apply to read**

1. Copy `ldn.js` verbatim.
2. Port `checkLdn`/`includeLdn` and the settings modal from `app.js`.
3. Keep the inbox list in localStorage under the same keys so users can swap
   inboxes; do not hard-code the inbox URL in the fetch call.

---

## 5. Shareable query string

**What changed**

- New `query.js` module:
  - `parseQueryString(search)` / `parseQuery()` read `window.location.search`
    **directly** (not via Angular `$location`), so pre-hash query parameters are
    visible.
  - `safeDecode()` handles percent-encoded URIs (including double-encoded ones
    from oh-my-rerum).
  - `buildUrl(base, params)` builds shareable URLs; passing `null` removes a
    parameter.
- Supported parameters (no deprecated aliases):
  - `iiif-content` — the resource URI (Manifest, Canvas, AnnotationCollection,
    AnnotationPage, or Collection).
  - `manifest` — legacy convenience alias for a Manifest URI (kept because it is
    a documented parameter, not a deprecated alias of `url`).
  - `canvas` — canvas index or canvas `@id` to select.
  - `region` — `xywh=x,y,w,h` to render a bounded area as an image.
  - `annotation` — annotation `@id` to focus/select.
- Precedence: `iiif-content` > `manifest`.
- `updateUrl()` uses `history.pushState` so the URL always reflects the current
  state (canvas, region, annotation) and is shareable; `popstate` re-initializes.
- The canonical `iiif-content` is the **requested URI**, not the resource's
  declared `@id` — some servers (e.g. T-PEN) declare an `@id` that returns an
  empty body, so shareable URLs must point at the URI that actually loaded.
- The old `?url=` and `?p=` parameters and the `#/aybee` hash route are **not**
  retained (per decision: no deprecated aliases).

**Why**

Shareable, meaningful URLs; oh-my-rerum sends a percent-encoded URI in the
pre-hash query string, which Angular's `$location.search()` could not see.

**How to apply to read**

1. Copy `query.js` verbatim.
2. Replace `$location.search()` with `parseQuery()`.
3. Remove the `replace(/^https?:/, '')` scheme-stripping hack — it mangles URIs
   (see §7).
4. Replace hash routing with `history.pushState` + `popstate`.

---

## 6. Shareable single annotation (share modal)

**What changed**

- A share icon in the viewer toolbar opens a modal with up to three options:
  1. **Bounded area as image** — URL with `region` + `annotation` params; the
     viewer renders just the bounded area (`region-view` with a `<canvas>` crop),
     plus a **Download PNG** button and a provenance link back to the full
     resource.
  2. **Full resource with annotation selected** — URL with `annotation` param;
     the annotation is highlighted (`focused` class) and scrolled into view.
  3. **Deep link to annotation** — URL with `iiif-content` set to the annotation
     `@id` (renders the annotation resource directly).
- `copyLink` copies the chosen URL; `downloadCrop` downloads the cropped PNG.
- `cropImage` in `utils.js` draws the region to a canvas (CORS `anonymous`), with
  a tainted-canvas fallback that returns the canvas element for display.
- Selecting an annotation (`selectAnnotation`) updates the URL and toggles the
  `focused` class **in place** — it does not re-render the viewer or re-crop the
  line images, so clicking through many segments stays fast.
- `focusAnnotationElement` centers the selected annotation with a custom
  `requestAnimationFrame` scroll animation (`smoothScrollTo`, ~200–500 ms
  ease-in-out, cancels on rapid clicks). It does not rely on
  `scrollIntoView({ behavior: 'smooth' })` or CSS `scroll-behavior`, which some
  environments (e.g. `prefers-reduced-motion: reduce`) disable entirely.

**Why**

Any single annotation should be shareable, with provenance to the whole resource.

**How to apply to read**

1. Port `shareModalTemplate`, `copyLink`, `downloadCrop`, `getFocusedAnnotation`,
   and `hydrateCrops` from `app.js`.
2. Port `cropImage`/`parseXYWH` from `utils.js`.
3. Add the share button to the toolbar with `data-action="open-share"`.

---

## 7. oh-my-rerum compatibility

**What changed**

- Root causes fixed:
  1. Pre-hash query parameters are now read from `window.location.search`
     (§5), so OMR's `?iiif-content=<percent-encoded URI>` works.
  2. The `replace(/^https?:/, '')` scheme-stripping hack is gone; HTTPS URIs are
     preserved. `fetchJSON` now **rejects** `http://` with a clear error message
     instead of silently breaking.
  3. Canvas resources without `sequences` no longer crash — the normalizer
     handles all resource types (§3).
- The OMR `tools/aybee.json` `accepts` map is updated to advertise the supported
  types (see §9).

**Why**

`CenterForDigitalHumanities/read#3` documents the incompatibility; the same bug
exists in AyBee (`CenterForDigitalHumanities/aybee#3`).

**How to apply to read**

1. Apply §5 (query parsing) and §3 (resource types) — these are the two root
   causes.
2. Remove the scheme-stripping regex.
3. Update OMR `tools/read.json` the same way as `tools/aybee.json`.

---

## 8. HTML sanitizer

**What changed**

- `utils.js` now exports `escapeHtml` and `sanitizeHtml`.
- `sanitizeHtml` uses a whitelist: tags `em`, `strong`, `i`, `b`, `u`, `s`,
  `span`, `br`, `p`, `code`, `sub`, `sup`, `monogram`, `a`, `small`, `mark`;
  attributes `class`, `decoration`, `shape`, `title`, `href`; strips `on*` and
  `style`; unwraps disallowed tags.
- The `em[decoration]` and `monogram[shape]` cases are preserved because
  transcriptions use them (see the old `aybee.html` CSS).

**Why**

Transcriptions contain markup that must render, but untrusted annotation text
must not inject scripts.

**How to apply to read**

1. Copy `escapeHtml`/`sanitizeHtml` from `utils.js`.
2. Replace `ngSanitize`/`$sce` usage with `sanitizeHtml` on all annotation and
   metadata text.

---

## 9. oh-my-rerum registration

**What changed**

- `CenterForDigitalHumanities/oh-my-rerum` `tools/aybee.json` `accepts` map now
  advertises: `Collection`, `Manifest`, `Canvas`, `AnnotationCollection`,
  `AnnotationPage` — all mapped to the `iiif-content` parameter.

**How to apply to read**

- Update `tools/read.json` with the same `accepts` map.

---

## 10. Tests

**What changed**

- `package.json` adds `"test": "node --test"`.
- `tests/iiif.test.mjs` — 17 tests covering v2/v3/v4 normalization, version
  detection, labels/descriptions/metadata (including v3 language maps),
  annotation collection, selectors, and canvas extraction.
- `tests/query.test.mjs` — query parsing (including percent-encoded and
  double-encoded URIs) and URL building.

**How to apply to read**

- Copy the test files; adjust imports if module names differ. Run with
  `node --test` (note: `node --test tests/` fails on Node 22 — use the bare
  `node --test`).

---

## AyBee-specific behavior (not in read)

- **Transcription list across all canvases**: aybee flattens every canvas's
  annotations into one alpha-sorted list (`canvasIndex: -1` = all canvases), with
  a canvas selector (`All canvases` + each canvas) so the `canvas` parameter is
  meaningful. read renders one canvas at a time.
- **In-place search filtering**: typing in the search box toggles
  `style.display` on `.text-annotation` elements (matched by `data-anno` against
  a map of raw text) instead of re-rendering, so keystrokes never re-crop line
  images. `set-letter` and `toggle-search-mode` update in place too.
- **v2 language descriptions**: `getLanguages`/`currentDescription` handle v2
  array descriptions (`@language`/`@value`) as well as v3 language maps, since
  the old aybee had language buttons for v2.
- **No image view / universe browser**: aybee keeps its transcription-list
  identity; the landing page keeps the Goldblum TPEN example
  (`https://t-pen.org/TPEN/manifest/6609`).

---

## Verification performed

- `node --test` — 17/17 pass.
- `node --check` on `app.js`, `iiif.js`, `query.js`, `ldn.js`, `utils.js`.
- Normalizer smoke-tested against a real T-PEN v2 manifest and a IIIF cookbook
  v3 manifest.
- Headless Chrome (local HTTPS server, self-signed cert):
  - Landing page renders.
  - `?iiif-content=` loads a Manifest, renders canvas selector and the
    transcription list.
  - `?iiif-content=http://...` shows the HTTP rejection error.
  - `?region=xywh=...` renders the bounded-area view with provenance link.