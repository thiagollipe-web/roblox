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
  let ready = false, contextLost = false;
  let started = false, paused = false, aiming = false, jumpQueued = false;
  let elapsed = 0, accumulator = 0, last = performance.now(), frames = 0;
  let toastTime = 0, lastMessage = '', shownWin = false;
  let lastHudKey = '', renderDirty = true;
  const fixedStep = 1 / 60;
  const keys = new Set<string>();
  let stickX = 0;
  let pointer: {
    id: number; x: number; y: number; time: number;
    kind: 'pending' | 'move' | 'aim'; cancel: boolean; dy: number; jumpLatched: boolean;
  } | null = null;
  let padJump = false, padTrigger = false, padPause = false, padAimArmed = false;
  let padIdentity: string | null = null;
  let lastTouchX = 0, coastUntil = 0;

  function activeModal() {
    if (contextLost) return $('error');
    if (paused) return $('pause-menu');
    if (game.state.won) return $('win-menu');
    return null;
  }
  function updateInputSurface() {
    const blocked = !ready || !started || paused || game.state.won || contextLost;
    $('hud').inert = blocked; $('controls').inert = blocked;
    $('menu').inert = contextLost;
    $('pause-menu').inert = contextLost; $('win-menu').inert = contextLost;
  }
  function cancelAim() {
    aiming = false; keys.delete('KeyE'); padAimArmed = false;
    if (pointer?.kind === 'aim') {
      pointer = null; stickX = 0; coastUntil = 0;
      $('joystick-knob').style.transform = '';
    }
    show('cancel-indicator', false);
  }
  function clearInput() {
    keys.clear(); stickX = 0; aiming = false; pointer = null;
    jumpQueued = false; coastUntil = 0; padAimArmed = false;
    // Held buttons are not fresh presses when returning from a menu.
    const pad = navigator.getGamepads?.().find(p => p?.connected);
    padTrigger = !!pad?.buttons[7]?.pressed; padJump = !!pad?.buttons[0]?.pressed;
    $('joystick-knob').style.transform = '';
    show('cancel-indicator', false);
  }
  function setPause(value: boolean) {
    if (!ready || !started || game.state.won || contextLost) return;
    paused = value; clearInput(); accumulator = 0;
    motion.reset(game.state.position); renderDirty = true;
    show('pause-menu', value); show('controls', !value);
    updateInputSurface();
    $(value ? 'resume' : 'scene').focus({ preventScroll: true });
  }
  function start() {
    if (!ready || contextLost) return;
    game.reset(); clearInput(); started = true; paused = false; shownWin = false;
    motion.reset(game.state.position); renderDirty = true;
    elapsed = 0; accumulator = 0; lastMessage = ''; toastTime = 0;
    show('menu', false); show('win-menu', false); show('pause-menu', false);
    show('hud', true); show('controls', true);
    updateInputSurface(); $('scene').focus({ preventScroll: true });
  }
  function act() {
    if (ready && started && !paused && !game.state.won && !contextLost) {
      game.act(); motion.reset(game.state.position);
    }
  }
  function jump() { if (ready && started && !paused && !game.state.won && !contextLost) jumpQueued = true; }
  function bindPlayButton(id: string, press: () => void) {
    // Secondary touches do not produce a compatibility click in every browser.
    // React on press for gameplay, and retain native keyboard/assistive clicks.
    $(id).addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); press();
    });
    $(id).addEventListener('click', event => { if (event.detail === 0) press(); });
  }
  $('start').addEventListener('click', start);
  $('again').addEventListener('click', start);
  $('restart').addEventListener('click', start);
  $('resume').addEventListener('click', () => setPause(false));
  bindPlayButton('pause', () => setPause(!paused));
  bindPlayButton('help', () => setPause(true));
  bindPlayButton('action', act);
  bindPlayButton('jump', jump);
  $('graphics-quality').addEventListener('change', event => {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'auto' || value === 'high' || value === 'low') {
      view.setQuality(value); renderDirty = true;
    }
  });
  addEventListener('keydown', event => {
    const modal = activeModal();
    if (event.code === 'Tab' && modal) {
      const controls = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled)')]
        .filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (first && (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
      return;
    }
    if (!ready || contextLost) return;
    if (event.target instanceof HTMLSelectElement) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      if (event.repeat) return;
      if (aiming) cancelAim();
      else setPause(!paused);
      return;
    }
    if (!started || paused || game.state.won) return;
    // Preserve native keyboard activation of visible UI buttons.
    if (event.target instanceof HTMLElement && event.target.closest('button')
      && (event.code === 'Space' || event.code === 'Enter')) return;
    if (['KeyW','KeyA','KeyS','KeyD','Space','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) event.preventDefault();
    if (['Space', 'KeyW', 'ArrowUp'].includes(event.code)) {
      if (!event.repeat) jump();
      return;
    }
    if (event.code === 'KeyE') {
      if (!event.repeat) { aiming = true; keys.add(event.code); }
      return;
    }
    keys.add(event.code);
  });
  addEventListener('keyup', event => {
    if (event.code === 'KeyE' && aiming && keys.has('KeyE')) { aiming = false; act(); }
    keys.delete(event.code);
  });
  const zone = $('touch-zone');
  zone.addEventListener('pointerdown', event => {
    if (!ready || !started || paused || pointer || game.state.won || contextLost) return;
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
      // A vertical jump flick must not reduce horizontal travel speed.
      stickX = Math.max(-1, Math.min(1, dx / 42));
      const visualScale = Math.max(42, Math.hypot(dx, dy));
      $('joystick-knob').style.transform = `translate(${dx / visualScale * 31}px, ${dy / visualScale * 31}px)`;
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
      if (pointer.kind === 'move') { lastTouchX = stickX; coastUntil = performance.now() + 110; }
    } else coastUntil = 0;
    pointer = null; stickX = 0; aiming = false;
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
    event.preventDefault(); setPause(true); contextLost = true; clearInput();
    show('loading', false); show('error', true); updateInputSurface();
    $('error-message').textContent = 'O navegador interrompeu os gráficos. Recarregue a página para voltar à colina.';
    $('error').querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  });
  view.renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());
  addEventListener('resize', () => { view.resize(); renderDirty = true; }); view.resize();
  await view.prepare();
  last = performance.now();
  if (!$('error').hidden) return;
  ready = true;
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
    let x = stickX;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (!pointer && now < coastUntil) x += lastTouchX;
    const pad = navigator.getGamepads?.().find(p => p?.connected);
    if (pad && started && !game.state.won && !contextLost) {
      const pressedPause = !!pad.buttons[9]?.pressed;
      const pressedJump = !!pad.buttons[0]?.pressed, pressedTrigger = !!pad.buttons[7]?.pressed;
      const identity = `${pad.index}:${pad.id}`;
      if (padIdentity !== identity) {
        // A held button on a newly connected controller is not a fresh press.
        // Sample all action edges before accepting input from this connection.
        if (padAimArmed) cancelAim();
        padIdentity = identity;
        padJump = pressedJump; padTrigger = pressedTrigger; padPause = pressedPause;
      }
      if (pressedPause && !padPause) setPause(!paused);
      padPause = pressedPause;
      if (!paused) {
        const deadzone = (n: number) => Math.abs(n) > .18 ? n : 0;
        x += deadzone(pad.axes[0] || 0);
        if (pressedJump && !padJump) jump();
        if (pressedTrigger && !padTrigger) { aiming = true; padAimArmed = true; }
        if (!pressedTrigger && padTrigger && padAimArmed) { padAimArmed = false; aiming = false; act(); }
      }
      padJump = pressedJump; padTrigger = pressedTrigger;
    } else {
      if (padAimArmed) cancelAim();
      padJump = false; padTrigger = false; padPause = false; padAimArmed = false;
      padIdentity = null;
    }
    x = Math.max(-1, Math.min(1, x));
    if (started && !paused && !game.state.won && !contextLost) {
      elapsed += dt; accumulator += dt * (aiming ? .25 : 1);
      while (accumulator >= fixedStep) {
        motion.capture(game.state.position);
        const deaths = game.state.deaths;
        // Side camera sits on -X: screen-right is world +Z. Every input source
        // uses this single mapping; physics keeps the character on the X=0 rail.
        game.update(fixedStep, { x: 0, z: aiming ? 0 : x, jump: jumpQueued });
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
      else if (touchMode) setText($('hint'), elapsed < 8 ? 'Arraste para os lados · ↑ para saltar' : `Segure e solte: ${actionLabel.toLowerCase()}`);
      else setText($('hint'), elapsed < 8 ? '← → ou A D mover · Espaço saltar · E usar a fita' : `E · ${actionLabel.toLowerCase()}`);
    }
    if (s.message && s.message !== lastMessage) {
      lastMessage = s.message; toastTime = 3.2; setText($('toast'), s.message);
    }
    toastTime = Math.max(0, toastTime - dt); show('toast', toastTime > 0 && started && !paused && !s.won);
    if (s.won && !shownWin) {
      shownWin = true; clearInput(); show('win-menu', true); show('controls', false); show('hint', false);
      updateInputSurface(); $('again').focus({ preventScroll: true });
      $('win-stats').textContent = `${s.coins}/${coinTotal} carretéis · ${s.specials}/${specialTotal} bobinas azuis\n${Math.floor(elapsed / 60)}min ${Math.floor(elapsed % 60).toString().padStart(2, '0')}s · ${s.deaths} ${s.deaths === 1 ? 'queda' : 'quedas'}`;
    }
    if (!contextLost && (!paused || renderDirty)) {
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
    element.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }
});
