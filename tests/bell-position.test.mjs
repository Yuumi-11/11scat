import test from 'node:test';
import assert from 'node:assert/strict';
import { placeBellPanel } from '../app/bell-position.ts';

test('bell panel follows header, flips near the bottom and stays inside narrow/zoomed viewports', () => {
  for (const viewport of [{ left:0,top:0,width:1280,height:720 }, { left:0,top:0,width:320,height:568 }, { left:30,top:180,width:280,height:300 }]) {
    for (const anchor of [
      {top:viewport.top+40,bottom:viewport.top+84,right:viewport.left+viewport.width-16},
      {top:viewport.top+viewport.height-68,bottom:viewport.top+viewport.height-24,right:viewport.left+90},
    ]) for (const height of [90,300,1200]) {
      const p=placeBellPanel(anchor,viewport,height);
      assert.ok(p.left>=viewport.left+12);
      assert.ok(p.left+p.width<=viewport.left+viewport.width-12);
      assert.ok(p.top>=viewport.top+12);
      assert.ok(p.maxHeight<=480);
      assert.ok(p.top+Math.min(height,p.maxHeight)<=viewport.top+viewport.height-12);
    }
  }
  const low=placeBellPanel({top:610,bottom:654,right:1000},{left:0,top:0,width:1280,height:720},300);
  assert.equal(low.top,302);
  const high=placeBellPanel({top:150,bottom:194,right:1100},{left:0,top:0,width:1280,height:720},300);
  assert.equal(high.top,202);
  assert.equal(high.left,768);
});
