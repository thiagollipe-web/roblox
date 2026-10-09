import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, PAIRS, COLLECTIBLES, MOVEMENT, ribbonPoints, type Game, type Input } from '../src/game.ts';

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
  const game = await createGame(); step(game, 10); return game;
}
function hop(game: Game, input: Input = forward) {
  assert.equal(game.state.grounded, true, 'hop starts on a support');
  step(game, 1, { ...input, jump: true });
  assert.equal(game.state.grounded, false, 'jump leaves the support');
  until(game, () => game.state.grounded, { ...input, jump: false }, 120);
}
function reachOrchard(game: Game) {
  until(game, () => game.state.position.z >= 4.05, forward);
  hop(game); assert.ok(Math.abs(game.state.position.y - .65) < .04);
  hop(game); assert.ok(Math.abs(game.state.position.y - 1.3) < .04);
  hop(game); assert.equal(game.state.checkpoint, 1);
  until(game, () => game.state.position.z >= 21, forward); step(game, 12);
}
function reachNest(game: Game) {
  reachOrchard(game); game.act(); game.act();
  until(game, () => game.state.position.z >= 40, forward); step(game, 12);
  assert.equal(game.state.checkpoint, 2);
}
function catchEnemy(game: Game) {
  game.act(); assert.equal(game.state.pair, 1);
  game.act(); until(game, () => game.state.enemy === 'missed'); game.act();
  assert.equal(game.state.enemy, 'captured');
}
function reachFlower(game: Game) {
  reachNest(game); catchEnemy(game);
  until(game, () => game.state.position.z >= 53, forward);
  hop(game); step(game, 12);
  assert.equal(game.state.checkpoint, 3);
  assert.ok(Math.abs(game.state.position.y - 3.2) < .04);
  assert.ok(Math.abs(game.state.position.z - 57) < 1);
}
/** Drive with player inputs only, including slowing before arriving at a waypoint. */
function walkTo(game: Game, x: number, z: number) {
  for (let i = 0; i < 400; i++) {
    const dx = x - game.state.position.x, dz = z - game.state.position.z, length = Math.hypot(dx, dz);
    if (length < .08 && Math.hypot(game.state.velocity.x, game.state.velocity.z) < .5) { step(game, 5); return; }
    const speed = Math.min(1, length * 2 / MOVEMENT.speed);
    step(game, 1, { x: dx / Math.max(length, .001) * speed, z: dz / Math.max(length, .001) * speed, jump: false });
  }
  assert.fail(`Could not walk to ${x}, ${z}: ${JSON.stringify(game.state)}`);
}
function jumpToward(game: Game, x: number, z: number) {
  for (let i = 0; i < 120; i++) {
    const dx = x - game.state.position.x, dz = z - game.state.position.z, length = Math.hypot(dx, dz);
    const speed = Math.min(1, length * 5 / MOVEMENT.speed);
    step(game, 1, { x: dx / Math.max(length, .001) * speed, z: dz / Math.max(length, .001) * speed, jump: i === 0 });
    if (i > 0 && game.state.grounded) return;
  }
  assert.fail(`Jump did not land: ${JSON.stringify(game.state)}`);
}

test('capsule settles, accelerates responsively, normalizes diagonals, and brakes', async t => {
  const game = await ready(); t.after(() => game.dispose());
  assert.ok(Math.abs(game.state.position.y) < .04);
  assert.equal(game.state.grounded, true);
  step(game, 1, { x: 1, z: 1, jump: false });
  assert.ok(Math.hypot(game.state.velocity.x, game.state.velocity.z) < 1);
  step(game, 19, { x: 1, z: 1, jump: false });
  assert.ok(Math.abs(Math.hypot(game.state.velocity.x, game.state.velocity.z) - MOVEMENT.speed) < .001);
  assert.ok(Math.abs(game.state.position.x - game.state.position.z) < .01);
  step(game, 12);
  assert.equal(Math.hypot(game.state.velocity.x, game.state.velocity.z), 0);
});

