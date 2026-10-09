import type { Vec3 } from './game';

/** Smooth presentation between fixed physics ticks without changing collision state. */
export function createMotion(initial: Vec3) {
  const previous: Vec3 = { ...initial };
  const displayed: Vec3 = { ...initial };
  function capture(position: Vec3) {
    previous.x = position.x; previous.y = position.y; previous.z = position.z;
  }
  function reset(position: Vec3) {
    capture(position);
    displayed.x = position.x; displayed.y = position.y; displayed.z = position.z;
  }
  function sample(current: Vec3, alpha: number): Vec3 {
    const dx = current.x - previous.x, dy = current.y - previous.y, dz = current.z - previous.z;
    // Respawns and other discontinuities must never draw a trip through the void.
    if (dx * dx + dy * dy + dz * dz > 16) reset(current);
    const weight = Math.max(0, Math.min(1, alpha));
    displayed.x = previous.x + (current.x - previous.x) * weight;
    displayed.y = previous.y + (current.y - previous.y) * weight;
    displayed.z = previous.z + (current.z - previous.z) * weight;
    return displayed;
  }
  return { capture, reset, sample };
}
