import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, PAIRS, PLATFORMS, COLLECTIBLES, MOVEMENT, ribbonPoints, type Game, type Input } from '../src/game.ts';

const idle: Input = { x: 0, z: 0, jump: false };
const forward: Input = { x: 0, z: 1, jump: false };
const backward: Input = { x: 0, z: -1, jump: false };
function step(game: Game, frames = 1, input: Input = idle) {
  for (let i = 0; i < frames; i++) {
    game.update(1 / 60, input);
    assert.equal(game.state.position.x, 0, 'physics always remains on the side-view plane');
    assert.equal(game.state.velocity.x, 0);
  }
}
function until(game: Game, predicate: () => boolean, input: Input = idle, limit = 600) {
  for (let i = 0; i < limit && !predicate(); i++) step(game, 1, input);
  assert.ok(predicate(), `Condition timed out: ${JSON.stringify(game.state)}`);
}
async function ready() {
  const game = await createGame(); step(game, 10); return game;
}
function atHeight(game: Game, top: number) {
  assert.ok(Math.abs(game.state.position.y - top) < .08, `Expected surface ${top}, got ${game.state.position.y}`);
}
function hop(game: Game, input: Input = forward) {
  assert.equal(game.state.grounded, true, 'hop starts on a support');
  step(game, 1, { ...input, jump: true });
  assert.equal(game.state.grounded, false, 'jump leaves the support');
  until(game, () => game.state.grounded, { ...input, jump: false }, 120);
}
function reachOrchard(game: Game) {
  until(game, () => game.state.position.z >= 4.05, forward);
  hop(game); atHeight(game, .65);
  hop(game); atHeight(game, 1.3);
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
  atHeight(game, 3.2);
  assert.ok(Math.abs(game.state.position.z - 57) < 1);
}
function launch(game: Game) {
  game.act(); game.act(); until(game, () => game.state.bossReady); game.act();
  assert.equal(game.state.canalOpen, true); step(game, 80);
  assert.equal(game.state.grounded, true); atHeight(game, 5.3);
}
/** Drive left/right with real inputs, slowing before the waypoint. */
function walkTo(game: Game, z: number) {
  for (let i = 0; i < 400; i++) {
    const distance = z - game.state.position.z;
    if (Math.abs(distance) < .05 && Math.abs(game.state.velocity.z) < .3) { step(game, 5); return; }
    step(game, 1, { x: 0, z: Math.max(-1, Math.min(1, distance * 2 / MOVEMENT.speed)), jump: false });
  }
  assert.fail(`Could not walk to ${z}: ${JSON.stringify(game.state)}`);
}
function jumpToward(game: Game, z: number) {
  assert.equal(game.state.grounded, true);
  for (let i = 0; i < 120; i++) {
    const distance = z - game.state.position.z;
    step(game, 1, { x: 0, z: Math.max(-1, Math.min(1, distance * 5 / MOVEMENT.speed)), jump: i === 0 });
    if (i > 0 && game.state.grounded) return;
  }
  assert.fail(`Jump did not land: ${JSON.stringify(game.state)}`);
}
function orchardBonus(game: Game) {
  walkTo(game, 19); jumpToward(game, 19); atHeight(game, 2.55);
  jumpToward(game, 22); atHeight(game, 3.8); walkTo(game, 22.6);
  assert.ok(game.state.collected.includes('bobina-pomar'));
  walkTo(game, 24); until(game, () => game.state.grounded); atHeight(game, 1.3);
}
function nestBonus(game: Game) {
  walkTo(game, 36.5); jumpToward(game, 36.5); atHeight(game, 2.55);
  jumpToward(game, 39.5); atHeight(game, 3.8); walkTo(game, 40.1);
  assert.ok(game.state.collected.includes('bobina-ninho'));
  walkTo(game, 42); until(game, () => game.state.grounded); atHeight(game, 1.3);
}
function summitBonus(game: Game) {
  walkTo(game, 66.5); jumpToward(game, 67.4); atHeight(game, 6.65);
  walkTo(game, 67.4); assert.ok(game.state.collected.includes('bobina-copa'));
  walkTo(game, 65.7); until(game, () => game.state.grounded); atHeight(game, 5.3);
  assert.equal(game.state.won, false, 'the optional upper path returns before the goal');
}

