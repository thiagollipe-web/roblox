import RAPIER from '@dimforge/rapier3d-compat';

export type Vec3 = { x: number; y: number; z: number };
export type Platform = { id: string; center: Vec3; size: Vec3; bonus?: boolean };
export type Pair = { id: number; a: Vec3; b: Vec3; label: string };
export type Input = { x: number; z: number; jump: boolean };
export type Collectible = { id: string; position: Vec3; special: boolean };

const platform = (id: string, x: number, z: number, top: number, width: number, depth: number, bonus = false): Platform => ({
  id, center: { x, y: top - .8, z }, size: { x: width, y: 1.6, z: depth }, bonus,
});

/** The small gaps at the beginning require real jumps; ribbons connect the longer gaps. */
export const PLATFORMS: Platform[] = [
  platform('inicio', 0, 0, 0, 12, 10),
  platform('salto-1', -1.3, 7.8, .65, 5, 3),
  platform('salto-2', 1.1, 12, 1.3, 5, 3),
  platform('pomar', 0, 20, 1.3, 14, 11),
  platform('tesourisco', 0, 39, 1.3, 14, 11),
  platform('jardineira', 0, 53, 2.3, 10, 5),
  platform('flor', 0, 57, 3.2, 6, 3),
  platform('copa', 0, 68, 5.3, 12, 10),
  platform('bonus-pomar-1', -8.5, 19, 2.05, 3.2, 3.2, true),
  platform('bonus-pomar-2', -11.8, 22, 2.8, 3.2, 3.2, true),
  platform('bonus-ninho-1', 8.8, 38, 2.1, 3.2, 3.2, true),
  platform('bonus-ninho-2', 12, 41, 2.9, 3.2, 3.2, true),
  platform('bonus-copa', -8.2, 67, 6.2, 3.5, 3.5, true),
];

export const PAIRS: Pair[] = [
  { id: 0, a: { x: 0, y: 1.4, z: 25 }, b: { x: 0, y: 1.4, z: 33.8 }, label: 'A ponte do pomar' },
  { id: 1, a: { x: 0, y: 1.4, z: 44 }, b: { x: 0, y: 2.4, z: 51 }, label: 'O ninho do Tesourisco' },
  { id: 2, a: { x: 0, y: 3.3, z: 57 }, b: { x: 0, y: 5.4, z: 65 }, label: 'A flor catapulta' },
];

/** All positions use the top of the associated ground, including gate bases. */
export const LANDMARKS = {
  enemy: { x: 0, y: 1.3, z: 43 },
  enemyGate: { x: 0, y: 2.3, z: 50.8 },
  bossGate: { x: 0, y: 5.3, z: 62.85 },
  launch: { x: 0, y: 3.2, z: 57 },
  goal: { x: 0, y: 5.3, z: 69 },
  boss: { x: 0, y: 5.3, z: 73 },
};
export const GATE_WIDTHS = { enemy: 10.4, boss: 12.4 };
export const MOVEMENT = { speed: 6.2, jump: 8.5, gravity: 20 };

const coinPositions: number[][] = [
  [0, .85, 1.6], [-.4, .85, 3.6], [-1.3, 1.5, 7.8], [1.1, 2.15, 12],
  [0, 2.15, 16], [0, 2.15, 19], [0, 2.15, 22], [-4.7, 2.15, 18], [-8.5, 2.9, 19],
  [0, 2.05, 27], [0, 1.9, 30], [0, 2.05, 33],
  [0, 2.15, 36], [0, 2.15, 39], [0, 2.15, 42], [4.7, 2.15, 38], [8.8, 2.95, 38],
  [0, 2.35, 46], [0, 2.8, 49], [0, 3.15, 53], [0, 4.05, 57],
  [0, 6.15, 65], [0, 6.15, 67], [-4.4, 6.15, 67],
];
export const COLLECTIBLES: Collectible[] = [
  ...coinPositions.map(([x, y, z], i) => ({ id: `fio-${i + 1}`, position: { x, y, z }, special: false })),
  { id: 'bobina-pomar', position: { x: -11.8, y: 3.65, z: 22 }, special: true },
  { id: 'bobina-ninho', position: { x: 12, y: 3.75, z: 41 }, special: true },
  { id: 'bobina-copa', position: { x: -8.2, y: 7.05, z: 67 }, special: true },
];

