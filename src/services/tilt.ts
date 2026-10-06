/** Tilt-to-turn for the globe: how far the phone has tipped away from the
 * way it is being held, as a small turn of the globe.
 *
 * The rest posture follows the phone: each sample pulls it a little towards
 * the current angle, so however the traveller holds the phone — upright on
 * a train, flat on a table — that reads as level within a second or two, and
 * only a fresh tip moves the globe. The turn is a sway, never a new camera:
 * it eases back to nothing while the phone is still, so it can't leave the
 * globe somewhere the traveller didn't put it, and their pan and pinch stay
 * theirs. Pure, so the feel can be tested without a sensor. */

/** The largest turn a tilt gives, in radians (~17°) — a glimpse round the
 * edge, not a spin. */
export const TILT_MAX = 0.3;
/** Globe turn per radian of tip. */
export const TILT_GAIN = 0.9;
/** Share of the gap to the current angle the rest posture closes per
 * sample: at 30 samples a second, most of the way in about two seconds. */
export const TILT_FOLLOW = 0.04;

export interface TiltRest {
  /** Rest pitch and roll in radians, or null before the first sample. */
  pitch: number | null;
  roll: number | null;
}

export const NO_REST: TiltRest = { pitch: null, roll: null };

export interface TiltSample {
  /** DeviceMotion `rotation.beta` (pitch) and `rotation.gamma` (roll), radians. */
  beta: number;
  gamma: number;
  /** DeviceMotion `orientation`: the screen's rotation in degrees (0, 90, −90, 180). */
  orientation: number;
}

/** The angle from `from` to `to`, the short way round. */
function delta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

const clamp = (value: number) => Math.max(-TILT_MAX, Math.min(TILT_MAX, value));

/** One sensor sample: the new rest posture and the globe's turn —
 * `lambda` (round the axis, from a sideways tip) and `phi` (towards a pole,
 * from tipping the top towards or away from the traveller), in radians, in
 * the screen's frame whichever way the phone is turned. */
export function tiltStep(
  rest: TiltRest,
  sample: TiltSample,
): { rest: TiltRest; lambda: number; phi: number } {
  if (rest.pitch === null || rest.roll === null) {
    return { rest: { pitch: sample.beta, roll: sample.gamma }, lambda: 0, phi: 0 };
  }
  const dPitch = delta(rest.pitch, sample.beta);
  const dRoll = delta(rest.roll, sample.gamma);
  const next: TiltRest = {
    pitch: rest.pitch + dPitch * TILT_FOLLOW,
    roll: rest.roll + dRoll * TILT_FOLLOW,
  };
  // The device's axes onto the screen's: sideways and up the screen.
  let side: number;
  let up: number;
  switch (sample.orientation) {
    case 90:
      side = dPitch;
      up = -dRoll;
      break;
    case -90:
      side = -dPitch;
      up = dRoll;
      break;
    case 180:
      side = -dRoll;
      up = -dPitch;
      break;
    default:
      side = dRoll;
      up = dPitch;
  }
  return { rest: next, lambda: clamp(side * TILT_GAIN), phi: clamp(up * TILT_GAIN) };
}
