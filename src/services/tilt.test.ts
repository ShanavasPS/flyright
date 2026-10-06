import { NO_REST, TILT_MAX, tiltStep, type TiltRest } from '@/services/tilt';

const at = (beta: number, gamma: number, orientation = 0) => ({ beta, gamma, orientation });

function hold(rest: TiltRest, beta: number, gamma: number, samples: number) {
  let state = rest;
  let last = { lambda: 0, phi: 0 };
  for (let i = 0; i < samples; i++) {
    const step = tiltStep(state, at(beta, gamma));
    state = step.rest;
    last = step;
  }
  return { rest: state, ...last };
}

describe('tiltStep', () => {
  it('takes the first sample as level, however the phone is held', () => {
    const { rest, lambda, phi } = tiltStep(NO_REST, at(1.2, -0.4));
    expect(rest).toEqual({ pitch: 1.2, roll: -0.4 });
    expect(lambda).toBe(0);
    expect(phi).toBe(0);
  });

  it('turns the globe with a sideways tip and a tip towards the traveller', () => {
    const rest = { pitch: 1, roll: 0 };
    const side = tiltStep(rest, at(1, 0.1));
    expect(side.lambda).toBeCloseTo(0.09);
    expect(side.phi).toBeCloseTo(0);
    const up = tiltStep(rest, at(1.1, 0));
    expect(up.phi).toBeCloseTo(0.09);
    expect(up.lambda).toBeCloseTo(0);
  });

  it('never turns further than a glimpse', () => {
    const { lambda, phi } = tiltStep({ pitch: 0, roll: 0 }, at(-1.4, 1.5));
    expect(Math.abs(lambda)).toBe(TILT_MAX);
    expect(Math.abs(phi)).toBe(TILT_MAX);
  });

  it('settles back to level while the phone is held still', () => {
    const held = hold({ pitch: 1, roll: 0 }, 1.25, 0.2, 150);
    expect(Math.abs(held.lambda)).toBeLessThan(0.01);
    expect(Math.abs(held.phi)).toBeLessThan(0.01);
  });

  it('measures the roll the short way across ±π', () => {
    const { lambda } = tiltStep({ pitch: 0, roll: 3.1 }, at(0, -3.1));
    expect(lambda).toBeCloseTo((2 * Math.PI - 6.2) * 0.9);
  });

  it('follows the screen when the phone is turned on its side', () => {
    const rest = { pitch: 0, roll: 0 };
    expect(tiltStep(rest, at(0.1, 0, 90)).lambda).toBeCloseTo(0.09);
    expect(tiltStep(rest, at(0, 0.1, 90)).phi).toBeCloseTo(-0.09);
    expect(tiltStep(rest, at(0, 0.1, 180)).lambda).toBeCloseTo(-0.09);
  });
});
