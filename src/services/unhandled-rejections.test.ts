import { Observe } from 'expo-observe';

import { reportUnhandledRejections } from './unhandled-rejections';

jest.mock('expo-observe', () => ({ Observe: { reportError: jest.fn() } }));

type Options = { onUnhandled: (id: number, rejection: unknown) => void };

function install(isDev = false) {
  let options: Options | undefined;
  const hermes = { enablePromiseRejectionTracker: jest.fn((o: Options) => { options = o; }) };
  reportUnhandledRejections(hermes, isDev);
  return { hermes, reject: (rejection: unknown) => options!.onUnhandled(1, rejection) };
}

beforeEach(() => jest.mocked(Observe.reportError).mockClear());

it('leaves development to React Native’s own tracker', () => {
  const { hermes } = install(true);
  expect(hermes.enablePromiseRejectionTracker).not.toHaveBeenCalled();
});

it('reports an uncaught rejection in a release build', () => {
  const { reject } = install();
  const error = new TypeError('Network request failed');
  reject(error);
  expect(Observe.reportError).toHaveBeenCalledWith(error);
});

it('wraps a non-Error rejection so it carries a message', () => {
  const { reject } = install();
  reject('quota');
  expect(jest.mocked(Observe.reportError).mock.calls[0]![0]).toEqual(new Error('Unhandled rejection: quota'));
});

it('reports a repeating rejection once and caps the session', () => {
  const { reject } = install();
  for (let i = 0; i < 5; i++) reject(new Error('poll failed'));
  expect(Observe.reportError).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 40; i++) reject(new Error(`distinct ${i}`));
  expect(Observe.reportError).toHaveBeenCalledTimes(20);
});

it('does nothing on an engine without the tracker (web)', () => {
  expect(() => reportUnhandledRejections(undefined, false)).not.toThrow();
});
