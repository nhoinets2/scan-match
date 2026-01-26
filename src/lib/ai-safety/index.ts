/**
 * AI Safety Module
 *
 * Targeted LLM-based sanity check for borderline Trust Filter results.
 * Runs after Confidence Engine + Trust Filter to veto/demote obvious mismatches
 * that deterministic rules missed.
 *
 * Usage:
 *   import { aiSafetyCheckBatch, shouldRunAiSafety, inRollout } from '@/lib/ai-safety';
 */

// Hash function for cache keys
export { signalsHash } from './signalsHash';

// Rollout bucketing
export { inRollout, getUserBucket } from './rollout';

// Trigger conditions
export { shouldRunAiSafety, shouldRunAiSafetyExtended } from './shouldRun';
export type { ShouldRunInput } from './shouldRun';

// Client wrapper
export { aiSafetyCheckBatch, computePairType } from './client';
export type {
  AiSafetyPairInput,
  AiSafetyVerdict,
  AiSafetyResponse,
} from './client';
