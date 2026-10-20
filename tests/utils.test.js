import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, parseXYWH } from '../utils.js';

test('parseXYWH reads plain and pixel-prefixed fragment selectors', () => {
  assert.deepEqual(parseXYWH('xywh=1,2,3,4'), [1, 2, 3, 4]);
  assert.deepEqual(parseXYWH('xywh=pixel:1597,1562,2200,344'), [1597, 1562, 2200, 344]);
  assert.deepEqual(parseXYWH('xywh=1.5,2,3,4'), [1.5, 2, 3, 4]);
  assert.equal(parseXYWH('xywh=percent:10,20,30,40'), null);
  assert.equal(parseXYWH(null), null);
  assert.equal(parseXYWH('nope'), null);
});

test('escapeHtml neutralizes markup', () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
  );
});
