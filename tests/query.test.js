import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQueryString, safeDecode, buildUrl } from '../query.js';

test('parseQueryString reads iiif-content with percent-encoding', () => {
  const q = parseQueryString('?iiif-content=https%3A%2F%2Fexample.org%2Fmanifest.json');
  assert.equal(q.iiifContent, 'https://example.org/manifest.json');
});

test('parseQueryString handles double-encoded URIs', () => {
  const q = parseQueryString('?iiif-content=https%253A%252F%252Fexample.org%252Fmanifest.json');
  assert.equal(q.iiifContent, 'https://example.org/manifest.json');
});

test('parseQueryString preserves escapes inside a single-encoded URI', () => {
  // oh-my-rerum encodes % so that one decode is exact: %252F must survive as %2F.
  const q = parseQueryString('?iiif-content=https://example.org/iiif/a%252Fb/manifest.json');
  assert.equal(q.iiifContent, 'https://example.org/iiif/a%2Fb/manifest.json');
});

test('parseQueryString reads manifest and canvas params', () => {
  const q = parseQueryString('?manifest=https%3A%2F%2Fexample.org%2Fm.json&canvas=2');
  assert.equal(q.manifest, 'https://example.org/m.json');
  assert.equal(q.canvas, '2');
});

test('parseQueryString returns nulls for missing params', () => {
  const q = parseQueryString('');
  assert.equal(q.iiifContent, null);
  assert.equal(q.manifest, null);
  assert.equal(q.canvas, null);
});

test('safeDecode falls back on malformed input', () => {
  assert.equal(safeDecode('100%'), '100%');
  assert.equal(safeDecode('a%20b'), 'a b');
});

test('buildUrl sets and clears params', () => {
  const url = buildUrl('https://example.org/?manifest=x', { 'iiif-content': 'https://a/b', canvas: '1', manifest: null });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('iiif-content'), 'https://a/b');
  assert.equal(parsed.searchParams.get('canvas'), '1');
  assert.equal(parsed.searchParams.get('manifest'), null);
});