test('side-view capsule ignores depth input, accelerates in either direction, clamps speed and brakes', async t => {
  const game = await ready(); t.after(() => game.dispose());
  atHeight(game, 0); assert.equal(game.state.grounded, true);
  step(game, 60, { x: 1, z: 0, jump: false });
  assert.ok(Math.abs(game.state.position.z) < .00001, 'depth-only input cannot move along the route');
  step(game, 1, { x: 1, z: 1, jump: false });
  assert.ok(game.state.velocity.z > 0 && game.state.velocity.z < 1);
  step(game, 19, { x: -1, z: 3, jump: false });
  assert.equal(game.state.velocity.z, MOVEMENT.speed);
  const ahead = game.state.position.z;
  step(game, 35, { x: 1, z: -1, jump: false });
  assert.equal(game.state.velocity.z, -MOVEMENT.speed);
  assert.ok(game.state.position.z < ahead, 'left input actually travels backward');
  step(game, 12); assert.equal(game.state.velocity.z, 0);
  hop(game, { x: -1, z: 0, jump: false }); atHeight(game, 0);
});

test('opening gaps require jumping; three real jumps reach the first checkpoint', async t => {
  const game = await ready(); t.after(() => game.dispose());
  game.act(); assert.equal(game.state.pair, null, 'cannot skip the opening jumps with a ribbon');
  until(game, () => game.state.deaths > 0, forward);
  assert.equal(game.state.checkpoint, 0); assert.equal(game.state.position.z, 0);
  reachOrchard(game);
  assert.equal(game.state.deaths, 1); assert.ok(game.state.coins >= 3);
  assert.equal(game.state.specials, 0); assert.equal(game.actionLabel(), 'TECER');
});

test('loose ribbon supports both directions; tension preserves support and airborne replacement is rejected', async t => {
  const game = await ready(); t.after(() => game.dispose()); reachOrchard(game);
  const loose = ribbonPoints(PAIRS[0], false), taut = ribbonPoints(PAIRS[0], true);
  assert.deepEqual(loose[0], taut[0]); assert.ok(Math.abs(loose[8].y - .8) < .001); assert.equal(taut[8].y, 1.4);
  game.act(); until(game, () => game.state.position.z >= 29, forward); step(game, 12);
  assert.equal(game.state.onRibbon, true);
  for (let i = 0; i < 20; i++) { game.act(); step(game, 3); }
  assert.equal(game.state.pair, 0); assert.equal(game.state.pulses, 10);
  assert.equal(game.state.canalOpen, false); assert.ok(game.state.position.y < 1.5);
  walkTo(game, 27); assert.equal(game.state.onRibbon, true);
  until(game, () => game.state.position.z >= 40, forward); step(game, 12);
  step(game, 1, { ...idle, jump: true }); game.act();
  assert.equal(game.state.pair, 0, 'cannot replace a ribbon while airborne');
});

