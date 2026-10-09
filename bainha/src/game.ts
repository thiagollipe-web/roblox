import RAPIER from '@dimforge/rapier3d-compat';

export type Vec3 = { x: number; y: number; z: number };
export type Platform = { id: string; center: Vec3; size: Vec3 };
export type Pair = { id: number; a: Vec3; b: Vec3; label: string };
export type Input = { x: number; z: number; jump: boolean };

export const PLATFORMS: Platform[] = [
  { id: 'inicio', center: { x: 0, y: -.75, z: 0 }, size: { x: 8, y: 1.5, z: 10 } },
  { id: 'tesourisco', center: { x: 0, y: -.75, z: 17 }, size: { x: 8, y: 1.5, z: 10 } },
  { id: 'jardineira', center: { x: 0, y: -.75, z: 34 }, size: { x: 8, y: 1.5, z: 10 } },
  { id: 'copa', center: { x: 0, y: 1.75, z: 46 }, size: { x: 8, y: 1.5, z: 8 } },
];

export const PAIRS: Pair[] = [
  { id: 0, a: { x: 0, y: .1, z: 4.5 }, b: { x: 0, y: .1, z: 12.5 }, label: 'Primeira costura' },
  { id: 1, a: { x: 0, y: .1, z: 21.5 }, b: { x: 0, y: .1, z: 29.5 }, label: 'Ninho do Tesourisco' },
  { id: 2, a: { x: 0, y: .1, z: 37.5 }, b: { x: 0, y: 2.6, z: 43 }, label: 'Raiz da Jardineira' },
];

/** Ribbon surface centerline. Visual cloth is deliberately separate from collision. */
export function ribbonPoints(pair: Pair, taut: boolean): Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    points.push({
      x: pair.a.x + (pair.b.x - pair.a.x) * t,
      y: pair.a.y + (pair.b.y - pair.a.y) * t - (taut ? 0 : .6 * Math.sin(Math.PI * t)),
      z: pair.a.z + (pair.b.z - pair.a.z) * t,
    });
  }
  return points;
}

export interface GameState {
  /** Position denotes the character's feet, not the capsule's center. */
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
const RADIUS = .28;
const HALF_HEIGHT = .42;
const FOOT_OFFSET = RADIUS + HALF_HEIGHT;
const SPEED = 4.8;
const GRAVITY = 20;
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));

