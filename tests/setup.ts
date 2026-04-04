import { vi } from 'vitest';

// Mock global fetch to avoid real network calls in tests.
vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('mocked: no network in tests')));

// Speed up retry delays in tests — make setTimeout resolve instantly.
const _origSetTimeout = globalThis.setTimeout;
vi.stubGlobal('setTimeout', (fn: Function, _ms?: number, ...args: any[]) => {
  return _origSetTimeout(fn, 0, ...args);
});
