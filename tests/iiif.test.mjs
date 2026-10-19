import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectVersion, normalize, getLabel, getMetadata, getSelector, getText } from '../iiif.js';

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
