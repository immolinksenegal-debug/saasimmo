import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getChariowProvider,
  ChariowProviderUnconfiguredError,
  __resetChariowProviderSingleton,
} from './chariow-singleton';

beforeEach(() => {
  __resetChariowProviderSingleton();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetChariowProviderSingleton();
});

describe('getChariowProvider', () => {
  it('throws ChariowProviderUnconfiguredError when env is missing', () => {
    expect(() => getChariowProvider()).toThrow(ChariowProviderUnconfiguredError);
  });

  it('returns a cached provider once env is present', () => {
    vi.stubEnv('CHARIOW_API_URL', 'https://api.chariow.test/v1');
    vi.stubEnv('CHARIOW_API_KEY', 'k');
    vi.stubEnv('CHARIOW_WEBHOOK_SECRET', 's');
    vi.stubEnv('CHARIOW_PRODUCT_ID_STANDARD', 'p1');
    vi.stubEnv('CHARIOW_PRODUCT_ID_PREMIUM', 'p2');
    vi.stubEnv('CHARIOW_PRODUCT_ID_ANNUEL', 'p3');

    const first = getChariowProvider();
    const second = getChariowProvider();
    expect(first).toBe(second); // same cached instance
    expect(first.name).toBe('chariow');
  });
});