test('opening gaps require jumping; three real jumps reach the first checkpoint', async t => {
  const game = await ready(); t.after(() => game.dispose());
  game.act(); assert.equal(game.state.pair, null, 'cannot skip the opening jumps with a ribbon');
  until(game, () => game.state.deaths > 0, forward);
  assert.equal(game.state.checkpoint, 0);
  assert.equal(game.state.position.z, 0);
  reachOrchard(game);
  assert.equal(game.state.deaths, 1);
  assert.ok(game.state.coins >= 3);
  assert.equal(game.actionLabel(), 'TECER');
});

test('loose ribbon is traversable, bounded tension preserves support, and airborne replacement is rejected', async t => {
  const game = await ready(); t.after(() => game.dispose()); reachOrchard(game);
  const loose = ribbonPoints(PAIRS[0], false), taut = ribbonPoints(PAIRS[0], true);
  assert.deepEqual(loose[0], taut[0]);
  assert.ok(Math.abs(loose[8].y - .8) < .001);
  assert.equal(taut[8].y, 1.4);
  game.act(); until(game, () => game.state.position.z >= 29, forward); step(game, 12);
  assert.equal(game.state.onRibbon, true);
  for (let i = 0; i < 20; i++) { game.act(); step(game, 3); }
  assert.equal(game.state.pair, 0); assert.equal(game.state.pulses, 10);
  assert.equal(game.state.canalOpen, false); assert.ok(game.state.position.y < 1.45);
  until(game, () => game.state.position.z >= 40, forward); step(game, 12);
  step(game, 1, { ...idle, jump: true }); game.act();
  assert.equal(game.state.pair, 0, 'cannot replace a ribbon while airborne');
});

test('enemy cuts loose ribbons, blocks the exit physically, and opens it only after the timed pulse', async t => {
  const game = await ready(); t.after(() => game.dispose()); reachNest(game);
  game.act(); assert.equal(game.state.enemy, 'warning');
  until(game, () => game.state.pair === null);
  assert.equal(game.state.checkpoint, 2);
  game.act(); game.act(); step(game, 180, forward);
  assert.equal(game.state.checkpoint, 2); assert.ok(game.state.position.z < 50.4);
  until(game, () => game.state.enemy === 'missed'); game.act();
  assert.equal(game.state.enemy, 'captured');
  until(game, () => game.state.checkpoint === 3, forward);
  const coins = game.state.coins;
  game.respawn();
  assert.equal(game.state.enemy, 'captured'); assert.equal(game.state.position.z, 53);
  assert.equal(game.state.coins, coins); assert.equal(game.state.pair, null);
});

test('coin collection is unique, three dimensional, preserved on falling, and cleared by restart', async t => {
  const game = await ready(); t.after(() => game.dispose());
  until(game, () => game.state.position.z >= 2, forward); step(game, 12);
  assert.equal(game.state.coins, 1); assert.equal(game.state.specials, 0);
  walkTo(game, 0, 0); walkTo(game, 0, 2);
  assert.equal(game.state.coins, 1, 'crossing the same item cannot farm it');
  until(game, () => game.state.deaths > 0, { x: 1, z: 0, jump: false });
  assert.equal(game.state.coins, 1);
  game.reset();
  assert.equal(game.state.coins, 0); assert.equal(game.state.specials, 0);
  assert.deepEqual(game.state.collected, []);
  assert.equal(COLLECTIBLES.filter(c => !c.special).length, 24);
  assert.equal(COLLECTIBLES.filter(c => c.special).length, 3);
});

