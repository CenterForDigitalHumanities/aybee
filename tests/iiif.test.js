import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectVersion, normalize, getLabel, getDescription, getMetadata, getSelector, getText, targetSource, normalizeAnnotation } from '../iiif.js';

const v2Manifest = {
  '@context': 'http://iiif.io/api/presentation/2/context.json',
  '@id': 'https://example.org/manifest/1',
  '@type': 'sc:Manifest',
  label: 'V2 Manifest',
  description: 'A v2 manifest',
  metadata: [{ label: 'Date', value: '1500' }],
  sequences: [{
    canvases: [{
      '@id': 'https://example.org/canvas/1',
      '@type': 'sc:Canvas',
      label: 'Page 1',
      width: 1000,
      height: 1500,
      images: [{
        '@type': 'oa:Annotation',
        resource: { '@id': 'https://example.org/img/1/full/full/0/default.jpg', '@type': 'dctypes:Image' },
      }],
      otherContent: [{
        '@id': 'https://example.org/list/1',
        '@type': 'sc:AnnotationList',
        resources: [{
          '@id': 'https://example.org/anno/1',
          '@type': 'oa:Annotation',
          motivation: 'sc:painting',
          on: 'https://example.org/canvas/1#xywh=100,200,300,400',
          resource: { '@type': 'cnt:ContentAsText', chars: 'Hello <em>world</em>' },
        }],
      }],
    }],
  }],
};

const v3Manifest = {
  '@context': 'http://iiif.io/api/presentation/3/context.json',
  id: 'https://example.org/manifest/3',
  type: 'Manifest',
  label: { en: ['V3 Manifest'] },
  items: [{
    id: 'https://example.org/canvas/3',
    type: 'Canvas',
    label: { en: ['Page 3'] },
    width: 800,
    height: 1200,
    items: [{
      id: 'https://example.org/page/3',
      type: 'AnnotationPage',
      items: [{
        id: 'https://example.org/anno/3',
        type: 'Annotation',
        motivation: 'painting',
        body: { id: 'https://example.org/img/3/full/full/0/default.jpg', type: 'Image' },
        target: 'https://example.org/canvas/3',
      }],
    }],
    annotations: [{
      id: 'https://example.org/page/3a',
      type: 'AnnotationPage',
      items: [{
        id: 'https://example.org/anno/3a',
        type: 'Annotation',
        motivation: 'commenting',
        body: { type: 'TextualBody', value: 'A comment' },
        target: { id: 'https://example.org/canvas/3#xywh=10,20,30,40', type: 'SpecificResource', selector: { type: 'FragmentSelector', value: 'xywh=10,20,30,40' } },
      }],
    }],
  }],
};

const v4Manifest = {
  '@context': 'http://iiif.io/api/presentation/4/context.json',
  id: 'https://example.org/manifest/4',
  type: 'Manifest',
  label: { en: ['V4 Manifest'] },
  items: [{
    id: 'https://example.org/canvas/4',
    type: 'Canvas',
    width: 600,
    height: 900,
    items: [{
      id: 'https://example.org/page/4',
      type: 'AnnotationPage',
      items: [{
        id: 'https://example.org/anno/4',
        type: 'Annotation',
        motivation: ['painting'],
        body: { id: 'https://example.org/img/4/full/full/0/default.jpg', type: 'Image' },
        target: 'https://example.org/canvas/4',
      }],
    }],
  }],
};

const v2Canvas = {
  '@context': 'http://iiif.io/api/presentation/2/context.json',
  '@id': 'https://example.org/canvas/1',
  '@type': 'sc:Canvas',
  label: 'Standalone Canvas',
  width: 1000,
  height: 1500,
  images: [{ resource: { '@id': 'https://example.org/img/1/full/full/0/default.jpg' } }],
};

const v3AnnotationPage = {
  '@context': 'http://iiif.io/api/presentation/3/context.json',
  id: 'https://example.org/page/5',
  type: 'AnnotationPage',
  items: [{
    id: 'https://example.org/anno/5',
    type: 'Annotation',
    motivation: 'commenting',
    body: { type: 'TextualBody', value: 'Targets a canvas' },
    target: 'https://example.org/canvas/5#xywh=0,0,100,100',
  }],
};

test('detectVersion reads @context', () => {
  assert.equal(detectVersion(v2Manifest), 2);
  assert.equal(detectVersion(v3Manifest), 3);
  assert.equal(detectVersion(v4Manifest), 4);
});

test('detectVersion falls back structurally', () => {
  assert.equal(detectVersion({ '@id': 'x', '@type': 'sc:Manifest', sequences: [] }), 2);
  assert.equal(detectVersion({ id: 'x', type: 'Manifest', items: [] }), 3);
});

