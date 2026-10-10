import test from 'node:test';
import assert from 'node:assert/strict';
import { createQualityController } from '../src/quality.ts';

test('automatic rendering starts conservatively and caps the pixel budget on large or high-DPI screens', () => {
  const quality = createQualityController();
  assert.equal(quality.snapshot().level, 'low');
  assert.equal(quality.pixelRatio(1280, 720, 2, false), 1);
  const ratio = quality.pixelRatio(3840, 2160, 2, false);
  assert.ok(3840 * 2160 * ratio * ratio <= 1280 * 720 + 1);
  assert.ok(ratio < 1, 'DPR=1 is not a lower bound on a large desktop');
  quality.setMode('high');
  const high = quality.pixelRatio(3840, 2160, 2, false);
  assert.ok(3840 * 2160 * high * high <= 1920 * 1080 + 1);
  assert.ok(high > ratio, 'manual detail mode retains a higher budget');
});

test('sustained slow frames can reduce resolution repeatedly after shadows are already low', () => {
  const quality = createQualityController();
  const observed: number[] = [];
  for (let i = 0; i < 240; i++) {
    if (quality.observe(50, true)) observed.push(quality.snapshot().resolutionScale);
  }
  assert.deepEqual(observed, [.85, .7, .6]);
  assert.equal(quality.snapshot().level, 'low');
  assert.equal(quality.snapshot().changes, 3);
  for (let i = 0; i < 600; i++) quality.observe(1000 / 60, true);
  assert.equal(quality.snapshot().resolutionScale, .6, 'stable frames do not cause visible quality oscillation');
});

test('stable frames, paused frames and isolated stalls do not lower quality; manual modes stay fixed', () => {
  const quality = createQualityController();
  for (let i = 0; i < 240; i++) quality.observe(1000 / 60, true);
  quality.observe(240, true);
  for (const sample of [NaN, Infinity, 0, -1, 500, 10000]) quality.observe(sample, true);
  for (let i = 0; i < 240; i++) quality.observe(100, false);
  for (let i = 0; i < 120; i++) quality.observe(1000 / 60, true);
  assert.equal(quality.snapshot().resolutionScale, 1);
  for (const mode of ['high', 'low'] as const) {
    quality.setMode(mode);
    for (let i = 0; i < 240; i++) quality.observe(50, true);
    assert.equal(quality.snapshot().resolutionScale, 1);
    assert.equal(quality.snapshot().level, mode);
  }
  quality.setMode('auto');
  assert.equal(quality.snapshot().level, 'low');
  assert.equal(quality.snapshot().frameTimeMs, 16.67);
});

test('persistently very slow frames still adapt, while a single long stall does not', () => {
  const quality = createQualityController();
  for (let i = 0; i < 180; i++) quality.observe(1000 / 60, true);
  quality.observe(2000, true);
  for (let i = 0; i < 180; i++) quality.observe(1000 / 60, true);
  assert.equal(quality.snapshot().resolutionScale, 1);
  for (let i = 0; i < 80; i++) quality.observe(300, true);
  assert.equal(quality.snapshot().resolutionScale, .6);
});
