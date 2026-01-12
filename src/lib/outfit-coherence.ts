/**
 * Outfit Coherence Filter
 *
 * Filters out combos that are incoherent wardrobe↔wardrobe,
 * even if both pieces individually pair "OK" with the scanned item.
 *
 * Phase 1 Rules:
 * - S1: Bottom/Dress ↔ Shoes big formality clash (REJECT unless exception vibe)
 * - S2: Sporty bottom/dress + heels (REJECT always)
 * - TB1: Top ↔ Bottom big formality clash (REJECT unless exception vibe)
 * - S3: Formal bottom/dress + athletic shoes (DEMOTE, not reject)
 *
 * @see docs/outfit-selection-pipeline.md for full documentation
 */

import type { WardrobeItem } from './types';
import type { AssembledCombo } from './combo-assembler';
import { wardrobeItemToConfidenceItem } from './confidence-engine/integration';

// ============================================
// TYPES
// ============================================

export type FormalityBand = 0 | 1 | 2; // 0=casual, 1=smart-casual, 2=formal

export type CoherenceRejectReason =
  | 'S1_FORMALITY_CLASH'
  | 'S2_SPORTY_HEELS'
  | 'TB1_TOP_BOTTOM_CLASH';

export type CoherenceResult =
  | { ok: true; penalty: 0 | 1; reasons: string[] }
  | { ok: false; reason: CoherenceRejectReason; details: string };

// ============================================
// KEYWORD SETS
// ============================================

// Formal shoe keywords (heels, dress shoes)
const FORMAL_SHOE_KEYWORDS = new Set([
  'heel',
  'heels',
  'stiletto',
  'stilettos',
  'pump',
  'pumps',
  'high heel',
  'kitten heel',
  'oxford',
  'oxfords',
  'derby',
  'derbys',
  'dress shoe',
  'dress shoes',
  'court shoe',
  'court shoes',
]);

// Heel-specific keywords (subset of formal, for S2)
const HEEL_KEYWORDS = new Set([
  'heel',
  'heels',
  'stiletto',
  'stilettos',
  'pump',
  'pumps',
  'high heel',
  'kitten heel',
]);

// Athletic shoe keywords
const ATHLETIC_SHOE_KEYWORDS = new Set([
  'sneaker',
  'sneakers',
  'trainer',
  'trainers',
  'running',
  'runner',
  'runners',
  'basketball',
  'tennis shoe',
  'tennis shoes',
  'athletic',
  'sport',
  'gym',
]);

// Sporty item keywords (for styleNotes)
const SPORTY_KEYWORDS = new Set([
  'sporty',
  'athleisure',
  'athletic',
  'activewear',
  'jogger',
  'joggers',
  'track',
  'sweatpant',
  'sweatpants',
  'legging',
  'leggings',
  'gym',
  'workout',
]);

// Sporty style tags
const SPORTY_STYLE_TAGS = new Set([
  'sporty',
]);

// Exception vibe keywords (bypass formality clash rules)
const EXCEPTION_VIBE_KEYWORDS = new Set([
  'streetwear',
  'edgy',
  'fashion-forward',
  'statement',
  'avant-garde',
  'avant',
]);

// Exception style tags
const EXCEPTION_STYLE_TAGS = new Set([
  'street',
]);

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get formality band from formality level (1-5).
 * Returns null if level is missing (avoid false positives).
 */
export function formalityBand(level?: number | null): FormalityBand | null {
  if (level == null) return null;
  if (level <= 2) return 0; // casual
  if (level === 3) return 1; // smart-casual
  return 2; // formal
}

/**
 * Get the "hay" string to search for keywords.
 * Combines detectedLabel and styleNotes.
 */
function getSearchableText(item: WardrobeItem): string {
  const parts: string[] = [];
  if (item.detectedLabel) parts.push(item.detectedLabel);
  if (item.styleNotes) parts.push(...item.styleNotes);
  return parts.join(' ').toLowerCase();
}

/**
 * Check if text contains any keyword from the set.
 */
function containsAnyKeyword(text: string, keywords: Set<string>): boolean {
  for (const keyword of keywords) {
    if (text.includes(keyword)) return true;
  }
  return false;
}

/**
 * Check if item is a formal shoe (heels, dress shoes).
 */
export function isFormalShoe(item: WardrobeItem): boolean {
  if (item.category !== 'shoes') return false;
  const hay = getSearchableText(item);
  return containsAnyKeyword(hay, FORMAL_SHOE_KEYWORDS);
}

/**
 * Check if item is specifically heels (for S2 rule).
 */
