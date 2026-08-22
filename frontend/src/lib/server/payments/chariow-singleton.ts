// Lazy-init Chariow provider + its OWN module-level CircuitBreaker — kept
// separate from Bictorys' breaker (provider-singleton.ts) so a Chariow
// outage never trips Bictorys' circuit and vice versa. Mirrors
// provider-singleton.ts exactly; see that file's comments for the "why
// lazy" / "why a shared breaker" rationale.
import { createChariowProvider, type ChariowProviderHandle } from '@/lib/server/payments/chariow';
import { CircuitBreaker } from '@/lib/server/payments/circuit-breaker';

export class ChariowProviderUnconfiguredError extends Error {
  constructor() {
    super(
      'Chariow provider not configured (CHARIOW_API_URL/_API_KEY/_WEBHOOK_SECRET/_PRODUCT_ID_* missing or empty)',
    );
    this.name = 'ChariowProviderUnconfiguredError';
  }
}

let _provider: ChariowProviderHandle | null = null;

export function getChariowProvider(): ChariowProviderHandle {
  if (_provider) return _provider;

  const url = process.env.CHARIOW_API_URL ?? '';
  const key = process.env.CHARIOW_API_KEY ?? '';
  const webhookSecret = process.env.CHARIOW_WEBHOOK_SECRET ?? '';
  const standard = process.env.CHARIOW_PRODUCT_ID_STANDARD ?? '';
  const premium = process.env.CHARIOW_PRODUCT_ID_PREMIUM ?? '';
  const annuel = process.env.CHARIOW_PRODUCT_ID_ANNUEL ?? '';

  if (!url || !key || !webhookSecret || !standard || !premium || !annuel) {
    throw new ChariowProviderUnconfiguredError();
  }

  _provider = createChariowProvider({
    CHARIOW_API_URL: url,
    CHARIOW_API_KEY: key,
    CHARIOW_WEBHOOK_SECRET: webhookSecret,
    CHARIOW_PRODUCT_ID_STANDARD: standard,
    CHARIOW_PRODUCT_ID_PREMIUM: premium,
    CHARIOW_PRODUCT_ID_ANNUEL: annuel,
  });
  return _provider;
}

/** Separate breaker instance — same thresholds as Bictorys' for consistency. */
export const chariowBreaker = new CircuitBreaker({
  name: 'chariow.charge',
  failureThreshold: 5,
  windowMs: 30_000,
  cooldownMs: 60_000,
});

/** Test-only escape hatch — see provider-singleton.ts's identical helper. @internal */
export function __resetChariowProviderSingleton(): void {
  _provider = null;
}
