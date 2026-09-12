import assert from 'node:assert/strict';
import test from 'node:test';
import { inboxClaimant, inboxStampLayout } from '../app/inbox-claim-stamp.ts';

test('every member card names its claimant regardless of task owner, reviewer or date', () => {
  const workflow = { id: 'claim', reviewerId: 'alice', claimantId: 'bob', status: 'working' };
  const task = { ownerId: 'alice', workflowId: 'claim' };
  for (const ownerId of ['alice', 'bob']) for (const claimantId of ['alice', 'bob']) for (const reviewerId of ['alice', 'bob']) {
    for (const dates of [{ startDate: null, dueDate: null }, { startDate: '2026-09-12', dueDate: null }, { startDate: null, dueDate: '2026-09-12' }]) {
      assert.equal(inboxClaimant({ ...task, ownerId, ...dates }, { ...workflow, claimantId, reviewerId }), claimantId);
    }
  }
  assert.equal(inboxClaimant({ ...task, ownerId: null }, workflow), null);
  assert.equal(inboxClaimant(task, { ...workflow, status: 'deleted' }), null);
  assert.equal(inboxClaimant(task, undefined), null);
  assert.equal(inboxClaimant({ ...task, workflowId: undefined }, workflow), null);
  assert.equal(inboxClaimant({ ...task, workflowId: 'unrelated' }, workflow), null);
  assert.equal(inboxClaimant(task, { ...workflow, claimantId: '' }), null);
  for (const status of ['creating', 'working', 'submitted', 'rejected', 'approving', 'done']) {
    assert.equal(inboxClaimant(task, { ...workflow, status }), 'bob');
  }
});

test('stamp scale preserves aspect ratio and horizontal clearance, with slight vertical clipping', () => {
  const angle = Math.PI / 30;
  for (const [width, height, availableWidth, cardHeight] of [[130, 49, 130, 40], [200, 49, 130, 40], [400, 49, 90, 40], [112, 39, 70, 36]]) {
    const { scale, centerX } = inboxStampLayout(width, height, availableWidth, cardHeight);
    const renderedWidth = (width * Math.cos(angle) + height * Math.sin(angle)) * scale;
    const renderedHeight = (height * Math.cos(angle) + width * Math.sin(angle)) * scale;
    assert.ok(scale > 0 && scale <= 0.85, 'only shrink the existing stamp');
    assert.ok(renderedWidth <= availableWidth + 1e-8, 'never enter checkbox area or crop the sides');
    assert.ok(Math.abs(centerX + renderedWidth / 2 - availableWidth) < 1e-8, 'short and long names share the same right edge');
    assert.ok(centerX - renderedWidth / 2 >= -1e-8, 'the left edge remains inside the available area');
    assert.ok(renderedHeight <= cardHeight + 6 + 1e-8, 'crop at most three pixels at each vertical edge');
    assert.ok(Math.abs((width * scale) / (height * scale) - width / height) < 1e-8);
  }
  const { scale } = inboxStampLayout(130, 49, 130, 40);
  assert.ok(Math.abs((49 * Math.cos(angle) + 130 * Math.sin(angle)) * scale - 46) < 1e-8);
  for (const dimensions of [[0, 49, 130, 40], [130, 0, 130, 40], [130, 49, 0, 40], [130, 49, 130, 0]]) {
    assert.deepEqual(inboxStampLayout(...dimensions), { scale: 0, centerX: 0 });
  }
});