/** Decorative ribbon vertices share the same centerline as the independent collision strips. */
export function ribbonPoints(pair: Pair, taut: boolean): Vec3[] {
  return Array.from({ length: 17 }, (_, i) => {
    const t = i / 16;
    return {
      x: pair.a.x + (pair.b.x - pair.a.x) * t,
      y: pair.a.y + (pair.b.y - pair.a.y) * t - (taut ? 0 : .6 * Math.sin(Math.PI * t)),
      z: pair.a.z + (pair.b.z - pair.a.z) * t,
    };
  });
}

export interface GameState {
  /** Position is the character's feet. Checkpoints: start, orchard, nest, launch approach. */
  position: Vec3;
  velocity: Vec3;
  grounded: boolean;
  onRibbon: boolean;
  pair: number | null;
  taut: boolean;
  checkpoint: number;
  enemy: 'idle' | 'warning' | 'missed' | 'captured';
  enemyTimer: number;
  canalOpen: boolean;
  bossReady: boolean;
  won: boolean;
  deaths: number;
  pulses: number;
  collected: string[];
  coins: number;
  specials: number;
  message: string;
}
export interface Game {
  state: GameState;
  update(dt: number, input: Input): void;
  act(): void;
  reset(): void;
  respawn(): void;
  dispose(): void;
  actionLabel(): string;
}

let initialization: Promise<void> | undefined;
const RADIUS = .28, HALF_HEIGHT = .42, FOOT_OFFSET = RADIUS + HALF_HEIGHT;
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
const CHECKPOINTS: Vec3[] = [
  { x: 0, y: 0, z: 0 }, { x: 0, y: 1.3, z: 20 },
  { x: 0, y: 1.3, z: 39 }, { x: 0, y: 2.3, z: 53 },
];