test('small analog movements cross the raised ribbon ends without getting stuck', async t => {
  const game = await ready(); t.after(() => game.dispose()); reachOrchard(game);
  game.act(); walkTo(game, 24);
  step(game, 600, { ...forward, z: .05 });
  assert.ok(game.state.position.z > 26.5, 'slow movement enters the loose bridge from the orchard');
  assert.equal(game.state.onRibbon, true); assert.equal(game.state.deaths, 0);
  game.act(); walkTo(game, 24);
  step(game, 600, { ...forward, z: .05 });
  assert.ok(game.state.position.z > 26.5, 'the same approach works with the ribbon taut');
  assert.equal(game.state.onRibbon, true);

  game.respawn(); walkTo(game, 24.95);
  assert.equal(game.state.pair, null);
  assert.ok(game.state.position.y < 1.34, 'removing a ribbon also removes the approach under its anchor');
  game.act(); step(game, 300, { ...forward, z: .05 });
  assert.ok(game.state.position.z > 26, 'regenerating the ribbon restores its smooth approach');

  game.reset(); step(game, 10); reachNest(game); game.act(); game.act(); walkTo(game, 43);
  step(game, 600, { ...forward, z: .05 });
  assert.ok(game.state.position.z > 44.6, 'slow movement clears the island edge onto the enemy bridge');
  assert.equal(game.state.onRibbon, true); assert.equal(game.state.deaths, 0);

  game.reset(); step(game, 10); reachFlower(game); walkTo(game, 56); game.act();
  step(game, 600, { ...forward, z: .05 });
  assert.ok(game.state.position.z > 58.5, 'slow movement enters the final ribbon from its launch island');
  assert.equal(game.state.onRibbon, true); assert.equal(game.state.deaths, 0);

  game.reset(); step(game, 10); reachFlower(game); launch(game);
  step(game, 600, { ...backward, z: -.05 });
  assert.ok(game.state.position.z < 64, 'slow reverse movement clears the ribbon end on the summit');
  assert.equal(game.state.deaths, 0); assert.equal(game.state.grounded, true);
});

test('enemy cuts loose ribbons, physically blocks the exit, and opens only after the timed pulse', async t => {
  const game = await ready(); t.after(() => game.dispose()); reachNest(game);
  game.act(); assert.equal(game.state.enemy, 'warning');
  until(game, () => game.state.pair === null); assert.equal(game.state.checkpoint, 2);
  game.act(); game.act(); step(game, 180, forward);
  assert.equal(game.state.checkpoint, 2); assert.ok(game.state.position.z < 50.4);
  until(game, () => game.state.enemy === 'missed'); game.act(); assert.equal(game.state.enemy, 'captured');
  until(game, () => game.state.checkpoint === 3, forward);
  const coins = game.state.coins; game.respawn();
  assert.equal(game.state.enemy, 'captured'); assert.equal(game.state.position.z, 53);
  assert.equal(game.state.coins, coins); assert.equal(game.state.pair, null);
});

test('coins are unique, retained after a real fall, and cleared by restart', async t => {
  const game = await ready(); t.after(() => game.dispose());
  until(game, () => game.state.position.z >= 2, forward); step(game, 12);
  assert.equal(game.state.coins, 1); assert.equal(game.state.specials, 0);
  walkTo(game, 0); walkTo(game, 2); assert.equal(game.state.coins, 1, 'items cannot be farmed by reversing direction');
  until(game, () => game.state.deaths > 0, backward); assert.equal(game.state.coins, 1);
  reachOrchard(game); const checkpointCoins = game.state.coins, deaths = game.state.deaths;
  until(game, () => game.state.deaths > deaths, forward);
  assert.equal(game.state.position.z, 20); assert.equal(game.state.checkpoint, 1);
  assert.ok(game.state.coins >= checkpointCoins);
  game.reset();
  assert.equal(game.state.coins, 0); assert.equal(game.state.specials, 0); assert.deepEqual(game.state.collected, []);
});

test('one-way orchard ledges allow passing below, jumping through and landing above without trapping the return', async t => {
  const game = await ready(); t.after(() => game.dispose()); reachOrchard(game);
  walkTo(game, 24); walkTo(game, 16); atHeight(game, 1.3);
  assert.equal(game.state.specials, 0, 'walking below the reward cannot collect it');
  orchardBonus(game); assert.equal(game.state.specials, 1); assert.equal(game.state.deaths, 0);
  walkTo(game, 16); atHeight(game, 1.3);
  game.respawn(); assert.equal(game.state.position.z, 20); assert.equal(game.state.specials, 1);
});