export function isHeelShoe(item: WardrobeItem): boolean {
  if (item.category !== 'shoes') return false;
  const hay = getSearchableText(item);
  return containsAnyKeyword(hay, HEEL_KEYWORDS);
}

/**
 * Check if item is an athletic shoe (sneakers, trainers).
 */
export function isAthleticShoe(item: WardrobeItem): boolean {
  if (item.category !== 'shoes') return false;
  const hay = getSearchableText(item);
  return containsAnyKeyword(hay, ATHLETIC_SHOE_KEYWORDS);
}

/**
 * Check if shoe type could be inferred (for dev logging).
 */
export function hasInferrableShoeType(item: WardrobeItem): boolean {
  return isFormalShoe(item) || isAthleticShoe(item);
}

/**
 * Check if item is sporty (athleisure, activewear).
 */
export function isSportyItem(item: WardrobeItem): boolean {
  // Check userStyleTags
  if (item.userStyleTags?.some(tag => SPORTY_STYLE_TAGS.has(tag))) {
    return true;
  }
  
  // Check styleNotes
  const hay = getSearchableText(item);
  return containsAnyKeyword(hay, SPORTY_KEYWORDS);
}

/**
 * Check if item has an exception vibe (streetwear, edgy).
 * These vibes bypass formality clash rules (S1, TB1).
 */
export function hasExceptionVibe(item: WardrobeItem): boolean {
  // Check userStyleTags
  if (item.userStyleTags?.some(tag => EXCEPTION_STYLE_TAGS.has(tag))) {
    return true;
  }
  
  // Check styleNotes
  const hay = getSearchableText(item);
  return containsAnyKeyword(hay, EXCEPTION_VIBE_KEYWORDS);
}

/**
 * Get formality level for a wardrobe item using CE inference.
 */
export function getItemFormalityLevel(item: WardrobeItem): number | null {
  const confidenceItem = wardrobeItemToConfidenceItem(item);
  return confidenceItem.formality_level ?? null;
}

// ============================================
// COHERENCE CHECK
// ============================================

/**
 * Check outfit coherence for a single combo.
 *
 * @param combo - The assembled combo to check
 * @param wardrobeById - Map of wardrobe items by ID
 * @returns Coherence result (ok + penalty, or rejected with reason)
 */
export function checkOutfitCoherence(
  combo: AssembledCombo,
  wardrobeById: Map<string, WardrobeItem>
): CoherenceResult {
  const reasons: string[] = [];
  let penalty = 0;

  // Get items from combo
  const bottomId = combo.slots.BOTTOM;
  const dressId = combo.slots.DRESS;
  const shoesId = combo.slots.SHOES;
  const topId = combo.slots.TOP;

  const bottomOrDress = bottomId
    ? wardrobeById.get(bottomId)
    : dressId
      ? wardrobeById.get(dressId)
      : null;
  const shoes = shoesId ? wardrobeById.get(shoesId) : null;
  const top = topId ? wardrobeById.get(topId) : null;

  // Can't check coherence without items
  if (!bottomOrDress || !shoes) {
    return { ok: true, penalty: 0, reasons: [] };
  }

  // Get formality bands
  const bottomBand = formalityBand(getItemFormalityLevel(bottomOrDress));
  const shoesBand = formalityBand(getItemFormalityLevel(shoes));
  const topBand = top ? formalityBand(getItemFormalityLevel(top)) : null;

  // Check for exception vibes (bypass S1 and TB1)
  const hasException =
    hasExceptionVibe(bottomOrDress) ||
    hasExceptionVibe(shoes) ||
    (top ? hasExceptionVibe(top) : false);

  // ─────────────────────────────────────────────
  // S2: Sporty bottom/dress + heels (ALWAYS REJECT)
  // This is the "money shot" - no exception bypass
  // ─────────────────────────────────────────────
  if (isSportyItem(bottomOrDress) && isHeelShoe(shoes)) {
    return {
      ok: false,
      reason: 'S2_SPORTY_HEELS',
      details: `Sporty ${bottomOrDress.category} (${bottomOrDress.detectedLabel ?? 'unknown'}) + heels (${shoes.detectedLabel ?? 'unknown'})`,
    };
  }

  // ─────────────────────────────────────────────
  // S1: Bottom/Dress ↔ Shoes big formality clash (REJECT unless exception vibe)
  // EXCEPTION: If formal bottom + athletic shoes, apply S3 (demote) instead of S1 (reject)
  // ─────────────────────────────────────────────
  if (bottomBand !== null && shoesBand !== null) {
    const bandDiff = Math.abs(bottomBand - shoesBand);
    if (bandDiff >= 2 && !hasException) {
      // Check if this is the S3 case: formal bottom + athletic shoes
      // If so, don't reject - S3 will handle it with a demote
      const isS3Case = bottomBand === 2 && isAthleticShoe(shoes);
      if (!isS3Case) {
        return {
          ok: false,
          reason: 'S1_FORMALITY_CLASH',
          details: `Bottom/dress formality (band ${bottomBand}) vs shoes (band ${shoesBand}), diff=${bandDiff}`,
        };
      }
    }
  }

  // ─────────────────────────────────────────────
  // TB1: Top ↔ Bottom big formality clash (REJECT unless exception vibe)
  // ─────────────────────────────────────────────
  if (top && topBand !== null && bottomBand !== null) {
    const bandDiff = Math.abs(topBand - bottomBand);
    if (bandDiff >= 2 && !hasException) {
      return {
        ok: false,
        reason: 'TB1_TOP_BOTTOM_CLASH',
        details: `Top formality (band ${topBand}) vs bottom (band ${bottomBand}), diff=${bandDiff}`,
      };
    }
  }

  // ─────────────────────────────────────────────
  // S3: Formal bottom/dress + athletic shoes (DEMOTE, not reject)
  // ─────────────────────────────────────────────
  if (bottomBand === 2 && isAthleticShoe(shoes)) {
    penalty = 1;
    reasons.push('S3_FORMAL_WITH_ATHLETIC');
  }

  return { ok: true, penalty: penalty as 0 | 1, reasons };
}