test('normalize v2 manifest', () => {
  const n = normalize(v2Manifest);
  assert.equal(n.type, 'Manifest');
  assert.equal(n.version, 2);
  assert.equal(n.label, 'V2 Manifest');
  assert.equal(n.canvases.length, 1);
  const c = n.canvases[0];
  assert.equal(c.id, 'https://example.org/canvas/1');
  assert.equal(c.width, 1000);
  assert.equal(c.images[0].id, 'https://example.org/img/1/full/full/0/default.jpg');
  assert.equal(c.annotations.length, 1);
  assert.equal(c.annotations[0].text, 'Hello <em>world</em>');
  assert.equal(c.annotations[0].selector, 'xywh=100,200,300,400');
});

test('normalize v3 manifest', () => {
  const n = normalize(v3Manifest);
  assert.equal(n.version, 3);
  assert.equal(n.label, 'V3 Manifest');
  const c = n.canvases[0];
  assert.equal(c.images[0].id, 'https://example.org/img/3/full/full/0/default.jpg');
  assert.equal(c.annotations.length, 1);
  assert.equal(c.annotations[0].text, 'A comment');
  assert.equal(c.annotations[0].selector, 'xywh=10,20,30,40');
});

test('normalize v4 manifest', () => {
  const n = normalize(v4Manifest);
  assert.equal(n.version, 4);
  assert.equal(n.canvases[0].images[0].id, 'https://example.org/img/4/full/full/0/default.jpg');
});

test('normalize standalone v2 canvas', () => {
  const n = normalize(v2Canvas);
  assert.equal(n.type, 'Canvas');
  assert.equal(n.canvases.length, 1);
  assert.equal(n.canvases[0].images[0].id, 'https://example.org/img/1/full/full/0/default.jpg');
});

test('normalize v3 annotation page', () => {
  const n = normalize(v3AnnotationPage);
  assert.equal(n.type, 'AnnotationPage');
  assert.equal(n.annotations.length, 1);
  assert.equal(n.annotations[0].target, 'https://example.org/canvas/5#xywh=0,0,100,100');
  assert.equal(n.annotations[0].selector, 'xywh=0,0,100,100');
});

test('getLabel handles language maps and arrays', () => {
  assert.equal(getLabel({ label: { en: ['A', 'B'] } }), 'A B');
  assert.equal(getLabel({ label: ['x', 'y'] }), 'x y');
  assert.equal(getLabel({ label: 'plain' }), 'plain');
  assert.equal(getLabel({}), '');
});

test('getMetadata handles language maps', () => {
  const md = getMetadata({ metadata: [{ label: { en: ['Author'] }, value: { en: ['Me'] } }] });
  assert.equal(md[0].label, 'Author');
  assert.equal(md[0].value, 'Me');
  assert.deepEqual(getMetadata({ metadata: { Date: '1500' } }), [{ label: 'Date', value: '1500' }]);
  assert.deepEqual(getMetadata({}), []);
});

test('getSelector handles string and object targets', () => {
  assert.equal(getSelector('https://x/c#xywh=1,2,3,4'), 'xywh=1,2,3,4');
  assert.equal(getSelector({ id: 'https://x/c#xywh=5,6,7,8' }), 'xywh=5,6,7,8');
  assert.equal(getSelector({ selector: { value: 'xywh=9,10,11,12' } }), 'xywh=9,10,11,12');
  assert.equal(getSelector('https://x/c'), null);
});

test('getText extracts chars/value', () => {
  assert.equal(getText({ 'cnt:chars': 'a' }), 'a');
  assert.equal(getText({ chars: 'b' }), 'b');
  assert.equal(getText({ value: 'c' }), 'c');
  assert.equal(getText('d'), 'd');
  assert.equal(getText(null), '');
});

test('targetSource unwraps SpecificResource, v2 on objects and arrays', () => {
  assert.equal(targetSource('https://x/c'), 'https://x/c');
  assert.equal(targetSource({ type: 'SpecificResource', source: 'https://x/canvas-1.json' }), 'https://x/canvas-1.json');
  assert.equal(targetSource({ type: 'SpecificResource', source: { id: 'https://x/c2' } }), 'https://x/c2');
  assert.equal(targetSource({ '@type': 'oa:SpecificResource', full: 'https://x/c3' }), 'https://x/c3');
  assert.equal(targetSource([{ id: 'https://x/c4' }]), 'https://x/c4');
  assert.equal(targetSource({ id: 'https://x/c5' }), 'https://x/c5');
  assert.equal(targetSource(null), '');
});

test('normalizeAnnotation handles v3 SpecificResource targets', () => {
  const n = normalizeAnnotation({
    id: 'https://example.org/anno/sr',
    type: 'Annotation',
    motivation: 'tagging',
    body: { type: 'TextualBody', value: 'a line' },
    target: {
      type: 'SpecificResource',
      source: 'https://example.org/canvas-1.json',
      selector: { type: 'FragmentSelector', value: 'xywh=pixel:1597,1562,2200,344' },
    },
  }, 3);
  assert.equal(n.target, 'https://example.org/canvas-1.json');
  assert.equal(n.selector, 'xywh=pixel:1597,1562,2200,344');
  assert.equal(n.text, 'a line');
});

