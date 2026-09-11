import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deviceFontResources, normalizeDeviceFont } from '../app/device-fonts.ts';

test('all selectable device fonts are bundled WOFF2 resources, legacy system font becomes a hosted option', async () => {
  assert.equal(normalizeDeviceFont('youyuan'),'resource-rounded');
  assert.equal(normalizeDeviceFont('sans'),'sans');
  for (const resource of Object.values(deviceFontResources).flat()) {
    assert.ok(resource.url.startsWith('/classroom/fonts/'));
    assert.equal((await readFile('public'+resource.url)).subarray(0,4).toString(),'wOF2');
  }
});

test('font failures reject readiness, a fresh face retries successfully, and two devices share downloads', async () => {
  const originalFace=globalThis.FontFace, originalDocument=globalThis.document;
  let fail=true, count=0; const registered=[];
  globalThis.document={fonts:{add:font=>registered.push(font)}};
  globalThis.FontFace=class {
    constructor(family,source,descriptors){this.family=family;this.source=source;this.descriptors=descriptors;count++;}
    async load(){if(fail&&this.family==='Device Rounded')throw new Error('offline');return this;}
  };
  try {
    const {loadDeviceFont}=await import('../app/device-fonts.ts?font-failure-test');
    await assert.rejects(loadDeviceFont('rounded'),/offline/);
    assert.ok(!registered.some(face=>face.family==='Device Rounded'));
    fail=false;
    await Promise.all([loadDeviceFont('rounded'),loadDeviceFont('rounded')]);
    assert.equal(count,5); assert.equal(registered.length,4);
    await loadDeviceFont('sans'); assert.equal(count,5);
    await Promise.all([loadDeviceFont('resource-rounded'),loadDeviceFont('resource-rounded')]);
    assert.equal(count,7);assert.equal(registered.filter(face=>face.family==='Device Han Rounded').length,2);
  } finally { globalThis.FontFace=originalFace;globalThis.document=originalDocument; }
});
