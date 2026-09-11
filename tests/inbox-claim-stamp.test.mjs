import assert from 'node:assert/strict';
import test from 'node:test';
import { inboxClaimant, inboxStampScale } from '../app/inbox-claim-stamp.ts';

test('inbox stamp names only the other claimant on the current owner card', () => {
  const workflow = { id: 'claim', reviewerId: 'alice', claimantId: 'bob', status: 'working' };
  const task = { ownerId: 'alice', workflowId: 'claim' };
  assert.equal(inboxClaimant(task, workflow, 'alice'), 'bob');
  assert.equal(inboxClaimant(task, workflow, 'bob'), null);
  assert.equal(inboxClaimant({ ...task, ownerId: null }, workflow, 'alice'), null);
  assert.equal(inboxClaimant({ ...task, ownerId: 'bob' }, workflow, 'bob'), null);
  assert.equal(inboxClaimant(task, { ...workflow, claimantId: 'alice' }, 'alice'), null);
  assert.equal(inboxClaimant(task, { ...workflow, status: 'deleted' }, 'alice'), null);
  assert.equal(inboxClaimant(task, undefined, 'alice'), null);
  assert.equal(inboxClaimant({ ...task, workflowId: 'unrelated' }, workflow, 'alice'), null);
  for (const status of ['working', 'submitted', 'rejected', 'approving']) {
    assert.equal(inboxClaimant(task, { ...workflow, status }, 'alice'), 'bob');
  }
});

test('stamp scale preserves aspect ratio and horizontal clearance, with slight vertical clipping', () => {
  const angle = Math.PI / 30;
  for (const [width, height, availableWidth, cardHeight] of [[130, 49, 130, 40], [200, 49, 130, 40], [400, 49, 90, 40], [112, 39, 70, 36]]) {
    const scale = inboxStampScale(width, height, availableWidth, cardHeight);
    const renderedWidth = (width * Math.cos(angle) + height * Math.sin(angle)) * scale;
    const renderedHeight = (height * Math.cos(angle) + width * Math.sin(angle)) * scale;
    assert.ok(scale > 0 && scale <= 0.85, 'only shrink the existing stamp');
    assert.ok(renderedWidth <= availableWidth + 1e-8, 'never enter checkbox area or crop the sides');
    assert.ok(renderedHeight <= cardHeight + 6 + 1e-8, 'crop at most three pixels at each vertical edge');
    assert.ok(Math.abs((width * scale) / (height * scale) - width / height) < 1e-8);
  }
  const scale = inboxStampScale(130, 49, 130, 40);
  assert.ok(Math.abs((49 * Math.cos(angle) + 130 * Math.sin(angle)) * scale - 46) < 1e-8);
  assert.equal(inboxStampScale(0, 49, 130, 40), 0);
});