test('normalizeAnnotation handles v2 on objects and selector arrays', () => {
  const n = normalizeAnnotation({
    '@id': 'https://example.org/anno/v2',
    '@type': 'oa:Annotation',
    motivation: 'sc:painting',
    on: {
      '@type': 'oa:SpecificResource',
      full: 'https://example.org/canvas/9',
      selector: [{ '@type': 'oa:FragmentSelector', value: 'xywh=1,2,3,4' }],
    },
    resource: { '@type': 'cnt:ContentAsText', chars: 'v2 on object' },
  }, 2);
  assert.equal(n.target, 'https://example.org/canvas/9');
  assert.equal(n.selector, 'xywh=1,2,3,4');
});

test('getSelector tolerates array targets', () => {
  assert.equal(getSelector([{ id: 'https://x/c#xywh=5,6,7,8' }]), 'xywh=5,6,7,8');
  assert.equal(getSelector({ type: 'SpecificResource', source: 'https://x/c#xywh=1,1,1,1' }), 'xywh=1,1,1,1');
});

test('normalize lists v3 Collection items as manifests and collections', () => {
  const n = normalize({
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: 'https://example.org/collection/1',
    type: 'Collection',
    label: { en: ['A Collection'] },
    items: [
      { id: 'https://example.org/manifest/a', type: 'Manifest', label: { en: ['Manifest A'] } },
      { id: 'https://example.org/collection/nested', type: 'Collection', label: { en: ['Nested'] } },
    ],
  });
  assert.equal(n.manifests.length, 1);
  assert.equal(n.manifests[0].id, 'https://example.org/manifest/a');
  assert.equal(n.manifests[0].label, 'Manifest A');
  assert.equal(n.collections.length, 1);
  assert.equal(n.collections[0].id, 'https://example.org/collection/nested');
});

test('normalize keeps v2 Collection manifests and collections arrays', () => {
  const n = normalize({
    '@context': 'http://iiif.io/api/presentation/2/context.json',
    '@id': 'https://example.org/collection/2',
    '@type': 'sc:Collection',
    label: 'V2 Collection',
    manifests: [{ '@id': 'https://example.org/manifest/b', '@type': 'sc:Manifest', label: 'Manifest B' }],
    collections: [{ '@id': 'https://example.org/collection/n2', '@type': 'sc:Collection', label: 'Nested 2' }],
  });
  assert.equal(n.manifests[0].label, 'Manifest B');
  assert.equal(n.collections[0].label, 'Nested 2');
});

test('collectAnnotations follows AnnotationCollection first', () => {
  const n = normalize({
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: 'https://example.org/ac/1',
    type: 'AnnotationCollection',
    total: 2,
    first: { id: 'https://example.org/page/first', type: 'AnnotationPage' },
  });
  assert.deepEqual(n.annotations, [{ external: 'https://example.org/page/first' }]);
});

test('normalize recognizes the v2 sc:AnnotationCollection type', () => {
  const n = normalize({
    '@context': 'http://iiif.io/api/presentation/2/context.json',
    '@id': 'https://example.org/ac/2',
    '@type': 'sc:AnnotationCollection',
    label: 'V2 AC',
    first: { '@id': 'https://example.org/page/first', '@type': 'sc:AnnotationList' },
  });
  assert.equal(n.type, 'AnnotationCollection');
  assert.deepEqual(n.annotations, [{ external: 'https://example.org/page/first' }]);
});

test('normalize keeps language maps for the description toggle', () => {
  const v2 = normalize({
    '@context': 'http://iiif.io/api/presentation/2/context.json',
    '@id': 'https://example.org/m',
    '@type': 'sc:Manifest',
    label: 'L',
    description: [{ '@language': 'en', '@value': 'English' }, { '@language': 'fr', '@value': 'Description francaise' }],
  });
  assert.deepEqual(v2.descriptions.map((d) => d['@language']), ['en', 'fr']);
  assert.equal(v2.description, 'English Description francaise');
  const v3 = normalize({
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: 'https://example.org/m3',
    type: 'Manifest',
    label: 'L',
    summary: { en: ['A summary'] },
  });
  assert.deepEqual(Object.keys(v3.descriptions), ['en']);
});

test('getLabel and getDescription read single v2 @value objects', () => {
  assert.equal(getLabel({ label: { '@language': 'fr', '@value': 'Bonjour' } }), 'Bonjour');
  assert.equal(getDescription({ description: { '@value': 'Hello', '@language': 'en' } }), 'Hello');
});
