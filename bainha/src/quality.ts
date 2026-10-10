export type QualityMode = 'auto' | 'high' | 'low';

const resolutionSteps = [1, .85, .7, .6] as const;

/** Rendering budget only. Never changes simulation speed, input or the camera. */
export function createQualityController() {
  let mode: QualityMode = 'auto', step = 0;
  let frameTimeMs = 16.67, observedSeconds = 0, slowSeconds = 0, cooldown = 0;
  let changes = 0, longFrames = 0;

  function snapshot() {
    return {
      mode, level: mode === 'high' ? 'high' as const : 'low' as const,
      resolutionScale: resolutionSteps[step], frameTimeMs, changes,
    };
  }

  function setMode(next: QualityMode) {
    const previous = snapshot();
    mode = next; step = 0;
    frameTimeMs = 16.67; observedSeconds = 0; slowSeconds = 0; cooldown = 0; longFrames = 0;
    if (previous.level !== snapshot().level || previous.resolutionScale !== 1) changes++;
  }

  /** Returns true only when a new resolution must be applied before drawing. */
  function observe(sampleMs: number, active: boolean) {
    if (!active) { longFrames = 0; return false; }
    if (!Number.isFinite(sampleMs) || sampleMs <= 0) return false;
    // Ignore isolated startup/tab stalls, but still help when every frame is
    // extremely slow. Three consecutive long frames establish that condition.
    if (sampleMs > 250) {
      if (++longFrames < 3) return false;
      sampleMs = 250;
    } else longFrames = 0;
    const seconds = sampleMs / 1000;
    frameTimeMs += (sampleMs - frameTimeMs) * (1 - Math.exp(-seconds * 3));
    observedSeconds += seconds;
    cooldown = Math.max(0, cooldown - seconds);
    if (mode !== 'auto' || step === resolutionSteps.length - 1 || observedSeconds < 1 || cooldown > 0) return false;
    // A stale high average after one hitch must not count healthy frames as slow.
    if (sampleMs > 24 && frameTimeMs > 24) slowSeconds += seconds;
    else if (sampleMs < 21) slowSeconds = Math.max(0, slowSeconds - seconds * 2);
    const threshold = frameTimeMs > 40 ? .6 : 1.2;
    if (slowSeconds < threshold) return false;
    step++; changes++; slowSeconds = 0; cooldown = 1.5;
    // Each cut has time to settle. Automatic quality never oscillates upward
    // during a jump; selecting a graphics mode starts a new observation window.
    return true;
  }

  function pixelRatio(width: number, height: number, deviceRatio: number, touch: boolean) {
    const high = mode === 'high';
    const pixels = high ? 1920 * 1080 : 1280 * 720;
    const area = Math.max(1, width) * Math.max(1, height);
    const native = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
    return Math.min(native, high ? touch ? 1.25 : 1.5 : 1, Math.sqrt(pixels / area)) * resolutionSteps[step];
  }

  return { snapshot, setMode, observe, pixelRatio };
}
