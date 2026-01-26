/**
 * AI Safety - Signals Hash
 *
 * Creates a deterministic, confidence-free hash of style signals
 * for cache key generation. This allows verdicts to be reused
 * when the same signals are encountered (even with different confidence values).
 */

import type { StyleSignalsV1 } from '../trust-filter/types';

/**
 * Simple deterministic hash function (djb2 algorithm)
 * Fast and sufficient for cache key generation (not cryptographic)
 */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  // Convert to positive hex string
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Generate a deterministic hash of style signals (confidence-free)
 *
 * The hash excludes confidence values so that the same visual signals
 * produce the same hash regardless of model confidence. This maximizes
 * cache hit rates for AI Safety verdicts.
 *
 * @param signals - Style signals to hash
 * @returns Deterministic hash string
 */
export function signalsHash(signals: StyleSignalsV1 | null | undefined): string {
  if (!signals) {
    return 'no_signals';
  }

  // Normalize palette: dedupe and sort for determinism
  const palette = Array.from(
    new Set(signals.palette?.colors ?? [])
  ).sort();

  // Build canonical object (confidence-free, sorted fields)
  const canonical = {
    v: signals.version ?? 1,
    a: {
      p: signals.aesthetic?.primary ?? 'unknown',
      s: signals.aesthetic?.secondary ?? 'none',
    },
    f: signals.formality?.band ?? 'unknown',
    st: signals.statement?.level ?? 'unknown',
    se: signals.season?.heaviness ?? 'unknown',
    pt: signals.pattern?.level ?? 'unknown',
    m: signals.material?.family ?? 'unknown',
    pa: palette,
  };

  // Generate hash from JSON string
  return djb2Hash(JSON.stringify(canonical));
}