test('raised orchard bonus route can be reached by jumping and its special remains optional', async t => {
  const game = await ready(); t.after(() => game.dispose()); reachOrchard(game);
  walkTo(game, -6, 19);
  assert.equal(game.state.specials, 0, 'being below or near the bonus does not collect it');
  jumpToward(game, -8.5, 19); walkTo(game, -8.5, 19);
  assert.ok(Math.abs(game.state.position.y - 2.05) < .04);
  jumpToward(game, -11.8, 22); walkTo(game, -11.8, 22);
  assert.ok(Math.abs(game.state.position.y - 2.8) < .04);
  assert.equal(game.state.specials, 1);
  assert.ok(game.state.collected.includes('bobina-pomar'));
  assert.equal(game.state.deaths, 0);
  game.respawn();
  assert.equal(game.state.position.z, 20); assert.equal(game.state.specials, 1);
});

test('nest and summit bonus routes are reachable using ordinary jumps', async t => {
  const game = await ready(); t.after(() => game.dispose()); reachNest(game);
  walkTo(game, 6, 38); jumpToward(game, 8.8, 38); walkTo(game, 8.8, 38);
  assert.ok(Math.abs(game.state.position.y - 2.1) < .04);
  jumpToward(game, 12, 41); walkTo(game, 12, 41);
  assert.equal(game.state.specials, 1); assert.ok(game.state.collected.includes('bobina-ninho'));
  game.respawn(); walkTo(game, 0, 40); catchEnemy(game);
  until(game, () => game.state.position.z >= 53, forward); hop(game); step(game, 12);
  game.act(); game.act(); until(game, () => game.state.bossReady); game.act(); step(game, 80);
  walkTo(game, -5, 67); jumpToward(game, -8.2, 67); walkTo(game, -8.2, 67);
  assert.equal(game.state.specials, 2); assert.ok(game.state.collected.includes('bobina-copa'));
  assert.equal(game.state.won, false, 'exploration does not accidentally finish the stage');
  assert.ok(Math.abs(game.state.position.y - 6.2) < .04);
});

test('complete route launches from the raised flower, wins without mandatory specials, and resets', async t => {
  const game = await ready(); t.after(() => game.dispose()); reachFlower(game);
  game.act(); game.act(); until(game, () => !game.state.bossReady); game.act();
  assert.equal(game.state.canalOpen, false); assert.ok(game.state.velocity.y <= 0);
  game.act(); until(game, () => game.state.bossReady); game.act();
  assert.equal(game.state.canalOpen, true); assert.equal(game.state.velocity.y, 12);
  step(game, 80);
  assert.equal(game.state.grounded, true); assert.ok(Math.abs(game.state.position.y - 5.3) < .04);
  assert.ok(game.state.position.z >= 65);
  until(game, () => game.state.won, forward);
  assert.equal(game.state.deaths, 0); assert.equal(game.state.specials, 0);
  assert.ok(game.state.coins >= 14);
  game.reset();
  assert.equal(game.state.won, false); assert.equal(game.state.enemy, 'idle');
  assert.equal(game.state.canalOpen, false); assert.equal(game.state.checkpoint, 0);
  assert.equal(game.state.deaths, 0); assert.equal(game.state.pulses, 0);
  assert.equal(game.state.pair, null); assert.equal(game.state.coins, 0);
  assert.equal(game.actionLabel(), 'APROXIME-SE');
});

test('a jump shortly after leaving an edge uses coyote time', async t => {
  const game = await ready(); t.after(() => game.dispose());
  until(game, () => !game.state.grounded, forward);
  step(game, 2, forward);
  const before = game.state.position.y;
  step(game, 1, { ...forward, jump: true });
  assert.ok(game.state.velocity.y > 8);
  assert.ok(game.state.position.y > before);
});

test('pressing jump just before landing buffers the next jump', async t => {
  const game = await ready(); t.after(() => game.dispose());
  until(game, () => game.state.position.z >= 4.05, forward);
  step(game, 1, { ...forward, jump: true });
  until(game, () => game.state.velocity.y < 0 && game.state.position.y < 1.15, forward);
  assert.equal(game.state.grounded, false);
  step(game, 1, { ...forward, jump: true });
  until(game, () => game.state.velocity.y > 8, forward, 12);
  assert.ok(game.state.position.y >= .65);
  assert.equal(game.state.grounded, false);
});
