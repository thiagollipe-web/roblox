import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, PAIRS, ribbonPoints, type Game, type Input } from '../src/game.ts';

const idle: Input = { x: 0, z: 0, jump: false };
const forward: Input = { x: 0, z: 1, jump: false };
function step(game: Game, frames = 1, input: Input = idle) {
  for (let i = 0; i < frames; i++) game.update(1 / 60, input);
}
function until(game: Game, predicate: () => boolean, input: Input = idle, limit = 600) {
  for (let i = 0; i < limit && !predicate(); i++) step(game, 1, input);
  assert.ok(predicate(), `Condition timed out: ${JSON.stringify(game.state)}`);
}
async function ready() {
  const game = await createGame();
  step(game, 10);
  return game;
}
function reachSecondIsland(game: Game) {
  game.act();
  until(game, () => game.state.position.z >= 18, forward);
  assert.equal(game.state.checkpoint, 1);
}
function catchEnemy(game: Game) {
  game.act();
  assert.equal(game.state.pair, 1);
  game.act();
  until(game, () => game.state.enemy === 'missed');
  game.act();
  assert.equal(game.state.enemy, 'captured');
}

test('Rapier capsule settles on the first island and normalizes diagonal movement', async t => {
  const game = await ready(); t.after(() => game.dispose());
  assert.equal(game.state.checkpoint, 0);
  assert.equal(game.state.grounded, true);
  assert.equal(game.state.pair, null);
  assert.ok(Math.abs(game.state.position.y) < .06);
  step(game, 30, { x: 1, z: 1, jump: false });
  assert.ok(Math.hypot(game.state.position.x, game.state.position.z) <= 2.45);
  assert.ok(Math.abs(Math.hypot(game.state.velocity.x, game.state.velocity.z) - 4.8) < .001);
});

test('an ordinary jump cannot bypass the first gap, and falling restores a safe support', async t => {
  const game = await ready(); t.after(() => game.dispose());
  until(game, () => game.state.position.z >= 4.5, forward);
  step(game, 1, { ...forward, jump: true });
  until(game, () => game.state.deaths > 0, forward);
  assert.equal(game.state.checkpoint, 0);
  assert.equal(game.state.pair, null);
  assert.equal(game.state.position.z, 0);
  assert.equal(game.state.grounded, true);
});

test('loose ribbon has a traversable sag; tension changes are bounded and preserve the active route', async t => {
  const game = await ready(); t.after(() => game.dispose());
  const loose = ribbonPoints(PAIRS[0], false);
  const taut = ribbonPoints(PAIRS[0], true);
  assert.deepEqual(loose[0], taut[0]);
  assert.ok(Math.abs(loose[8].y + .5) < .001);
  assert.equal(taut[8].y, .1);
  game.act();
  until(game, () => game.state.position.z >= 8, forward);
  assert.equal(game.state.onRibbon, true);
  assert.ok(game.state.position.y < -.3);
  for (let i = 0; i < 20; i++) { game.act(); step(game, 3); }
  assert.equal(game.state.pair, 0);
  assert.equal(game.state.pulses, 10);
  assert.equal(game.state.canalOpen, false);
  assert.ok(game.state.position.y < .2);
  until(game, () => game.state.position.z >= 18, forward);
  assert.equal(game.state.checkpoint, 1);
  step(game, 1, { ...idle, jump: true });
  game.act();
  assert.equal(game.state.pair, 0, 'cannot replace a ribbon while airborne');
});

test('enemy announces and cuts a loose ribbon; another free attempt captures it after a missed attack', async t => {
  const game = await ready(); t.after(() => game.dispose());
  reachSecondIsland(game);
  game.act();
  assert.equal(game.state.enemy, 'warning');
  until(game, () => game.state.pair === null);
  assert.equal(game.state.checkpoint, 1);
  catchEnemy(game);
  game.respawn();
  assert.equal(game.state.enemy, 'captured', 'latched enemy solution survives a fall');
  assert.equal(game.state.checkpoint, 1);
  assert.equal(game.state.position.z, 17);
  assert.equal(game.state.pair, null);
});

test('uncaptured enemy physically blocks the far island; capture opens the gate', async t => {
  const game = await ready(); t.after(() => game.dispose());
  reachSecondIsland(game);
  game.act(); game.act();
  step(game, 300, forward);
  assert.equal(game.state.checkpoint, 1);
  assert.ok(game.state.position.z < 29);
  until(game, () => game.state.enemy === 'missed');
  game.act();
  assert.equal(game.state.enemy, 'captured');
  until(game, () => game.state.checkpoint === 2, forward);
});

test('complete puzzle sequence launches onto the terrace, wins, and resets every objective', async t => {
  const game = await ready(); t.after(() => game.dispose());
  reachSecondIsland(game);
  catchEnemy(game);
  until(game, () => game.state.position.z >= 37, forward);
  assert.equal(game.state.checkpoint, 2);
  game.act(); game.act();
  until(game, () => !game.state.bossReady);
  game.act();
  assert.equal(game.state.canalOpen, false, 'mistimed release cannot open the canal');
  assert.ok(game.state.velocity.y <= 0, 'mistimed release cannot accumulate launch energy');
  game.act();
  until(game, () => game.state.bossReady);
  game.act();
  assert.equal(game.state.canalOpen, true);
  assert.equal(game.state.velocity.y, 12);
  step(game, 80);
  assert.equal(game.state.grounded, true);
  assert.ok(game.state.position.y > 2.4);
  assert.ok(game.state.position.z > 43);
  until(game, () => game.state.won, forward);
  game.reset();
  assert.equal(game.state.won, false);
  assert.equal(game.state.enemy, 'idle');
  assert.equal(game.state.canalOpen, false);
  assert.equal(game.state.checkpoint, 0);
  assert.equal(game.state.deaths, 0);
  assert.equal(game.state.pulses, 0);
  assert.equal(game.state.pair, null);
  assert.equal(game.actionLabel(), 'TECER');
});
