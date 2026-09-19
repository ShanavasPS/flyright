import { useSyncExternalStore } from 'react';

/** A one-off confirmation carried across a navigation: a screen that closes
 * on success (the update composer) leaves it here, and the screen it lands
 * on shows it once and takes it. Memory only. */
export interface Flash {
  id: number;
  title: string;
  detail: string | null;
}

let current: Flash | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function showFlash(title: string, detail: string | null = null) {
  current = { id: nextId++, title, detail };
  emit();
}

/** Clears the flash — only that one, so a newer flash is never swallowed
 * by the timer of an older one. */
export function dismissFlash(id: number) {
  if (current?.id !== id) return;
  current = null;
  emit();
}

const read = () => current;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFlash(): Flash | null {
  return useSyncExternalStore(subscribe, read, read);
}
