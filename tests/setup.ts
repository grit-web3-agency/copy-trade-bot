import { vi } from 'vitest';

// Shim jest globals so test files written for Jest work under Vitest.
const jestShim = {
  fn: vi.fn,
  mock: vi.mock,
  spyOn: vi.spyOn,
  resetAllMocks: vi.resetAllMocks,
  clearAllMocks: vi.clearAllMocks,
  Mock: undefined as any, // type-only usage; vi.fn() instances satisfy jest.Mock at runtime
};
vi.stubGlobal('jest', jestShim);

// Mock global fetch to avoid real network calls in tests.
vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('mocked: no network in tests')));

// Speed up retry delays in tests — make setTimeout resolve instantly.
const _origSetTimeout = globalThis.setTimeout;
vi.stubGlobal('setTimeout', (fn: Function, _ms?: number, ...args: any[]) => {
  return _origSetTimeout(fn, 0, ...args);
});
