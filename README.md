# aybee

Rerum IIIF transcription reader. Loads and displays IIIF Presentation API 2.0,
3.0, and 4.0 resources — Manifests, Canvases, AnnotationCollections,
AnnotationPages, and Collections — as plain Web Components with no build step.

## Usage

Open `index.html` (or the deployed site) and paste a resource URI, or use a
shareable URL:

- `?iiif-content=<uri>` — the resource to load (Manifest, Canvas,
  AnnotationCollection, AnnotationPage, or Collection)
- `?manifest=<uri>` — legacy convenience parameter for a Manifest
- `?canvas=<index|id>` — select a canvas (default: all canvases)
- `?region=xywh=x,y,w,h` — render a bounded area as an image
- `?annotation=<id>` — focus a specific annotation

## Development

- `npm test` — run the unit tests (`node --test`)
- No build step: edit the ES modules directly

## Upgrading the similar read viewer

See [docs/UPGRADE.md](docs/UPGRADE.md) for a per-change checklist of everything
in this upgrade and how to apply the same changes to
[CenterForDigitalHumanities/read](https://github.com/CenterForDigitalHumanities/read).