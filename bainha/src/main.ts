import * as THREE from 'three';
import { createGame, PLATFORMS, PAIRS, ribbonPoints, type Vec3 } from './game';
import './style.css';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Interface incompleta: ${id}`);
  return element as T;
};
const show = (id: string, visible: boolean) => { $(id).hidden = !visible; };

async function boot() {
  const game = await createGame();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#afcfc5');
  scene.fog = new THREE.Fog('#afcfc5', 28, 88);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label', 'Jardins de Porcelana: mundo 3D de BAINHA');
  $('scene').appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 160);
  const hemisphere = new THREE.HemisphereLight('#ecfff1', '#708576', 2.35);
  scene.add(hemisphere);
  const sunlight = new THREE.DirectionalLight('#fff0d1', 3.4);
  sunlight.position.set(-12, 22, -5);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.left = -20;
  sunlight.shadow.camera.right = 20;
  sunlight.shadow.camera.top = 22;
  sunlight.shadow.camera.bottom = -22;
  sunlight.shadow.camera.near = 1;
  sunlight.shadow.camera.far = 65;
  sunlight.shadow.normalBias = 0.04;
  scene.add(sunlight, sunlight.target);

  const material = (color: string, roughness = .65, metalness = .05) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const ivory = material('#f7e7cc', .42);
  const cream = material('#e1d4b4');
  const jade = material('#558c79', .53);
  const darkJade = material('#274d46', .8);
  const coral = material('#e47961', .5);
  const gold = material('#c59e57', .34, .45);
  const bark = material('#b5a788');
  const navy = material('#273c47');
  const ribbonMat = new THREE.MeshStandardMaterial({ color: '#fbbe7a', emissive: '#ce7237', emissiveIntensity: .35, side: THREE.DoubleSide, roughness: .38, metalness: .12 });
  const glow = new THREE.MeshBasicMaterial({ color: '#fff0af' });
  const touchMode = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  function mesh(geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene) {
    const item = new THREE.Mesh(geometry, mat);
    item.position.set(x, y, z);
    item.castShadow = true;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  }
  function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene) {
    return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  }
  function sphere(radius: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene) {
    return mesh(new THREE.IcosahedronGeometry(radius, 1), mat, x, y, z, parent);
  }
  function ring(radius: number, tube: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene) {
    return mesh(new THREE.TorusGeometry(radius, tube, 6, 32), mat, x, y, z, parent);
  }
  function branch(a: THREE.Vector3, b: THREE.Vector3, width: number, mat: THREE.Material, parent: THREE.Object3D = scene) {
    const cylinder = mesh(new THREE.CylinderGeometry(width * .65, width, a.distanceTo(b), 7), mat, 0, 0, 0, parent);
    cylinder.position.copy(a).add(b).multiplyScalar(.5);
    cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return cylinder;
  }
  function tree(x: number, y: number, z: number, scale: number) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.scale.setScalar(scale);
    scene.add(group);
    branch(new THREE.Vector3(), new THREE.Vector3(.2, 2.3, .15), .16, bark, group);
    branch(new THREE.Vector3(.1, 1.2, 0), new THREE.Vector3(-.9, 2.2, .15), .1, bark, group);
    branch(new THREE.Vector3(.15, 1.7, .1), new THREE.Vector3(.9, 2.8, -.2), .1, bark, group);
    [[-.7, 2.4, .1, .9], [.7, 2.85, -.15, .95], [.1, 3.1, .2, 1.05]].forEach(([a, b, c, r]) => {
      const crown = sphere(r, ivory, a, b, c, group);
      crown.scale.y = .65;
      const seam = ring(r * .7, .025, jade, a, b + .15, c, group);
      seam.rotation.x = Math.PI / 2;
    });
  }

  for (const platform of PLATFORMS) {
    const { center: c, size: s } = platform;
    box(s.x, s.y, s.z, cream, c.x, c.y, c.z);
    const top = c.y + s.y / 2;
    box(s.x + .1, .14, s.z + .1, ivory, c.x, top - .04, c.z);
    mesh(new THREE.ConeGeometry(s.x * .67, 4.8, 6), darkJade, c.x, c.y - 2.45, c.z).rotation.z = Math.PI;
    box(s.x - .7, .016, .075, gold, c.x, top + .04, c.z - s.z / 2 + .45);
    box(s.x - .7, .016, .075, gold, c.x, top + .04, c.z + s.z / 2 - .45);
    for (let i = 0; i < 5; i++) {
      const tileZ = c.z - s.z / 2 + 1 + i * (s.z - 2) / 4;
      box(1.55, .035, 1.2, i % 2 ? cream : ivory, 0, top + .035, tileZ);
    }
    tree(-2.8, top, c.z + 1, .9);
    tree(3.0, top, c.z - 2, .67);
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (2.2 + (i % 3) * .37);
      const z = c.z - s.z / 2 + .8 + (i * 1.71) % (s.z - 1.6);
      const petal = mesh(new THREE.ConeGeometry(.12, .7 + .15 * (i % 3), 3), coral, x, top + .24, z);
      petal.rotation.z = side * .2;
    }
  }

  // Distant scenery stays outside the collision corridor.
  for (let i = 0; i < 14; i++) {
    const x = (i % 2 ? 1 : -1) * (13 + (i * 7) % 18);
    const z = i * 5 - 12;
    const y = -4 - (i % 4) * 2;
    const rock = mesh(new THREE.ConeGeometry(3 + i % 3, 7, 5), jade, x, y, z);
    rock.rotation.z = Math.PI;
    const top = sphere(3 + i % 3, ivory, x, y + 3.5, z);
    top.scale.y = .12;
  }
  const sun = mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshBasicMaterial({ color: '#fff1c6', fog: false }), -22, 24, 85);
  sun.rotation.y = Math.PI;
  const sunRing = ring(7, .08, gold, -22, 24, 84.8);
  sunRing.rotation.y = Math.PI;

  const anchors: THREE.Group[] = [];
  for (const pair of PAIRS) for (const point of [pair.a, pair.b]) {
    const root = new THREE.Group(); root.position.set(point.x, point.y, point.z); scene.add(root);
    mesh(new THREE.CylinderGeometry(.4, .55, .18, 12), gold, 0, .05, 0, root);
    const hoop = ring(.37, .075, gold, 0, .62, 0, root); hoop.rotation.y = Math.PI / 2;
    sphere(.105, glow, 0, .62, 0, root);
    anchors.push(root);
  }
  const launchRing = ring(1.0, .045, gold, 0, .1, 37);
  launchRing.rotation.x = Math.PI / 2;
  const landingRing = ring(1.2, .045, gold, 0, 2.6, 44.8);
  landingRing.rotation.x = Math.PI / 2;

  const player = new THREE.Group(); scene.add(player);
  const body = mesh(new THREE.ConeGeometry(.44, .79, 6), coral, 0, .67, 0, player);
  body.rotation.y = Math.PI / 6;
  sphere(.31, ivory, 0, 1.3, 0, player);
  const visor = sphere(.26, navy, 0, 1.32, .13, player); visor.scale.set(.85, .57, .7);
  box(.09, .065, .025, glow, -.11, 1.34, .31, player);
  box(.09, .065, .025, glow, .11, 1.34, .31, player);
  const footL = box(.21, .23, .35, bark, -.18, .12, .07, player);
  const footR = box(.21, .23, .35, bark, .18, .12, .07, player);
  const armL = mesh(new THREE.CapsuleGeometry(.1, .25, 3, 6), ivory, -.43, .81, 0, player);
  const armR = mesh(new THREE.CapsuleGeometry(.1, .25, 3, 6), ivory, .43, .81, 0, player);
  const spool = mesh(new THREE.CylinderGeometry(.17, .17, .17, 10), gold, -.47, .69, .1, player);
  spool.rotation.z = Math.PI / 2;
  const scarf = box(.2, .06, .65, ivory, 0, .98, -.43, player); scarf.rotation.x = -.2;

  const enemy = new THREE.Group(); scene.add(enemy);
  const shell = sphere(.6, ivory, 0, .55, 0, enemy); shell.scale.set(1, .65, .9);
  sphere(.19, navy, 0, .53, -.43, enemy);
  const blades: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const blade = box(.1, .08, .7, gold, side * .18, .46, -.76, enemy);
    blade.rotation.y = side * .35; blades.push(blade);
    for (let i = 0; i < 3; i++) branch(new THREE.Vector3(side * .3, .35, (i - 1) * .25), new THREE.Vector3(side * .72, .05, (i - 1) * .32), .045, coral, enemy);
  }
  enemy.position.set(0, 0, 22);
  const basket = mesh(new THREE.CylinderGeometry(.85, .65, .8, 9, 1, true), jade, 2.6, .4, 20);
  ring(.84, .055, gold, 2.6, .82, 20).rotation.x = Math.PI / 2;

  const gate = new THREE.Group(); scene.add(gate);
  gate.position.set(0, 0, 29);
  for (const x of [-1.15, 0, 1.15]) box(.07, 1.5, .07, gold, x, .75, 0, gate);
  box(2.6, .08, .08, coral, 0, 1.4, 0, gate);
  const finalGate = new THREE.Group(); scene.add(finalGate); finalGate.position.set(0, 2.5, 42);
  box(2.5, 1.9, .12, jade, 0, .95, 0, finalGate);

  const guardian = new THREE.Group(); guardian.position.set(0, 2.5, 50); scene.add(guardian);
  const bowl = mesh(new THREE.SphereGeometry(3.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), ivory, 0, 3.9, 0, guardian);
  bowl.rotation.x = Math.PI;
  const crown = ring(3.4, .13, gold, 0, 3.9, 0, guardian); crown.rotation.x = Math.PI / 2;
  sphere(1.0, jade, 0, 4.5, 0, guardian).scale.set(2.8, .35, 2);
  const guardianLegs: THREE.Group[] = [];
  for (const x of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(x * 2.2, 0, -1); guardian.add(leg);
    branch(new THREE.Vector3(0, 3.5, 0), new THREE.Vector3(x * 1.1, 1.8, -.7), .21, ivory, leg);
    branch(new THREE.Vector3(x * 1.1, 1.8, -.7), new THREE.Vector3(x * .8, 0, -2), .18, ivory, leg);
    sphere(.36, gold, x * 1.1, 1.8, -.7, leg); guardianLegs.push(leg);
  }
  sphere(.75, ivory, 0, 2.9, -2.8, guardian);
  const guardianEye = sphere(.16, gold, 0, 2.95, -3.5, guardian);
  const fountain = new THREE.Group(); fountain.position.set(0, 2.5, 47); scene.add(fountain);
  mesh(new THREE.CylinderGeometry(.7, 1, .6, 12), ivory, 0, .3, 0, fountain);
  const water = mesh(new THREE.CylinderGeometry(.07, .13, 2.4, 8), new THREE.MeshBasicMaterial({ color: '#8de1d1', transparent: true, opacity: .8 }), 0, 1.7, 0, fountain);
  water.visible = false;

  const ribbon = new THREE.Group(); scene.add(ribbon);
  const trajectory = new THREE.Group(); scene.add(trajectory);
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    sphere(.055, glow, 0, .8 + 2.5 * t + Math.sin(t * Math.PI) * 3.2, 37 + t * 7.8, trajectory);
  }
  trajectory.visible = false;
  let ribbonKey = '';
  function refreshRibbon() {
    const s = game.state;
    const key = `${s.pair}:${s.taut}`;
    if (key === ribbonKey) return;
    ribbonKey = key;
    while (ribbon.children.length) {
      const item = ribbon.children[0] as THREE.Mesh;
      ribbon.remove(item);
      item.geometry?.dispose();
    }
    if (s.pair === null) return;
    const points = ribbonPoints(PAIRS[s.pair], s.taut);
    const positions: number[] = [];
    const indices: number[] = [];
    points.forEach((p, i) => {
      positions.push(p.x - .9, p.y + .035, p.z, p.x + .9, p.y + .035, p.z);
      if (i < points.length - 1) {
        const j = i * 2;
        indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices); geo.computeVertexNormals();
    mesh(geo, ribbonMat, 0, 0, 0, ribbon);
    for (const side of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p.x + side * .86, p.y + .075, p.z)));
      mesh(new THREE.TubeGeometry(curve, 24, .025, 4, false), glow, 0, 0, 0, ribbon);
    }
  }

  let started = false, paused = false, aiming = false, jumpQueued = false;
  let elapsed = 0, accumulator = 0, last = performance.now(), frames = 0;
  let toastTime = 0, lastMessage = '', lastPulse = 0, pulseTime = 0;
  let lookAngle = 0, moveClock = 0, shownWin = false;
  const cameraTarget = new THREE.Vector3(0, 1, 6);
  const cameraDesired = new THREE.Vector3();
  const keys = new Set<string>();
  let stickX = 0, stickZ = 0;
  let pointer: { id: number; x: number; y: number; time: number; kind: 'pending' | 'move' | 'aim'; cancel: boolean } | null = null;
  let padJump = false, padTrigger = false;
  let lastTouchX = 0, lastTouchZ = 0, coastUntil = 0;
  const pulseOrb = sphere(.14, glow, 0, 0, 0); pulseOrb.visible = false;

  function clearInput() {
    keys.clear(); stickX = stickZ = 0; aiming = false; pointer = null;
    jumpQueued = false; coastUntil = 0; padTrigger = false; padJump = false;
    $('joystick-knob').style.transform = '';
    show('cancel-indicator', false);
  }
  function setPause(value: boolean) {
    if (!started || game.state.won) return;
    paused = value; clearInput(); show('pause-menu', value);
  }
  function start() {
    game.reset(); clearInput(); started = true; paused = false; shownWin = false; elapsed = 0; accumulator = 0;
    show('menu', false); show('win-menu', false); show('pause-menu', false); show('hud', true); show('controls', true); show('hint', true);
    $('hint').textContent = 'WASD para andar · Espaço para saltar · Segure E e solte para costurar';
  }
  function act() { if (started && !paused && !game.state.won) game.act(); }
  $('start').addEventListener('click', start);
  $('again').addEventListener('click', start);
  $('restart').addEventListener('click', start);
  $('resume').addEventListener('click', () => setPause(false));
  $('pause').addEventListener('click', () => setPause(!paused));
  $('help').addEventListener('click', () => setPause(true));
  $('action').addEventListener('click', act);
  $('jump').addEventListener('click', () => { if (!paused) jumpQueued = true; });
  addEventListener('keydown', event => {
    if (['KeyW','KeyA','KeyS','KeyD','Space','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) event.preventDefault();
    if (event.code === 'Escape') {
      if (aiming) { aiming = false; keys.delete('KeyE'); }
      else setPause(!paused);
      return;
    }
    if (!started || paused || game.state.won) return;
    if (event.code === 'Space' && !event.repeat) jumpQueued = true;
    if (event.code === 'KeyE') aiming = true;
    keys.add(event.code);
  });
  addEventListener('keyup', event => {
    if (event.code === 'KeyE' && aiming && keys.has('KeyE')) { aiming = false; act(); }
    keys.delete(event.code);
  });
  const zone = $('touch-zone');
  zone.addEventListener('pointerdown', event => {
    if (!started || paused || pointer || game.state.won) return;
    event.preventDefault(); zone.setPointerCapture(event.pointerId);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), kind: 'pending', cancel: false };
  });
  zone.addEventListener('pointermove', event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    event.preventDefault();
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (pointer.kind === 'pending' && Math.hypot(dx, dy) > 8) pointer.kind = 'move';
    if (pointer.kind === 'move') {
      const scale = Math.max(42, Math.hypot(dx, dy)); stickX = dx / scale; stickZ = -dy / scale;
      $('joystick-knob').style.transform = `translate(${stickX * 31}px, ${-stickZ * 31}px)`;
    } else if (pointer.kind === 'aim') {
      pointer.cancel = dy > 55;
      $('cancel-indicator').textContent = pointer.cancel ? 'Solte para cancelar' : 'Solte para confirmar · arraste para baixo para cancelar';
    }
  });
  function endPointer(event: PointerEvent, cancelled: boolean) {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (!cancelled) {
      if (pointer.kind === 'pending') jumpQueued = true;
      if (pointer.kind === 'aim' && !pointer.cancel) act();
      if (pointer.kind === 'move') { lastTouchX = stickX; lastTouchZ = stickZ; coastUntil = performance.now() + 110; }
    } else coastUntil = 0;
    pointer = null; stickX = stickZ = 0; aiming = false;
    $('joystick-knob').style.transform = ''; show('cancel-indicator', false);
  }
  zone.addEventListener('pointerup', event => endPointer(event, false));
  zone.addEventListener('pointercancel', event => endPointer(event, true));
  addEventListener('blur', () => { clearInput(); if (started && !game.state.won) setPause(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); setPause(true); } last = performance.now(); accumulator = 0; });
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); setPause(true); show('error', true); $('error-message').textContent = 'A renderização foi interrompida. Recarregue a página para retomar os jardins.';
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.fov = camera.aspect < .8 ? 62 : 52;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }
  addEventListener('resize', resize); resize();
  camera.position.set(11, 11, -10); camera.lookAt(0, 0, 9);
  show('loading', false);
  show('menu', true);
  const indicator = $('ribbon-state');
  const objective = $('objective');
  const progress = $('progress');
  const actionButton = $('action');
  const setText = (element: HTMLElement, text: string) => { if (element.textContent !== text) element.textContent = text; };
  (window as unknown as { __BAINHA__: unknown }).__BAINHA__ = {
    snapshot: () => ({ ...game.state, position: { ...game.state.position }, velocity: { ...game.state.velocity }, started, paused, aiming, frames, elapsed }),
  };

  function frame(now: number) {
    requestAnimationFrame(frame);
    const dt = Math.min(.06, Math.max(0, (now - last) / 1000)); last = now; frames++;
    if (pointer?.kind === 'pending' && now - pointer.time >= 220 && !paused) {
      pointer.kind = 'aim'; aiming = true; show('cancel-indicator', true);
      $('cancel-indicator').textContent = 'Solte para confirmar · arraste para baixo para cancelar';
    }
    let x = stickX, z = stickZ;
    if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (!pointer && now < coastUntil) { x += lastTouchX; z += lastTouchZ; }
    const pad = navigator.getGamepads?.().find(p => p?.connected);
    if (pad && started && !paused && !game.state.won) {
      const dz = (n: number) => Math.abs(n) > .18 ? n : 0;
      x += dz(pad.axes[0] || 0); z -= dz(pad.axes[1] || 0);
      const pressedJump = !!pad.buttons[0]?.pressed;
      const pressedTrigger = !!pad.buttons[7]?.pressed;
      if (pressedJump && !padJump) jumpQueued = true;
      if (pressedTrigger && !padTrigger) aiming = true;
      if (!pressedTrigger && padTrigger) { aiming = false; act(); }
      padJump = pressedJump; padTrigger = pressedTrigger;
    } else { if (padTrigger) aiming = false; padJump = false; padTrigger = false; }
    const length = Math.hypot(x, z); if (length > 1) { x /= length; z /= length; }
    if (started && !paused && !game.state.won) {
      elapsed += dt;
      accumulator += dt * (aiming ? .25 : 1);
      while (accumulator >= 1 / 60) {
        game.update(1 / 60, { x: aiming ? 0 : x, z: aiming ? 0 : z, jump: jumpQueued });
        jumpQueued = false; accumulator -= 1 / 60;
      }
    }
    const s = game.state;
    player.position.set(s.position.x, s.position.y, s.position.z);
    const speed = Math.hypot(s.velocity.x, s.velocity.z);
    if (speed > .1) lookAngle = Math.atan2(s.velocity.x, s.velocity.z);
    player.rotation.y += THREE.MathUtils.euclideanModulo(lookAngle - player.rotation.y + Math.PI, Math.PI * 2) * .15 - Math.PI * .15;
    moveClock += dt * speed * 3;
    footL.position.z = .07 + Math.sin(moveClock) * Math.min(.15, speed * .03);
    footR.position.z = .07 - Math.sin(moveClock) * Math.min(.15, speed * .03);
    armL.rotation.x = Math.sin(moveClock) * .22; armR.rotation.x = -armL.rotation.x;
    scarf.rotation.x = -.2 + Math.sin(now * .003) * .09;
    if (started) {
      cameraDesired.set(s.position.x * .65, s.position.y + (camera.aspect < .8 ? 10.5 : 8.5), s.position.z - 11.5);
      cameraTarget.lerp(new THREE.Vector3(s.position.x * .85, s.position.y + .65, s.position.z + 4.7), 1 - Math.exp(-dt * 6));
    } else {
      cameraDesired.set(10.5 + Math.sin(now * .00013) * 1.5, 11.5, -10);
      cameraTarget.set(0, 0, 9);
    }
    camera.position.lerp(cameraDesired, 1 - Math.exp(-dt * 5)); camera.lookAt(cameraTarget);
    sunlight.position.set(s.position.x - 12, 22, s.position.z - 5);
    sunlight.target.position.set(s.position.x, 0, s.position.z + 4);
    refreshRibbon();
    trajectory.visible = s.pair === 2 && s.taut && !s.won;
    launchRing.material = s.bossReady ? glow : gold;
    water.visible = s.canalOpen;
    gate.visible = s.enemy !== 'captured'; finalGate.visible = !s.canalOpen;
    guardianLegs.forEach((leg, i) => { leg.rotation.x = s.canalOpen ? 0 : (s.bossReady ? 0 : Math.sin(now * .0015 + i) * .12); });
    guardianEye.material = s.bossReady || s.canalOpen ? glow : gold;
    if (s.enemy === 'captured') {
      enemy.position.lerp(new THREE.Vector3(2.6, .8, 20), Math.min(1, dt * 5)); enemy.rotation.z = .4;
    } else {
      enemy.position.set(0, s.enemy === 'warning' ? .08 + Math.sin(now * .025) * .06 : 0, 22);
      enemy.rotation.z = 0;
      blades.forEach((blade, i) => { blade.rotation.y = (i ? 1 : -1) * (s.enemy === 'warning' ? .85 : .3); });
    }
    if (s.pulses !== lastPulse) { lastPulse = s.pulses; pulseTime = .7; }
    pulseTime = Math.max(0, pulseTime - dt); pulseOrb.visible = pulseTime > 0 && s.pair !== null;
    if (pulseOrb.visible && s.pair !== null) {
      const p = PAIRS[s.pair]; const t = 1 - pulseTime / .7;
      pulseOrb.position.set(0, THREE.MathUtils.lerp(p.a.y, p.b.y, t) + .2, THREE.MathUtils.lerp(p.a.z, p.b.z, t));
    }
    setText(indicator, s.pair === null ? 'SEM FITA' : s.taut ? 'FITA TENSA' : 'FITA FROUXA');
    indicator.dataset.state = s.pair === null ? 'none' : s.taut ? 'taut' : 'loose';
    progress.setAttribute('aria-label', `Trecho ${Math.min(3, s.checkpoint + 1)} de 3`);
    progress.querySelectorAll('.progress-light').forEach((light, i) => {
      light.classList.toggle('active', i === s.checkpoint);
      light.classList.toggle('complete', i < s.checkpoint || s.won);
    });
    const actionLabel = game.actionLabel(); setText(actionButton.querySelector('span')!, actionLabel);
    let mission = 'Aproxime-se do primeiro anel e teça uma passagem.';
    if (s.checkpoint === 0 && s.pair === 0) mission = 'Atravesse a fita e alcance o próximo jardim.';
    if (s.checkpoint === 1) mission = s.enemy === 'captured' ? 'O caminho está livre. Atravesse a segunda fita.' : s.enemy === 'missed' ? 'Ele errou o bote! LIBERE a tensão agora.' : 'Teça a segunda fita. Tensione para escapar do corte; depois libere.';
    if (s.checkpoint >= 2) mission = s.canalOpen ? 'Alcance a fonte no terraço e devolva a água ao jardim.' : s.pair === 2 && s.taut ? s.bossReady ? 'Joelho apoiado! LIBERE a tensão para voar.' : 'Raiz carregada. Aguarde o joelho apoiar…' : 'No círculo dourado, teça e tensione a raiz.';
    setText(objective, mission);
    if (aiming) setText($('hint'), `${actionLabel.toUpperCase()} · solte para confirmar · Esc cancela`);
    else setText($('hint'), touchMode ? `Arraste para mover · segure: ${actionLabel.toLowerCase()}` : `WASD · Espaço para saltar · E: ${actionLabel.toLowerCase()}`);
    if (s.message && s.message !== lastMessage) {
      lastMessage = s.message; toastTime = 4.5; setText($('toast'), s.message);
    }
    toastTime = Math.max(0, toastTime - dt); $('toast').hidden = toastTime === 0 || !started || paused;
    if (s.won && !shownWin) {
      shownWin = true; clearInput(); show('win-menu', true); show('controls', false);
      $('win-stats').textContent = `${Math.floor(elapsed / 60)}min ${Math.floor(elapsed % 60).toString().padStart(2, '0')}s · ${s.deaths} ${s.deaths === 1 ? 'retorno' : 'retornos'} ao jardim`;
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

boot().catch(error => {
  console.error(error);
  const loading = document.getElementById('loading'); if (loading) loading.hidden = true;
  const element = document.getElementById('error');
  if (element) { element.hidden = false; const message = document.getElementById('error-message'); if (message) message.textContent = 'Use um navegador com WebGL ativado e recarregue a página.'; }
});
