import { vi } from 'vitest';

// Mock global fetch to avoid real network calls and retry delays in tests.
// Returns a 503 immediately so getJupiterQuote falls through quickly.
vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('mocked: no network in tests')));