export async function createGame(): Promise<Game> {
  initialization ??= RAPIER.init();
  await initialization;

  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = 1 / 60;
  const controller = world.createCharacterController(.02);
  controller.enableAutostep(.25, .15, false);
  controller.enableSnapToGround(.18);
  controller.setMaxSlopeClimbAngle(Math.PI / 3);
  controller.setMinSlopeSlideAngle(Math.PI / 3);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, FOOT_OFFSET + .04, 0));
  const capsule = world.createCollider(RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS).setFriction(0), body);
  for (const platform of PLATFORMS) {
    world.createCollider(RAPIER.ColliderDesc.cuboid(platform.size.x / 2, platform.size.y / 2, platform.size.z / 2)
      .setTranslation(platform.center.x, platform.center.y, platform.center.z));
  }

  let ribbonColliders: RAPIER.Collider[] = [];
  let enemyGate: RAPIER.Collider | null = null;
  let bossGate: RAPIER.Collider | null = null;
  let disposed = false;
  let elapsed = 0;
  let launchTime = 0;
  let coyote = 0;
  let jumpBuffer = 0;
  let previousJump = false;
  const displacement = { x: 0, y: 0, z: 0 };
  const nextTranslation = { x: 0, y: 0, z: 0 };
  const state: GameState = {
    position: { x: 0, y: .04, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
    grounded: true, onRibbon: false, pair: null, taut: false, checkpoint: 0,
    enemy: 'idle', enemyTimer: 0, canalOpen: false, bossReady: false,
    won: false, deaths: 0, pulses: 0,
    message: 'Aproxime-se dos anéis e TEÇA uma passagem sobre o vazio.',
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
    const pair = PAIRS[state.pair];
    const points = ribbonPoints(pair, state.taut);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]; const b = points[i + 1];
      const dz = b.z - a.z; const dy = b.y - a.y;
      const angle = -Math.atan2(dy, dz);
      const desc = RAPIER.ColliderDesc.cuboid(.9, .08, Math.hypot(dz, dy) / 2 + .015)
        .setTranslation((a.x + b.x) / 2, (a.y + b.y) / 2 - .08, (a.z + b.z) / 2)
        .setRotation({ x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) });
      ribbonColliders.push(world.createCollider(desc));
    }
    if (lift) setFeet(state.position.x, ribbonHeight(pair, state.position.z, state.taut) + .035, state.position.z);
  }

  function makeGates() {
    if (enemyGate) world.removeCollider(enemyGate, false);
    if (bossGate) world.removeCollider(bossGate, false);
    enemyGate = state.enemy === 'captured' ? null : world.createCollider(
      RAPIER.ColliderDesc.cuboid(4.3, 2, .16).setTranslation(0, 1.5, 29.15));
    bossGate = state.canalOpen ? null : world.createCollider(
      RAPIER.ColliderDesc.cuboid(4.3, 3, .16).setTranslation(0, 3, 41.9));
  }

  function independentPlatform(): number {
    if (!state.grounded) return -1;
    const p = state.position;
    for (let i = 0; i < PLATFORMS.length; i++) {
      const island = PLATFORMS[i];
      const top = island.center.y + island.size.y / 2;
      if (Math.abs(p.x - island.center.x) < island.size.x / 2 - .08 &&
          Math.abs(p.z - island.center.z) < island.size.z / 2 - .08 &&
          Math.abs(p.y - top) < .22) return i;
    }
    return -1;
  }

  function currentCandidate() {
    return state.onRibbon && state.pair !== null ? state.pair : Math.min(2, state.checkpoint);
  }

  function canCreate(candidate: number) {
    return independentPlatform() >= 0 && Math.hypot(state.position.x - PAIRS[candidate].a.x,
      state.position.z - PAIRS[candidate].a.z) <= 5.1;
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
        state.message = 'Para criar outra fita, pouse na ilha e aproxime-se do próximo anel.';
        return;
      }
      state.pair = candidate;
      state.taut = false;
      rebuildRibbon();
      if (candidate === 1 && state.enemy !== 'captured') {
        state.enemy = 'warning'; state.enemyTimer = 2.4;
        state.message = 'O Tesourisco vai cortar! TENSIONE, espere o bote e LIBERE quando ele errar.';
      } else if (candidate === 2) {
        state.message = 'Na flor dourada, TENSIONE a raiz. LIBERE quando os pés da Jardineira brilharem.';
      } else {
        state.message = 'Passagem tecida. Atravesse pelo centro; tensionar deixa a fita reta.';
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
        ? 'Fita erguida. Espere o Tesourisco errar o bote; então LIBERE.'
        : candidate === 2 ? 'Raiz carregada. Fique na flor e espere a janela dourada para LIBERAR.'
          : 'Fita tensa: um caminho reto. Atravesse para encontrar o próximo jardim.';
      return;
    }

    state.taut = false;
    state.pulses++;
    rebuildRibbon();
    if (candidate === 1 && state.enemy === 'missed') {
      state.enemy = 'captured'; state.enemyTimer = 0;
      makeGates();
      state.message = 'Tesourisco capturado! Seu peso abriu a passagem. Siga para a Jardineira.';
    } else if (candidate === 2) {
      const atPad = independentPlatform() === 2 && Math.abs(state.position.x) <= 2 && state.position.z >= 35 && state.position.z <= 39;
      if (state.bossReady && atPad) {
        state.canalOpen = true;
        makeGates();
        launchTime = 1.05;
        state.grounded = false; state.onRibbon = false;
        state.velocity.x = clamp(-state.position.x / .94, -3, 3);
        state.velocity.z = clamp((44.8 - state.position.z) / .94, 6, 10.8);
        state.velocity.y = 12;
        state.message = 'Canal alinhado! A raiz lança você até a copa. Alcance a flor no centro.';
      } else {
        state.message = !atPad ? 'Volte à flor dourada da ilha para lançar com segurança.'
          : 'Os pés ainda estão se movendo. TENSIONE de novo e espere a janela dourada.';
      }
    } else if (candidate === 1 && state.enemy !== 'captured') {
      state.message = 'O impulso precisa pegar o Tesourisco após o bote. TENSIONE e espere ele errar.';
    } else {
      state.message = 'Tensão liberada. Você pode tecer e tentar de novo sem gastar recursos.';
    }
  }

  function respawn() {
    if (disposed || state.won) return;
    state.deaths++;
    clearRibbon();
    state.pair = null; state.taut = false; state.onRibbon = false;
    state.grounded = true;
    state.velocity.x = 0; state.velocity.y = 0; state.velocity.z = 0;
    if (state.enemy !== 'captured') { state.enemy = 'idle'; state.enemyTimer = 0; }
    launchTime = 0; coyote = 0; jumpBuffer = 0; previousJump = false;
    setFeet(0, .04, [0, 17, 34][state.checkpoint]);
    state.message = 'De volta ao último apoio. Seus mecanismos concluídos foram preservados.';
  }

  function reset() {
    if (disposed) return;
    state.won = false; state.checkpoint = 0;
    state.enemy = 'idle'; state.enemyTimer = 0; state.canalOpen = false;
    state.bossReady = false; state.pulses = 0;
    elapsed = 0;
    respawn();
    state.deaths = 0;
    makeGates();
    state.message = 'Aproxime-se dos anéis e TEÇA uma passagem sobre o vazio.';
  }

  function update(dt: number, input: Input) {
    if (disposed || state.won) return;
    dt = clamp(dt, 0, 1 / 30);
    if (dt === 0) return;
    elapsed += dt;
    state.bossReady = elapsed % 5.2 >= 2.2 && elapsed % 5.2 <= 4.5;

    if (state.pair === 1 && state.enemy !== 'captured') {
      state.enemyTimer -= dt;
      if (state.enemy === 'idle' && state.enemyTimer <= 0) {
        state.enemy = 'warning'; state.enemyTimer = 2.4;
        state.message = 'O Tesourisco prepara outro bote. Deixe a fita TENSA.';
      } else if (state.enemy === 'warning' && state.enemyTimer <= 0) {
        if (state.taut) {
          state.enemy = 'missed'; state.enemyTimer = 3;
          state.message = 'Ele errou o bote! LIBERE agora para capturá-lo.';
        } else {
          state.enemy = 'idle'; state.enemyTimer = 0;
          state.pair = null; state.taut = false; state.onRibbon = false;
          clearRibbon();
          state.message = 'A fita foi cortada. Volte ao apoio e TEÇA novamente; tensione antes do bote.';
        }
      } else if (state.enemy === 'missed' && state.enemyTimer <= 0) {
        state.enemy = 'idle'; state.enemyTimer = 1;
        state.message = 'Ele se recuperou. Espere o próximo bote com a fita TENSA.';
      }
    }

    if (input.jump && !previousJump) jumpBuffer = .14;
    previousJump = input.jump;
    jumpBuffer = Math.max(0, jumpBuffer - dt);
    coyote = state.grounded ? .1 : Math.max(0, coyote - dt);
    if (launchTime > 0) {
      launchTime -= dt;
    } else {
      const magnitude = Math.hypot(input.x, input.z);
      const scale = magnitude > 1 ? 1 / magnitude : 1;
      state.velocity.x = input.x * scale * SPEED;
      state.velocity.z = input.z * scale * SPEED;
    }
    if (jumpBuffer > 0 && coyote > 0 && launchTime <= 0) {
      state.velocity.y = 7;
      state.grounded = false;
      jumpBuffer = 0; coyote = 0;
    } else if (state.grounded && state.velocity.y <= 0) {
      state.velocity.y = -1.5;
    }
    state.velocity.y = Math.max(-25, state.velocity.y - GRAVITY * dt);
    displacement.x = state.velocity.x * dt;
    displacement.y = state.velocity.y * dt;
    displacement.z = state.velocity.z * dt;
    controller.computeColliderMovement(capsule, displacement);
    const movement = controller.computedMovement();
    const translation = body.translation();
    nextTranslation.x = translation.x + movement.x;
    nextTranslation.y = translation.y + movement.y;
    nextTranslation.z = translation.z + movement.z;
    body.setNextKinematicTranslation(nextTranslation);
    world.timestep = dt;
    world.step();
    const actual = body.translation();
    state.position.x = actual.x;
    state.position.y = actual.y - FOOT_OFFSET;
    state.position.z = actual.z;
    state.grounded = controller.computedGrounded() && state.velocity.y <= 0;
    if (state.grounded) {
      state.velocity.y = 0;
      launchTime = 0;
    }
    const island = independentPlatform();
    state.onRibbon = false;
    if (state.grounded && island < 0 && state.pair !== null) {
      const pair = PAIRS[state.pair];
      state.onRibbon = Math.abs(state.position.x) < 1.1 && state.position.z >= pair.a.z && state.position.z <= pair.b.z &&
        Math.abs(state.position.y - ribbonHeight(pair, state.position.z, state.taut)) < .25;
    }
    if ((island === 1 || island === 2) && island > state.checkpoint) {
      state.checkpoint = island;
      state.message = island === 1 ? 'Novo apoio salvo. Siga até os anéis: um Tesourisco vigia a segunda passagem.'
        : 'Novo apoio salvo. Vá à flor dourada, teça a raiz e observe os passos da Jardineira.';
    }
    if (island === 3 && state.position.z >= 45 && state.canalOpen && state.enemy === 'captured') {
      state.won = true;
      state.velocity.x = 0; state.velocity.y = 0; state.velocity.z = 0;
      state.message = 'Você devolveu movimento ao jardim. A Jardineira floresceu!';
    }
    if (state.position.y < -7 || Math.abs(state.position.x) > 20 || state.position.z > 60 || state.position.z < -20) respawn();
  }

  makeGates();
  // Populate Rapier's broad phase before the first character query.
  world.step();
  return {
    state, update, act, reset, respawn, actionLabel,
    dispose() { if (!disposed) { disposed = true; world.free(); } },
  };
}