test('nest and summit upper paths are optional, reachable by ordinary jumps and return to the lower route', async t => {
  const game = await ready(); t.after(() => game.dispose()); reachNest(game);
  nestBonus(game); assert.equal(game.state.specials, 1);
  walkTo(game, 40); catchEnemy(game);
  until(game, () => game.state.position.z >= 53, forward); hop(game); step(game, 12); launch(game);
  summitBonus(game); assert.equal(game.state.specials, 2); assert.equal(game.state.deaths, 0);
});

test('all 24 yellow collectibles and three specials are reachable in one continuous side-view run', async t => {
  const game = await ready(); t.after(() => game.dispose());
  assert.equal(COLLECTIBLES.filter(c => !c.special).length, 24); assert.equal(COLLECTIBLES.filter(c => c.special).length, 3);
  assert.ok(COLLECTIBLES.every(c => c.position.x === 0)); assert.ok(PLATFORMS.every(p => p.center.x === 0));
  reachOrchard(game); walkTo(game, 16); orchardBonus(game); walkTo(game, 23);
  game.act(); game.act(); until(game, () => game.state.position.z >= 40, forward); step(game, 12);
  nestBonus(game); walkTo(game, 39); walkTo(game, 40); catchEnemy(game);
  until(game, () => game.state.position.z >= 53, forward); hop(game); step(game, 12); launch(game);
  walkTo(game, 65.5); summitBonus(game); until(game, () => game.state.won, forward);
  assert.equal(game.state.coins, 24, `Missing: ${COLLECTIBLES.filter(c => !game.state.collected.includes(c.id)).map(c => c.id)}`);
  assert.equal(game.state.specials, 3); assert.equal(game.state.collected.length, 27); assert.equal(game.state.deaths, 0);
});

test('complete lower route rejects mistimed launch, wins without specials, and resets all mechanisms', async t => {
  const game = await ready(); t.after(() => game.dispose()); reachFlower(game);
  game.act(); game.act(); until(game, () => !game.state.bossReady); game.act();
  assert.equal(game.state.canalOpen, false); assert.ok(game.state.velocity.y <= 0);
  game.act(); until(game, () => game.state.bossReady); game.act();
  assert.equal(game.state.canalOpen, true); assert.equal(game.state.velocity.y, 12);
  step(game, 80); assert.equal(game.state.grounded, true); atHeight(game, 5.3);
  assert.ok(game.state.position.z >= 65); until(game, () => game.state.won, forward);
  assert.equal(game.state.deaths, 0); assert.equal(game.state.specials, 0); assert.ok(game.state.coins >= 14);
  game.reset();
  assert.equal(game.state.won, false); assert.equal(game.state.enemy, 'idle'); assert.equal(game.state.canalOpen, false);
  assert.equal(game.state.checkpoint, 0); assert.equal(game.state.deaths, 0); assert.equal(game.state.pulses, 0);
  assert.equal(game.state.pair, null); assert.equal(game.state.coins, 0); assert.equal(game.actionLabel(), 'APROXIME-SE');
});

test('a jump shortly after leaving an edge uses coyote time', async t => {
  const game = await ready(); t.after(() => game.dispose());
  until(game, () => !game.state.grounded, forward); step(game, 2, forward);
  const before = game.state.position.y;
  step(game, 1, { ...forward, jump: true }); assert.ok(game.state.velocity.y > 8); assert.ok(game.state.position.y > before);
});

test('pressing jump just before landing buffers the next jump', async t => {
  const game = await ready(); t.after(() => game.dispose());
  until(game, () => game.state.position.z >= 4.05, forward); step(game, 1, { ...forward, jump: true });
  until(game, () => game.state.velocity.y < 0 && game.state.position.y < 1.15, forward);
  assert.equal(game.state.grounded, false); step(game, 1, { ...forward, jump: true });
  until(game, () => game.state.velocity.y > 8, forward, 12);
  assert.ok(game.state.position.y >= .65); assert.equal(game.state.grounded, false);
});