export async function createGame(): Promise<Game> {
  initialization ??= RAPIER.init();
  await initialization;
  const world = new RAPIER.World({ x: 0, y: -MOVEMENT.gravity, z: 0 });
  world.timestep = 1 / 60;
  const controller = world.createCharacterController(.02);
  controller.enableAutostep(.22, .15, false);
  controller.enableSnapToGround(.18);
  controller.setMaxSlopeClimbAngle(Math.PI / 3);
  controller.setMinSlopeSlideAngle(Math.PI / 3);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, FOOT_OFFSET + .04, 0));
  const capsule = world.createCollider(RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS).setFriction(0), body);
  for (const { center: c, size: s } of PLATFORMS) {
    world.createCollider(RAPIER.ColliderDesc.cuboid(s.x / 2, s.y / 2, s.z / 2).setTranslation(c.x, c.y, c.z));
  }
  let ribbonColliders: RAPIER.Collider[] = [];
  let enemyGate: RAPIER.Collider | null = null, bossGate: RAPIER.Collider | null = null;
  let disposed = false, elapsed = 0, launchTime = 0, coyote = 0, jumpBuffer = 0, previousJump = false;
  const displacement = { x: 0, y: 0, z: 0 }, nextTranslation = { x: 0, y: 0, z: 0 };
  const collected = new Set<string>();
  const state: GameState = {
    position: { x: 0, y: .04, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
    grounded: true, onRibbon: false, pair: null, taut: false, checkpoint: 0,
    enemy: 'idle', enemyTimer: 0, canalOpen: false, bossReady: false,
    won: false, deaths: 0, pulses: 0, collected: [], coins: 0, specials: 0,
    message: 'Corra, salte pelas duas ilhotas e siga os fios dourados até o pomar!',
  };

  function setFeet(x: number, y: number, z: number) {
    state.position.x = x; state.position.y = y; state.position.z = z;
    nextTranslation.x = x; nextTranslation.y = y + FOOT_OFFSET; nextTranslation.z = z;
    body.setTranslation(nextTranslation, true);
    body.setNextKinematicTranslation(nextTranslation);
  }
  function clearRibbon() {
    for (const collider of ribbonColliders) world.removeCollider(collider, false);
    ribbonColliders = [];
  }
  function ribbonHeight(pair: Pair, z: number, taut: boolean) {
    const t = clamp((z - pair.a.z) / (pair.b.z - pair.a.z), 0, 1);
    return pair.a.y + (pair.b.y - pair.a.y) * t - (taut ? 0 : .6 * Math.sin(Math.PI * t));
  }
  function rebuildRibbon() {
    const lift = state.onRibbon && state.grounded && state.pair !== null;
    clearRibbon();
    if (state.pair === null) return;
    const pair = PAIRS[state.pair], points = ribbonPoints(pair, state.taut);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const dz = b.z - a.z, dy = b.y - a.y, angle = -Math.atan2(dy, dz);
      ribbonColliders.push(world.createCollider(RAPIER.ColliderDesc.cuboid(1.15, .08, Math.hypot(dz, dy) / 2 + .015)
        .setTranslation((a.x + b.x) / 2, (a.y + b.y) / 2 - .08, (a.z + b.z) / 2)
        .setRotation({ x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) })));
    }
    if (lift) setFeet(state.position.x, ribbonHeight(pair, state.position.z, state.taut) + .035, state.position.z);
  }
  function makeGates() {
    if (enemyGate) world.removeCollider(enemyGate, false);
    if (bossGate) world.removeCollider(bossGate, false);
    const e = LANDMARKS.enemyGate, b = LANDMARKS.bossGate;
    enemyGate = state.enemy === 'captured' ? null : world.createCollider(
      RAPIER.ColliderDesc.cuboid(GATE_WIDTHS.enemy / 2, 2, .16).setTranslation(e.x, e.y + 2, e.z));
    bossGate = state.canalOpen ? null : world.createCollider(
      RAPIER.ColliderDesc.cuboid(GATE_WIDTHS.boss / 2, 2, .16).setTranslation(b.x, b.y + 2, b.z));
  }
  function support(): Platform | undefined {
    if (!state.grounded) return;
    const p = state.position;
    return PLATFORMS.find(({ center: c, size: s }) =>
      Math.abs(p.x - c.x) < s.x / 2 + .05 && Math.abs(p.z - c.z) < s.z / 2 + .05 &&
      Math.abs(p.y - c.y - s.y / 2) < .23);
  }
  function currentCandidate() {
    if (state.onRibbon && state.pair !== null) return state.pair;
    const z = state.position.z;
    return z >= 50.5 ? 2 : z >= 33.5 ? 1 : 0;
  }
  function canCreate(candidate: number) {
    const a = PAIRS[candidate].a;
    return !!support() && Math.hypot(state.position.x - a.x, state.position.z - a.z) <= 5.2;
  }
  function actionLabel() {
    if (state.won) return 'JARDIM RESTAURADO';
    const candidate = currentCandidate();
    if (state.pair !== candidate) return canCreate(candidate) ? 'TECER' : 'APROXIME-SE';
    if (!state.grounded && !state.onRibbon) return 'POUSE PRIMEIRO';
    return state.taut ? 'LIBERAR' : 'TENSIONAR';
  }
  function act() {
    if (disposed || state.won) return;
    const candidate = currentCandidate();
    if (state.pair !== candidate) {
      if (!canCreate(candidate)) {
        state.message = 'Chegue perto dos anéis, sobre um apoio, para tecer a próxima ponte.';
        return;
      }
      state.pair = candidate; state.taut = false;
      rebuildRibbon();
      if (candidate === 1 && state.enemy !== 'captured') {
        state.enemy = 'warning'; state.enemyTimer = 1.25;
        state.message = 'Tesourisco à vista! TENSIONE e, quando ele errar o bote, LIBERE.';
      } else if (candidate === 2) {
        state.message = 'Salte até a flor dourada. TENSIONE e LIBERE quando ela brilhar!';
      } else {
        state.message = 'Ponte pronta! Atravesse; você também pode TENSIONAR para deixá-la reta.';
      }
      return;
    }
    if (!state.grounded && !state.onRibbon) {
      state.message = 'Pouse antes de trabalhar a costura.';
      return;
    }
    if (!state.taut) {
      state.taut = true;
      rebuildRibbon();
      state.message = candidate === 1 && state.enemy !== 'captured'
        ? 'Ele vai errar! Prepare-se para LIBERAR.'
        : candidate === 2 ? 'Fique no centro da flor. LIBERE quando os pés brilharem!'
          : 'Fita esticada. Hora de correr até o próximo jardim!';
      return;
    }
    state.taut = false; state.pulses++;
    rebuildRibbon();
    if (candidate === 1 && state.enemy === 'missed') {
      state.enemy = 'captured'; state.enemyTimer = 0;
      makeGates();
      state.message = 'Pegou! O Tesourisco abriu a passagem. Corra até a flor catapulta!';
    } else if (candidate === 2) {
      const atPad = support()?.id === 'flor' && Math.abs(state.position.x) <= 1.6 && Math.abs(state.position.z - LANDMARKS.launch.z) <= 1;
      if (state.bossReady && atPad) {
        state.canalOpen = true; makeGates(); launchTime = 1.08;
        state.grounded = false; state.onRibbon = false;
        state.velocity.x = clamp(-state.position.x / .99, -3, 3);
        state.velocity.z = clamp((65.5 - state.position.z) / .99, 7.3, 10);
        state.velocity.y = 12;
        state.message = 'Uhuu! Voe até o terraço e encontre a grande flor azul!';
      } else {
        state.message = !atPad ? 'Salte para o centro da flor dourada antes de se lançar.'
          : 'Mais uma vez! TENSIONE e espere a flor brilhar para LIBERAR.';
      }
    } else if (candidate === 1 && state.enemy !== 'captured') {
      state.message = 'TENSIONE e espere o bote falhar. Então LIBERE para capturar!';
    } else {
      state.message = 'A fita voltou a ceder. Pode tentar quantas vezes quiser!';
    }
  }
  function respawn() {
    if (disposed || state.won) return;
    state.deaths++;
    clearRibbon();
    state.pair = null; state.taut = false; state.onRibbon = false; state.grounded = true;
    state.velocity.x = 0; state.velocity.y = 0; state.velocity.z = 0;
    if (state.enemy !== 'captured') { state.enemy = 'idle'; state.enemyTimer = 0; }
    launchTime = 0; coyote = 0; jumpBuffer = 0; previousJump = false;
    const p = CHECKPOINTS[state.checkpoint];
    setFeet(p.x, p.y + .04, p.z);
    state.message = 'Vamos de novo! Seus fios coletados e mecanismos estão salvos.';
  }
  function reset() {
    if (disposed) return;
    state.won = false; state.checkpoint = 0;
    state.enemy = 'idle'; state.enemyTimer = 0; state.canalOpen = false;
    state.bossReady = false; state.pulses = 0; state.coins = 0; state.specials = 0;
    state.collected.length = 0; collected.clear(); elapsed = 0;
    respawn(); state.deaths = 0; makeGates();
    state.message = 'Corra, salte pelas duas ilhotas e siga os fios dourados até o pomar!';
  }
  function update(dt: number, input: Input) {
    if (disposed || state.won) return;
    dt = clamp(dt, 0, 1 / 30);
    if (!dt) return;
    elapsed += dt;
    state.bossReady = elapsed % 3.6 >= 1.15 && elapsed % 3.6 <= 3.25;
    if (state.pair === 1 && state.enemy !== 'captured') {
      state.enemyTimer -= dt;
      if (state.enemy === 'idle' && state.enemyTimer <= 0) {
        state.enemy = 'warning'; state.enemyTimer = 1.25;
        state.message = 'O Tesourisco prepara o bote! TENSIONE a fita.';
      } else if (state.enemy === 'warning' && state.enemyTimer <= 0) {
        if (state.taut) {
          state.enemy = 'missed'; state.enemyTimer = 2.8;
          state.message = 'Ele errou! LIBERE agora!';
        } else {
          state.enemy = 'idle'; state.enemyTimer = 0;
          state.pair = null; state.taut = false; state.onRibbon = false; clearRibbon();
          state.message = 'Cortou! Volte ao apoio, TEÇA outra fita e TENSIONE.';
        }
      } else if (state.enemy === 'missed' && state.enemyTimer <= 0) {
        state.enemy = 'idle'; state.enemyTimer = .6;
        state.message = 'Ele voltou. Deixe a fita TENSA e tente no próximo bote.';
      }
    }
    if (input.jump && !previousJump) jumpBuffer = .14;
    previousJump = input.jump;
    jumpBuffer = Math.max(0, jumpBuffer - dt);
    coyote = state.grounded ? .11 : Math.max(0, coyote - dt);
    if (launchTime > 0) {
      launchTime -= dt;
    } else {
      const magnitude = Math.hypot(input.x, input.z), scale = magnitude > 1 ? 1 / magnitude : 1;
      const dx = input.x * scale * MOVEMENT.speed - state.velocity.x;
      const dz = input.z * scale * MOVEMENT.speed - state.velocity.z;
      const delta = Math.hypot(dx, dz), acceleration = state.grounded ? 48 : 26;
      const factor = delta > 0 ? Math.min(1, acceleration * dt / delta) : 0;
      state.velocity.x += dx * factor; state.velocity.z += dz * factor;
    }
    if (jumpBuffer > 0 && coyote > 0 && launchTime <= 0) {
      state.velocity.y = MOVEMENT.jump; state.grounded = false; jumpBuffer = 0; coyote = 0;
    } else if (state.grounded && state.velocity.y <= 0) {
      state.velocity.y = -.15;
    }
    state.velocity.y = Math.max(-25, state.velocity.y - MOVEMENT.gravity * dt);
    displacement.x = state.velocity.x * dt; displacement.y = state.velocity.y * dt; displacement.z = state.velocity.z * dt;
    controller.computeColliderMovement(capsule, displacement);
    const movement = controller.computedMovement(), translation = body.translation();
    nextTranslation.x = translation.x + movement.x; nextTranslation.y = translation.y + movement.y; nextTranslation.z = translation.z + movement.z;
    body.setNextKinematicTranslation(nextTranslation); world.timestep = dt; world.step();
    const actual = body.translation();
    state.position.x = actual.x; state.position.y = actual.y - FOOT_OFFSET; state.position.z = actual.z;
    state.grounded = controller.computedGrounded() && state.velocity.y <= 0;
    if (state.grounded) { state.velocity.y = 0; launchTime = 0; }
    const island = support();
    state.onRibbon = false;
    if (state.grounded && !island && state.pair !== null) {
      const pair = PAIRS[state.pair];
      state.onRibbon = Math.abs(state.position.x) < 1.35 && state.position.z >= pair.a.z && state.position.z <= pair.b.z &&
        Math.abs(state.position.y - ribbonHeight(pair, state.position.z, state.taut)) < .25;
    }
    const reached = island?.id === 'pomar' ? 1 : island?.id === 'tesourisco' ? 2 : island?.id === 'jardineira' || island?.id === 'flor' ? 3 : 0;
    if (reached > state.checkpoint) {
      state.checkpoint = reached;
      state.message = reached === 1 ? 'Pomar salvo! Explore as ilhas laterais ou siga até os anéis da ponte.'
        : reached === 2 ? 'Novo apoio! Um Tesourisco vigia os próximos anéis.'
          : 'Último apoio salvo! Salte até a flor dourada para preparar seu voo.';
    }
    for (const item of COLLECTIBLES) {
      if (collected.has(item.id)) continue;
      const p = item.position;
      if (Math.hypot(p.x - state.position.x, p.z - state.position.z) < .72 && Math.abs(p.y - state.position.y - .75) < .86) {
        collected.add(item.id); state.collected.push(item.id);
        if (item.special) {
          state.specials++;
          state.message = `Bobina azul! Você encontrou ${state.specials} de 3 tesouros escondidos.`;
        } else state.coins++;
      }
    }
    if (island?.id === 'copa' && Math.hypot(state.position.x - LANDMARKS.goal.x, state.position.z - LANDMARKS.goal.z) < 1.35 && state.canalOpen && state.enemy === 'captured') {
      state.won = true;
      state.velocity.x = 0; state.velocity.y = 0; state.velocity.z = 0;
      state.message = 'Jardim restaurado! A aventura ganhou novas cores!';
    }
    if (state.position.y < -8 || Math.abs(state.position.x) > 28 || state.position.z > 86 || state.position.z < -18) respawn();
  }
  makeGates(); world.step();
  return { state, update, act, reset, respawn, actionLabel, dispose() { if (!disposed) { disposed = true; world.free(); } } };
}
