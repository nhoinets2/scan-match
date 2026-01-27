/**
 * AI Safety Module
 *
 * Targeted LLM-based sanity check for borderline Trust Filter results.
 * Runs after Confidence Engine + Trust Filter to veto/demote obvious mismatches
 * that deterministic rules missed.
 *
 * Usage:
 *   import { aiSafetyCheckBatch, shouldRunAiSafety, inRollout } from '@/lib/ai-safety';
 *
 * Initialization (call at app startup for pre-login rollout support):
 *   import { initAnonId } from '@/lib/ai-safety';
 *   await initAnonId();
 */

// Hash function for cache keys
export { signalsHash } from './signalsHash';

// Rollout bucketing
export { inRollout, getUserBucket } from './rollout';

// Anonymous ID for pre-login rollout
export { initAnonId, getOrCreateAnonId, getCachedAnonId, clearAnonId } from './anonId';

// Trigger conditions
export { shouldRunAiSafety, shouldRunAiSafetyExtended } from './shouldRun';
export type { ShouldRunInput } from './shouldRun';

// Client wrapper
export { aiSafetyCheckBatch, computePairType, AI_SAFETY_POLICY_VERSION } from './client';
export type {
  AiSafetyPairInput,
  AiSafetyVerdict,
  AiSafetyResponse,
} from './client';
