import test from 'node:test';
import assert from 'node:assert/strict';
import { createMotion } from '../src/motion.ts';

test('120 Hz presentation advances smoothly between 60 Hz physics ticks', () => {
  const current = { x: 0, y: 0, z: 0 };
  const motion = createMotion(current);
  const rendered: number[] = [];
  for (let tick = 0; tick < 4; tick++) {
    motion.capture(current);
    current.z += .1;
    rendered.push(motion.sample(current, 0).z, motion.sample(current, .5).z);
  }
  for (let i = 1; i < rendered.length; i++) {
    assert.ok(Math.abs(rendered[i] - rendered[i - 1] - .05) < 1e-9);
  }
  assert.equal(current.z, .4, 'presentation never changes authoritative physics');
});

test('reset and discontinuity snap presentation to a safe position', () => {
  const motion = createMotion({ x: 0, y: -9, z: 30 });
  const checkpoint = { x: 0, y: 1.3, z: 20 };
  assert.deepEqual(motion.sample(checkpoint, .2), checkpoint);
  const start = { x: 0, y: 0, z: 0 };
  motion.reset(start);
  assert.deepEqual(motion.sample(start, .8), start);
  motion.capture(start);
  const lifted = { x: 0, y: .6, z: 0 };
  motion.reset(lifted);
  assert.deepEqual(motion.sample(lifted, 0), lifted);
});
