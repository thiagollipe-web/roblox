import { createGame, COLLECTIBLES } from './game';
import { createView } from './view';
import { createMotion } from './motion';
import './style.css';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Interface incompleta: ${id}`);
  return element as T;
};
const show = (id: string, visible: boolean) => {
  const element = $(id);
  if (element.hidden === visible) element.hidden = !visible;
};
const setText = (element: HTMLElement, text: string) => {
  if (element.textContent !== text) element.textContent = text;
};

async function boot() {
  const game = await createGame();
  const view = createView($('scene'));
  const motion = createMotion(game.state.position);
  const touchMode = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const coinTotal = COLLECTIBLES.filter(item => !item.special).length;
  const specialTotal = COLLECTIBLES.filter(item => item.special).length;
  let started = false, paused = false, aiming = false, jumpQueued = false;
  let elapsed = 0, accumulator = 0, last = performance.now(), frames = 0;
  let toastTime = 0, lastMessage = '', shownWin = false;
  let lastHudKey = '', renderDirty = true;
  const fixedStep = 1 / 60;
  const keys = new Set<string>();
  let stickX = 0, stickZ = 0;
  let pointer: {
    id: number; x: number; y: number; time: number;
    kind: 'pending' | 'move' | 'aim'; cancel: boolean; dy: number; jumpLatched: boolean;
  } | null = null;
  let padJump = false, padTrigger = false, padPause = false;
  let lastTouchX = 0, lastTouchZ = 0, coastUntil = 0;

  function clearInput() {
    keys.clear(); stickX = stickZ = 0; aiming = false; pointer = null;
    jumpQueued = false; coastUntil = 0; padTrigger = false; padJump = false;
    $('joystick-knob').style.transform = '';
    show('cancel-indicator', false);
  }
  function setPause(value: boolean) {
    if (!started || game.state.won) return;
    paused = value; clearInput(); accumulator = 0;
    motion.reset(game.state.position); renderDirty = true;
    show('pause-menu', value); show('controls', !value);
  }
  function start() {
    game.reset(); clearInput(); started = true; paused = false; shownWin = false;
    motion.reset(game.state.position); renderDirty = true;
    elapsed = 0; accumulator = 0; lastMessage = ''; toastTime = 0;
    show('menu', false); show('win-menu', false); show('pause-menu', false);
    show('hud', true); show('controls', true);
  }
  function act() {
    if (started && !paused && !game.state.won) {
      game.act(); motion.reset(game.state.position);
    }
  }
  function jump() { if (started && !paused && !game.state.won) jumpQueued = true; }
  $('start').addEventListener('click', start);
  $('again').addEventListener('click', start);
  $('restart').addEventListener('click', start);
  $('resume').addEventListener('click', () => setPause(false));
  $('pause').addEventListener('click', () => setPause(!paused));
  $('help').addEventListener('click', () => setPause(true));
  $('action').addEventListener('click', act);
  $('jump').addEventListener('pointerdown', event => { event.preventDefault(); jump(); });
  $('jump').addEventListener('click', event => { if (event.detail === 0) jump(); });
  $('graphics-quality').addEventListener('change', event => {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'auto' || value === 'high' || value === 'low') {
      view.setQuality(value); renderDirty = true;
    }
  });
  addEventListener('keydown', event => {
    if (event.target instanceof HTMLSelectElement) return;
    if (event.code === 'Escape') {
      if (aiming) { aiming = false; keys.delete('KeyE'); }
      else setPause(!paused);
      return;
    }
    if (!started || paused || game.state.won) return;
    if (['KeyW','KeyA','KeyS','KeyD','Space','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) event.preventDefault();
    if (event.code === 'Space' && !event.repeat) jump();
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
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY,
      time: performance.now(), kind: 'pending', cancel: false, dy: 0, jumpLatched: false };
  });
  zone.addEventListener('pointermove', event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    event.preventDefault();
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (pointer.kind === 'pending' && Math.hypot(dx, dy) > 8) pointer.kind = 'move';
    if (pointer.kind === 'move') {
      // Push beyond the outer ring while moving to jump without lifting the thumb.
      // Returning inside the ring rearms the gesture; holding it never repeats jumps.
      if (dy < -78 && pointer.dy < -12 && !pointer.jumpLatched) {
        jump(); pointer.jumpLatched = true;
      }
      if (dy > -50) pointer.jumpLatched = false;
      pointer.dy = dy;
      const scale = Math.max(42, Math.hypot(dx, dy)); stickX = dx / scale; stickZ = -dy / scale;
      $('joystick-knob').style.transform = `translate(${stickX * 31}px, ${-stickZ * 31}px)`;
    } else if (pointer.kind === 'aim') {
      pointer.cancel = dy > 55;
      $('cancel-indicator').textContent = pointer.cancel ? 'Solte para cancelar' : 'Solte para costurar · deslize para baixo para cancelar';
    }
  });
  function endPointer(event: PointerEvent, cancelled: boolean) {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (!cancelled) {
      if (pointer.kind === 'pending') jump();
      if (pointer.kind === 'aim' && !pointer.cancel) act();
      if (pointer.kind === 'move') { lastTouchX = stickX; lastTouchZ = stickZ; coastUntil = performance.now() + 110; }
    } else coastUntil = 0;
    pointer = null; stickX = stickZ = 0; aiming = false;
    $('joystick-knob').style.transform = ''; show('cancel-indicator', false);
  }
  zone.addEventListener('pointerup', event => endPointer(event, false));
  zone.addEventListener('pointercancel', event => endPointer(event, true));
  zone.addEventListener('lostpointercapture', event => endPointer(event, true));
  addEventListener('blur', () => { clearInput(); if (started && !game.state.won) setPause(true); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearInput(); setPause(true); }
    last = performance.now(); accumulator = 0;
  });
  view.renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); setPause(true); show('loading', false); show('error', true);
    $('error-message').textContent = 'O navegador interrompeu os gráficos. Recarregue a página para voltar à colina.';
  });
  view.renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());
  addEventListener('resize', () => { view.resize(); renderDirty = true; }); view.resize();
  await view.prepare();
  last = performance.now();
  if (!$('error').hidden) return;
  show('loading', false); show('menu', true);
  const indicator = $('ribbon-state'), objective = $('objective'), progress = $('progress');
  const actionButton = $('action'), coinCount = $('coin-count'), specialCount = $('special-count');
  const progressLights = [...progress.querySelectorAll('.progress-light')];
  const actionCaption = actionButton.querySelector('span')!;
  const snapshot = () => ({
    ...game.state, position: { ...game.state.position }, velocity: { ...game.state.velocity },
    collected: [...game.state.collected], started, paused, aiming, frames, elapsed,
    render: view.diagnostics(),
  });
  Object.defineProperty(window, '__BAINHA__', { value: Object.freeze({ snapshot }), writable: false });

  function frame(now: number) {
    requestAnimationFrame(frame);
    const frameMs = Math.max(0, now - last);
    // Catch up after short hitches, with a six-step bound to avoid a backlog spiral.
    const dt = Math.min(.1, frameMs / 1000); last = now; frames++;
    if (pointer?.kind === 'pending' && now - pointer.time >= 220 && !paused) {
      pointer.kind = 'aim'; aiming = true; show('cancel-indicator', true);
      $('cancel-indicator').textContent = 'Solte para costurar · deslize para baixo para cancelar';
    }
    let x = stickX, z = stickZ;
    if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (!pointer && now < coastUntil) { x += lastTouchX; z += lastTouchZ; }
    const pad = navigator.getGamepads?.().find(p => p?.connected);
    if (pad && started && !game.state.won) {
      const pressedPause = !!pad.buttons[9]?.pressed;
      if (pressedPause && !padPause) setPause(!paused);
      padPause = pressedPause;
      if (!paused) {
        const deadzone = (n: number) => Math.abs(n) > .18 ? n : 0;
        x += deadzone(pad.axes[0] || 0); z -= deadzone(pad.axes[1] || 0);
        const pressedJump = !!pad.buttons[0]?.pressed, pressedTrigger = !!pad.buttons[7]?.pressed;
        if (pressedJump && !padJump) jump();
        if (pressedTrigger && !padTrigger) aiming = true;
        if (!pressedTrigger && padTrigger) { aiming = false; act(); }
        padJump = pressedJump; padTrigger = pressedTrigger;
      }
    } else {
      if (padTrigger) aiming = false;
      padJump = false; padTrigger = false; padPause = false;
    }
    const length = Math.hypot(x, z); if (length > 1) { x /= length; z /= length; }
    if (started && !paused && !game.state.won) {
      elapsed += dt; accumulator += dt * (aiming ? .25 : 1);
      while (accumulator >= fixedStep) {
        motion.capture(game.state.position);
        const deaths = game.state.deaths;
        // Inputs use screen directions. With the camera looking toward +Z,
        // screen-right is world -X. Convert once for keys, touch and gamepad.
        game.update(fixedStep, { x: aiming ? 0 : -x, z: aiming ? 0 : z, jump: jumpQueued });
        if (game.state.deaths !== deaths) motion.reset(game.state.position);
        jumpQueued = false; accumulator -= fixedStep;
      }
    }
    const s = game.state;
    const actionLabel = game.actionLabel();
    const hudKey = `${s.coins}/${s.specials}/${s.pair}/${s.taut}/${s.checkpoint}/${s.enemy}/${s.canalOpen}/${s.bossReady}/${s.won}/${started}/${paused}/${aiming}/${elapsed < 8}/${actionLabel}`;
    // DOM attributes and progress nodes change only when their visible state changes.
    if (hudKey !== lastHudKey) {
      lastHudKey = hudKey;
      setText(coinCount, `${String(s.coins).padStart(2, '0')}/${coinTotal}`);
      setText(specialCount, `${s.specials}/${specialTotal}`);
      setText(indicator, s.pair === null ? 'FITA PRONTA' : s.taut ? 'FITA TENSA' : 'PONTE TECIDA');
      indicator.dataset.state = s.pair === null ? 'none' : s.taut ? 'taut' : 'loose';
      progress.setAttribute('aria-label', `${Math.min(3, s.checkpoint)} de 3 apoios alcançados`);
      progressLights.forEach((light, i) => {
        light.classList.toggle('active', i === s.checkpoint);
        light.classList.toggle('complete', i < s.checkpoint || s.won);
      });
      setText(actionCaption, actionLabel);
      let mission = 'Salte pelos degraus até o pomar!';
      if (s.checkpoint === 1) mission = s.pair === 0 ? 'Atravesse a ponte de fita.' : 'Chegue ao anel e teça uma ponte.';
      if (s.checkpoint === 2) mission = s.enemy === 'captured' ? 'Passagem livre! Siga até os degraus.'
        : s.enemy === 'missed' ? 'Agora! Libere a fita.' : 'Teça, tensione e surpreenda o Tesourisco.';
      if (s.checkpoint >= 3) mission = s.canalOpen ? 'Alcance a grande flor!'
        : s.pair === 2 && s.taut ? s.bossReady ? 'Flor acesa! Libere para voar.' : 'Espere a flor acender…'
        : 'Salte até a flor e carregue a fita.';
      setText(objective, mission);
      const relevantAction = !['APROXIME-SE', 'POUSE PRIMEIRO'].includes(actionLabel);
      show('hint', started && !paused && !s.won && (aiming || elapsed < 8 || relevantAction));
      if (aiming) setText($('hint'), `${actionLabel} · solte para confirmar`);
      else if (touchMode) setText($('hint'), elapsed < 8 ? 'Arraste · empurre mais para cima para saltar' : `Segure e solte: ${actionLabel.toLowerCase()}`);
      else setText($('hint'), elapsed < 8 ? 'WASD mover · Espaço saltar · E usar a fita' : `E · ${actionLabel.toLowerCase()}`);
    }
    if (s.message && s.message !== lastMessage) {
      lastMessage = s.message; toastTime = 3.2; setText($('toast'), s.message);
    }
    toastTime = Math.max(0, toastTime - dt); show('toast', toastTime > 0 && started && !paused && !s.won);
    if (s.won && !shownWin) {
      shownWin = true; clearInput(); show('win-menu', true); show('controls', false); show('hint', false);
      $('win-stats').textContent = `${s.coins}/${coinTotal} carretéis · ${s.specials}/${specialTotal} bobinas azuis\n${Math.floor(elapsed / 60)}min ${Math.floor(elapsed % 60).toString().padStart(2, '0')}s · ${s.deaths} ${s.deaths === 1 ? 'queda' : 'quedas'}`;
    }
    if (!paused || renderDirty) {
      const position = motion.sample(s.position, paused || s.won ? 1 : accumulator / fixedStep);
      view.render(s, { dt: paused ? 0 : dt, elapsed, started, aiming, position, frameMs });
      renderDirty = false;
    }
  }
  requestAnimationFrame(frame);
}

boot().catch(error => {
  console.error(error);
  const loading = document.getElementById('loading'); if (loading) loading.hidden = true;
  const element = document.getElementById('error');
  if (element) {
    element.hidden = false;
    const message = document.getElementById('error-message');
    if (message) message.textContent = 'Use um navegador com WebGL 2 e WebAssembly ativados e recarregue a página.';
  }
});