// ============================================
// FILTER FUNCTION
// ============================================

export interface FilteredCombosResult {
  /** Combos that passed coherence check */
  combos: AssembledCombo[];
  /** Penalty scores by combo ID (for sorting) */
  penaltyById: Map<string, number>;
  /** Count of rejected combos (for dev logging) */
  rejectedCount: number;
  /** Rejection reasons (for dev logging) */
  rejectionLog: Array<{ comboId: string; reason: CoherenceRejectReason; details: string }>;
  /** Count by reason (for monitoring, e.g., TB1 false-positive rate) */
  rejectionsByReason: Map<CoherenceRejectReason, number>;
}

/**
 * Filter out incoherent combos and track penalties.
 *
 * @param combos - All assembled combos
 * @param wardrobeItems - Wardrobe items for lookup
 * @returns Filtered combos with penalty info
 */
export function filterIncoherentCombos(
  combos: AssembledCombo[],
  wardrobeItems: WardrobeItem[]
): FilteredCombosResult {
  // Build lookup map
  const wardrobeById = new Map<string, WardrobeItem>();
  for (const item of wardrobeItems) {
    wardrobeById.set(item.id, item);
  }

  const passedCombos: AssembledCombo[] = [];
  const penaltyById = new Map<string, number>();
  const rejectionLog: FilteredCombosResult['rejectionLog'] = [];

  for (const combo of combos) {
    const result = checkOutfitCoherence(combo, wardrobeById);

    if (result.ok) {
      passedCombos.push(combo);
      if (result.penalty > 0) {
        penaltyById.set(combo.id, result.penalty);
      }
    } else {
      rejectionLog.push({
        comboId: combo.id,
        reason: result.reason,
        details: result.details,
      });
    }
  }

  // Dev logging
  if (isDev) {
    if (rejectionLog.length > 0) {
      console.log('[OutfitCoherence] Rejected combos:', rejectionLog);
    } else {
      console.log('[OutfitCoherence] Filter ran: 0 combos rejected, all passed coherence checks');
    }
  }

  // Dev logging for ambiguous shoe inference (with counter for coverage tracking)
  if (isDev) {
    const shoeItems = wardrobeItems.filter(i => i.category === 'shoes');
    const ambiguousShoes = shoeItems.filter(shoe => !hasInferrableShoeType(shoe));
    if (ambiguousShoes.length > 0) {
      console.log(
        `[OutfitCoherence] ambiguousShoesCount=${ambiguousShoes.length}/${shoeItems.length}`,
        ambiguousShoes.map(s => ({ id: s.id, label: s.detectedLabel, notes: s.styleNotes }))
      );
    }
  }

  // Count rejections by reason (for monitoring TB1 false-positive rate)
  const rejectionsByReason = new Map<CoherenceRejectReason, number>();
  for (const entry of rejectionLog) {
    rejectionsByReason.set(entry.reason, (rejectionsByReason.get(entry.reason) ?? 0) + 1);
  }

  return {
    combos: passedCombos,
    penaltyById,
    rejectedCount: rejectionLog.length,
    rejectionLog,
    rejectionsByReason,
  };
}

// ============================================
// DEV HELPERS
// ============================================

// Use typeof check to avoid ReferenceError in test environments
const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

