/**
 * Analysis Cache Unit Tests
 *
 * Tests for cache key determinism and automatic invalidation.
 * These are pure unit tests that don't require Supabase.
 */

import { createHash } from 'crypto';

// ============================================
// INLINE PURE FUNCTIONS (avoid Supabase import issues)
// ============================================

// These constants must match analysis-cache.ts
const ANALYSIS_CACHE_VERSION = 'v1';
const PROMPT_VERSION = '2026-01-05';
const ANALYSIS_MODEL = 'claude-sonnet-4.5';

/**
 * Compute SHA-256 hash of a string (Node.js version for tests)
 * This mirrors the expo-crypto implementation in analysis-cache.ts
 */
async function sha256Hex(data: string): Promise<string> {
  // Use Node's crypto module (same algorithm as expo-crypto)
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a versioned cache key (copied from analysis-cache.ts)
 */
function generateCacheKey(imageSha256: string): string {
  return `${ANALYSIS_CACHE_VERSION}:${ANALYSIS_MODEL}:${PROMPT_VERSION}:${imageSha256}`;
}

// ============================================
// SHA-256 DETERMINISM TESTS
// ============================================

describe('sha256Hex', () => {
  it('produces deterministic hashes (same input → same output)', async () => {
    const input = 'data:image/jpeg;base64,/9j/4AAQSkZJRg...';
    
    const hash1 = await sha256Hex(input);
    const hash2 = await sha256Hex(input);
    
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
  });

  it('produces different hashes for different inputs', async () => {
    const input1 = 'data:image/jpeg;base64,ABC123';
    const input2 = 'data:image/jpeg;base64,XYZ789';
    
    const hash1 = await sha256Hex(input1);
    const hash2 = await sha256Hex(input2);
    
    expect(hash1).not.toBe(hash2);
  });

  it('handles empty string', async () => {
    const hash = await sha256Hex('');
    
    // Empty string has a known SHA-256 hash
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('produces lowercase hex output', async () => {
    const hash = await sha256Hex('test');
    
    expect(hash).toBe(hash.toLowerCase());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles unicode content', async () => {
    const input = 'Hello 世界 🌍';
    const hash = await sha256Hex(input);
    
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles large base64 strings', async () => {
    // Simulate a large image base64 (100KB)
    const largeInput = 'data:image/jpeg;base64,' + 'A'.repeat(100000);
    const hash = await sha256Hex(largeInput);
    
    expect(hash).toHaveLength(64);
  });
});

// ============================================
// CACHE KEY GENERATION TESTS
// ============================================

describe('generateCacheKey', () => {
  it('produces deterministic keys (same hash → same key)', () => {
    const imageSha = 'abc123def456';
    
    const key1 = generateCacheKey(imageSha);
    const key2 = generateCacheKey(imageSha);
    
    expect(key1).toBe(key2);
  });

  it('includes version, model, and prompt version in key', () => {
    const imageSha = 'abc123def456';
    const key = generateCacheKey(imageSha);
    
    expect(key).toContain(ANALYSIS_CACHE_VERSION);
    expect(key).toContain(ANALYSIS_MODEL);
    expect(key).toContain(PROMPT_VERSION);
    expect(key).toContain(imageSha);
  });

  it('uses colon as delimiter', () => {
    const imageSha = 'abc123def456';
    const key = generateCacheKey(imageSha);
    
    const parts = key.split(':');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe(ANALYSIS_CACHE_VERSION);
    expect(parts[1]).toBe(ANALYSIS_MODEL);
    expect(parts[2]).toBe(PROMPT_VERSION);
    expect(parts[3]).toBe(imageSha);
  });

  it('produces different keys for different hashes', () => {
    const key1 = generateCacheKey('hash1');
    const key2 = generateCacheKey('hash2');
    
    expect(key1).not.toBe(key2);
  });
});

// ============================================
// CACHE INVALIDATION CONTRACT TESTS
// ============================================

describe('Cache key invalidation', () => {
  it('changing ANALYSIS_CACHE_VERSION would change the key', () => {
    // This test documents the cache invalidation mechanism
    // When ANALYSIS_CACHE_VERSION changes, all old keys become invalid
    const imageSha = 'abc123';
    const currentKey = generateCacheKey(imageSha);
    
    // Simulate what would happen with a different version
    const oldVersionKey = `v0:${ANALYSIS_MODEL}:${PROMPT_VERSION}:${imageSha}`;
    
    expect(currentKey).not.toBe(oldVersionKey);
    expect(currentKey.startsWith(ANALYSIS_CACHE_VERSION)).toBe(true);
  });

  it('changing PROMPT_VERSION would change the key', () => {
    // Document: bumping PROMPT_VERSION invalidates all cached analyses
    const imageSha = 'abc123';
    const currentKey = generateCacheKey(imageSha);
    
    // Simulate what would happen with a different prompt version
    const oldPromptKey = `${ANALYSIS_CACHE_VERSION}:${ANALYSIS_MODEL}:2025-01-01:${imageSha}`;
    
    expect(currentKey).not.toBe(oldPromptKey);
    expect(currentKey).toContain(PROMPT_VERSION);
  });

  it('changing ANALYSIS_MODEL would change the key', () => {
    // Document: changing model invalidates all cached analyses
    const imageSha = 'abc123';
    const currentKey = generateCacheKey(imageSha);
    
    // Simulate what would happen with a different model
    const oldModelKey = `${ANALYSIS_CACHE_VERSION}:gpt-4o:${PROMPT_VERSION}:${imageSha}`;
    
    expect(currentKey).not.toBe(oldModelKey);
    expect(currentKey).toContain(ANALYSIS_MODEL);
  });
});

// ============================================
// END-TO-END DETERMINISM CONTRACT
// ============================================

describe('End-to-end cache key determinism', () => {
  it('same image bytes → same cache key', async () => {
    const imageData = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...';
    
    // Simulate two separate scans of the same image
    const hash1 = await sha256Hex(imageData);
    const key1 = generateCacheKey(hash1);
    
    const hash2 = await sha256Hex(imageData);
    const key2 = generateCacheKey(hash2);
    
    expect(key1).toBe(key2);
  });

  it('different image bytes → different cache key', async () => {
    const image1 = 'data:image/jpeg;base64,AAAA';
    const image2 = 'data:image/jpeg;base64,BBBB';
    
    const key1 = generateCacheKey(await sha256Hex(image1));
    const key2 = generateCacheKey(await sha256Hex(image2));
    
    expect(key1).not.toBe(key2);
  });

  it('tiny change in image bytes → different cache key', async () => {
    // Even a single bit difference should produce a different key
    const image1 = 'data:image/jpeg;base64,ABCDEFG';
    const image2 = 'data:image/jpeg;base64,ABCDEFH'; // One char different
    
    const key1 = generateCacheKey(await sha256Hex(image1));
    const key2 = generateCacheKey(await sha256Hex(image2));
    
    expect(key1).not.toBe(key2);
  });
});

// ============================================
// CONFIGURATION TESTS
// ============================================

describe('Cache configuration', () => {
  it('ANALYSIS_CACHE_VERSION is a valid version string', () => {
    expect(ANALYSIS_CACHE_VERSION).toMatch(/^v\d+$/);
  });

  it('PROMPT_VERSION follows expected format', () => {
    // Should be YYYY-MM-DD or semver-like
    expect(PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$|^\d+\.\d+\.\d+$/);
  });

  it('ANALYSIS_MODEL is a non-empty string', () => {
    expect(ANALYSIS_MODEL).toBeTruthy();
    expect(typeof ANALYSIS_MODEL).toBe('string');
    expect(ANALYSIS_MODEL.length).toBeGreaterThan(0);
  });
});

