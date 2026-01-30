/**
 * ComboAssembler v0
 *
 * Assembles outfit combos from ConfidenceEngine-ranked items.
 * This is a pure "assembly + arrangement" layer - NO re-scoring.
 * All scoring comes from ConfidenceEngine.
 *
 * Key principles:
 * 1. CE is the single source of truth for item compatibility
 * 2. ComboAssembler just picks, arranges, and ranks using CE scores
 * 3. Minimal constraints (no duplicate items, valid slot fill)
 * 4. Stable, deterministic output
 */

import type { Category } from './types';
import type { PairEvaluation, ConfidenceTier } from './confidence-engine';

// ============================================
// TYPES
// ============================================

/**
 * Canonical outfit slots.
 * Maps to categories but provides a stable slot schema.
 * DRESS is a special slot that replaces TOP+BOTTOM.
 */
export type OutfitSlot = 'TOP' | 'BOTTOM' | 'SHOES' | 'OUTERWEAR' | 'DRESS';

/**
 * A candidate for a slot, derived from CE evaluation.
 */
export interface SlotCandidate {
  itemId: string;
  slot: OutfitSlot;
  tier: ConfidenceTier;
  score: number; // CE raw_score
  evaluation: PairEvaluation;
}

/**
 * Candidates grouped by slot.
 */
export interface CandidatesBySlot {
  TOP: SlotCandidate[];
  BOTTOM: SlotCandidate[];
  SHOES: SlotCandidate[];
  OUTERWEAR: SlotCandidate[];
  DRESS: SlotCandidate[];
}

/**
 * Optional outerwear decoration for a combo.
 * Doesn't affect tierFloor - it's a bonus layer.
 */
export interface OptionalOuterwear {
  /** The outerwear item ID */
  itemId: string;
  /** The outerwear's tier (for UI: "Add a layer (HIGH)") */
  tier: ConfidenceTier;
  /** The outerwear's CE score */
  score: number;
  /** The full candidate info */
  candidate: SlotCandidate;
}

/**
 * An assembled outfit combo.
 */
export interface AssembledCombo {
  /** Unique combo ID (deterministic from item IDs) */
  id: string;

  /** Items in each slot (itemId) - core outfit only */
  slots: {
    TOP?: string;
    BOTTOM?: string;
    SHOES?: string;
    DRESS?: string;
  };

  /** The SlotCandidates for each filled slot (core outfit) */
  candidates: SlotCandidate[];

  /** Minimum tier across CORE items (outerwear excluded) */
  tierFloor: ConfidenceTier;

  /** Average CE score across CORE items */
  avgScore: number;

  /** Reasons/explanations derived from CE (max 3-4) */
  reasons: string[];

  /**
   * Optional outerwear decoration.
   * Doesn't affect tierFloor - shown as "Layer" in UI.
   */
  optionalOuterwear?: OptionalOuterwear;
}

/**
 * Configuration for combo generation.
 */
export interface ComboAssemblerConfig {
  /** Max candidates per slot (caps combinatorics) */
  maxCandidatesPerSlot: number;

  /** Max combos to generate */
  maxCombos: number;

  /** Include LOW tier items as backfill? */
  includeLowTier: boolean;

  /** Max reasons per combo */
  maxReasonsPerCombo: number;
}

const DEFAULT_CONFIG: ComboAssemblerConfig = {
  maxCandidatesPerSlot: 10,
  maxCombos: 12,
  includeLowTier: false,
  maxReasonsPerCombo: 4,
};

// ============================================
// SLOT MAPPING
// ============================================

/**
 * Maps categories to slots.
 * Single source of truth for category → slot.
 */
const CATEGORY_TO_SLOT: Record<Category, OutfitSlot | null> = {
  tops: 'TOP',
  bottoms: 'BOTTOM',
  shoes: 'SHOES',
  outerwear: 'OUTERWEAR',
  dresses: 'DRESS', // Dresses get their own slot (replaces TOP+BOTTOM conceptually)
  skirts: 'BOTTOM',
  bags: null, // Not a slot (accessory)
  accessories: null, // Not a slot
  unknown: null, // Non-fashion items
};

/**
 * Required slots for a complete outfit.
 */
const REQUIRED_SLOTS: OutfitSlot[] = ['TOP', 'BOTTOM', 'SHOES'];

/**
 * Optional slots that enhance an outfit.
 */
const OPTIONAL_SLOTS: OutfitSlot[] = ['OUTERWEAR'];

// ============================================
// TIER UTILITIES
// ============================================

const TIER_ORDER: Record<ConfidenceTier, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function tierToNumber(tier: ConfidenceTier): number {
  return TIER_ORDER[tier];
}

function numberToTier(n: number): ConfidenceTier {
  if (n >= 3) return 'HIGH';
  if (n >= 2) return 'MEDIUM';
  return 'LOW';
}

function minTier(tiers: ConfidenceTier[]): ConfidenceTier {
  if (tiers.length === 0) return 'LOW';
  const min = Math.min(...tiers.map(tierToNumber));
  return numberToTier(min);
}

/**
 * Compare tier floors for sorting (HIGH > MEDIUM > LOW).
 */
function compareTierFloors(a: ConfidenceTier, b: ConfidenceTier): number {
  return tierToNumber(b) - tierToNumber(a);
}

// ============================================
// TIER PATTERN GENERATION
// ============================================

/**
 * Cache for generated tier patterns.
 * Key: "slotCount|includeLowTier" (e.g., "2|0" or "3|1")
 */
const TIER_PATTERNS_CACHE = new Map<string, ConfidenceTier[][]>();

/**
 * Get tier patterns for a given slot count and includeLowTier setting.
 * Patterns are generated once and cached for performance.
 * 
 * This programmatic approach guarantees no missing permutations.
 */
export function getTierPatterns(slotCount: number, includeLowTier: boolean): ConfidenceTier[][] {
  const key = `${slotCount}|${includeLowTier ? 1 : 0}`;
  const cached = TIER_PATTERNS_CACHE.get(key);
  if (cached) return cached;

  const patterns = generateTierPatterns(slotCount, includeLowTier);
  TIER_PATTERNS_CACHE.set(key, patterns);
  return patterns;
}

/**
 * Generate all tier patterns for n slots, sorted by quality.
 * When includeLowTier=false, only generates patterns from ['HIGH', 'MEDIUM'].
 */
function generateTierPatterns(slotCount: number, includeLowTier: boolean): ConfidenceTier[][] {
  const TIERS: ConfidenceTier[] = includeLowTier
    ? ['HIGH', 'MEDIUM', 'LOW']
    : ['HIGH', 'MEDIUM'];

  const patterns: ConfidenceTier[][] = [];

  // Recursively generate all permutations
  function rec(prefix: ConfidenceTier[]): void {
    if (prefix.length === slotCount) {
      patterns.push([...prefix]);
      return;
    }
    for (const tier of TIERS) {
      rec([...prefix, tier]);
    }
  }

  rec([]);

  // Sort by quality: more HIGH first, fewer MEDIUM, fewer LOW
  const quality = (pattern: ConfidenceTier[]) => ({
    high: pattern.filter(t => t === 'HIGH').length,
    medium: pattern.filter(t => t === 'MEDIUM').length,
    low: pattern.filter(t => t === 'LOW').length,
  });

  patterns.sort((a, b) => {
    const A = quality(a);
    const B = quality(b);
    // More HIGH is better
    if (A.high !== B.high) return B.high - A.high;
    // Fewer MEDIUM is better (for same HIGH count)
    if (A.medium !== B.medium) return A.medium - B.medium;
    // Fewer LOW is better
    return A.low - B.low;
  });

  return patterns;
}

// ============================================
// STEP 1: BUILD CANDIDATES BY SLOT
// ============================================

/**
 * Given a scanned item category and CE evaluations, get the slot the scanned item fills.
 */
export function getScannedItemSlot(scannedCategory: Category): OutfitSlot | null {
  return CATEGORY_TO_SLOT[scannedCategory];
}

/**
 * Extract the wardrobe item's category from a PairEvaluation.
 * The pair_type encodes both categories (e.g., 'tops_bottoms').
 * We need external category info since PairEvaluation doesn't store it directly.
 */
function getWardrobeItemCategory(
  evaluation: PairEvaluation,
  wardrobeCategoryMap: Map<string, Category>
): Category | null {
  // item_b_id is typically the wardrobe item
  const category = wardrobeCategoryMap.get(evaluation.item_b_id);
  if (category) return category;

  // Fallback: check item_a_id
  return wardrobeCategoryMap.get(evaluation.item_a_id) ?? null;
}

/**
 * Build ranked candidate lists per slot from CE evaluations.
 *
 * @param scannedCategory - The category of the scanned item
 * @param evaluations - All CE evaluations (HIGH + MEDIUM, optionally LOW)
 * @param wardrobeCategoryMap - Map of itemId → category for wardrobe items
 * @param config - Assembly configuration
 */
export function buildCandidatesBySlot(
  scannedCategory: Category,
  evaluations: PairEvaluation[],
  wardrobeCategoryMap: Map<string, Category>,
  config: ComboAssemblerConfig = DEFAULT_CONFIG
): CandidatesBySlot {
  const candidates: CandidatesBySlot = {
    TOP: [],
    BOTTOM: [],
    SHOES: [],
    OUTERWEAR: [],
    DRESS: [],
  };

  // Slot filled by scanned item
  const scannedSlot = getScannedItemSlot(scannedCategory);

  for (const evaluation of evaluations) {
    // Skip LOW tier unless configured to include
    if (evaluation.confidence_tier === 'LOW' && !config.includeLowTier) {
      continue;
    }

    // Get wardrobe item category
    const wardrobeCategory = getWardrobeItemCategory(evaluation, wardrobeCategoryMap);
    if (!wardrobeCategory) {
      continue; // Can't determine category, skip
    }

    // Map to slot
    const slot = CATEGORY_TO_SLOT[wardrobeCategory];
    if (!slot) {
      continue; // Not a slotted category (bags, accessories, dresses)
    }

    // Skip if this slot is filled by the scanned item
    if (slot === scannedSlot) {
      continue;
    }

    // Get the wardrobe item ID
    const itemId = wardrobeCategoryMap.has(evaluation.item_b_id)
      ? evaluation.item_b_id
      : evaluation.item_a_id;

    const candidate: SlotCandidate = {
      itemId,
      slot,
      tier: evaluation.confidence_tier,
      score: evaluation.raw_score,
      evaluation,
    };

    candidates[slot].push(candidate);
  }

  // Sort each slot by tier (HIGH first), then by score (desc), then by itemId (stable)
  for (const slot of Object.keys(candidates) as OutfitSlot[]) {
    candidates[slot].sort((a, b) => {
      // Tier first (HIGH > MEDIUM > LOW)
      const tierDiff = compareTierFloors(a.tier, b.tier);
      if (tierDiff !== 0) return tierDiff;

      // Score second (higher is better)
      const scoreDiff = b.score - a.score;
      if (Math.abs(scoreDiff) > 0.001) return scoreDiff;

      // Stable tiebreaker: lexical itemId
      return a.itemId.localeCompare(b.itemId);
    });

    // Cap to max candidates
    candidates[slot] = candidates[slot].slice(0, config.maxCandidatesPerSlot);
  }

  return candidates;
}

// ============================================
// STEP 2: GENERATE COMBOS
// ============================================

/**
 * Determine which slots need to be filled for STANDARD track (TOP + BOTTOM + SHOES).
 */
export function getRequiredSlotsToFill(scannedCategory: Category): OutfitSlot[] {
  const scannedSlot = getScannedItemSlot(scannedCategory);

  // If scanned item is a dress, standard track requires only SHOES
  if (scannedSlot === 'DRESS') {
    return ['SHOES'];
  }

  // Filter out the slot the scanned item already fills
  return REQUIRED_SLOTS.filter(slot => slot !== scannedSlot);
}

/**
 * Determine which slots need to be filled for DRESS track (DRESS + SHOES).
 * Returns null if dress track is not applicable (e.g., scanning a dress already).
 */
export function getDressTrackSlotsToFill(scannedCategory: Category): OutfitSlot[] | null {
  const scannedSlot = getScannedItemSlot(scannedCategory);

  // If scanned item is a dress, we're already using dress - no separate dress track
  if (scannedSlot === 'DRESS') {
    return null;
  }

  // If scanned item is TOP or BOTTOM, dress track doesn't make sense (dress replaces them)
  if (scannedSlot === 'TOP' || scannedSlot === 'BOTTOM') {
    return null;
  }

  // For SHOES or OUTERWEAR scans, dress track = DRESS (+ scanned item)
  if (scannedSlot === 'SHOES') {
    return ['DRESS'];
  }

  if (scannedSlot === 'OUTERWEAR') {
    return ['DRESS', 'SHOES'];
  }

  return null;
}

/**
 * Check which required slots are missing candidates.
 */
export function getMissingSlotsInfo(
  candidates: CandidatesBySlot,
  requiredSlots: OutfitSlot[]
): { slot: OutfitSlot; category: string }[] {
  const missing: { slot: OutfitSlot; category: string }[] = [];

  const slotToCategory: Record<OutfitSlot, string> = {
    TOP: 'tops',
    BOTTOM: 'bottoms',
    SHOES: 'shoes',
    OUTERWEAR: 'outerwear',
    DRESS: 'dresses',
  };

  for (const slot of requiredSlots) {
    if (candidates[slot].length === 0) {
      missing.push({ slot, category: slotToCategory[slot] });
    }
  }

  return missing;
}

/**
 * Generate combos for a single track (standard or dress).
 * Uses tier bucket strategy.
 */
function generateTrackCombos(
  candidates: CandidatesBySlot,
  requiredSlots: OutfitSlot[],
  seenComboIds: Set<string>,
  config: ComboAssemblerConfig
): AssembledCombo[] {
  // Check if we can form any combos (need at least one candidate per required slot)
  for (const slot of requiredSlots) {
    if (candidates[slot].length === 0) {
      return []; // Can't form combos, missing required slot
    }
  }

  const combos: AssembledCombo[] = [];

  // Get tier patterns programmatically (cached, guarantees no missing permutations)
  // When includeLowTier=false, only patterns with HIGH/MEDIUM are generated
  const tierPatterns = getTierPatterns(requiredSlots.length, config.includeLowTier);

  // Generate combos pattern by pattern (ordered by quality)
  for (const tierPattern of tierPatterns) {
    if (combos.length >= config.maxCombos) break;

    // Get candidates matching this tier pattern for each required slot
    const slotCandidates: SlotCandidate[][] = requiredSlots.map((slot, idx) => {
      const targetTier = tierPattern[idx];
      if (!targetTier) return candidates[slot]; // Use all if pattern shorter than slots
      return candidates[slot].filter(c => c.tier === targetTier);
    });

    // Skip if any slot has no candidates for this tier pattern
    if (slotCandidates.some(sc => sc.length === 0)) {
      continue;
    }

    // Generate product of candidates (capped)
    const newCombos = generateProductCombos(
      requiredSlots,
      slotCandidates,
      seenComboIds,
      config.maxCombos - combos.length,
      config.maxReasonsPerCombo
    );

    combos.push(...newCombos);
  }

  return combos;
}

/**
 * Generate combos using tier bucket strategy.
 * Supports dual-track generation:
 * - Standard track: TOP + BOTTOM + SHOES
 * - Dress track: DRESS + SHOES (when applicable)
 * Both tracks are merged and ranked together.
 */
export function generateCombos(
  candidates: CandidatesBySlot,
  scannedCategory: Category,
  config: ComboAssemblerConfig = DEFAULT_CONFIG
): AssembledCombo[] {
  const seenComboIds = new Set<string>();
  const allCombos: AssembledCombo[] = [];

  // Standard track
  const standardSlots = getRequiredSlotsToFill(scannedCategory);
  const standardCombos = generateTrackCombos(candidates, standardSlots, seenComboIds, config);
  allCombos.push(...standardCombos);

  // Dress track (if applicable)
  const dressSlots = getDressTrackSlotsToFill(scannedCategory);
  if (dressSlots && allCombos.length < config.maxCombos) {
    const remainingLimit = config.maxCombos - allCombos.length;
    const dressConfig = { ...config, maxCombos: remainingLimit };
    const dressCombos = generateTrackCombos(candidates, dressSlots, seenComboIds, dressConfig);
    allCombos.push(...dressCombos);
  }

  // Cap to maxCombos
  return allCombos.slice(0, config.maxCombos);
}

// ============================================
// STEP 2.5: DECORATE WITH OPTIONAL OUTERWEAR
// ============================================

/**
 * Decorate base combos with optional outerwear.
 *
 * Rules:
 * - Attach 0-1 outerwear to each base combo
 * - Prefer HIGH tier, then MEDIUM
 * - If includeLowTier=false, skip LOW outerwear entirely
 * - Outerwear doesn't affect tierFloor (it's a bonus)
 * - No Cartesian product - just pick best matching outerwear per combo
 *
 * @param combos - Base combos to decorate
 * @param outerwearCandidates - Available outerwear candidates
 * @param scannedCategory - The scanned item category (skip if scanning outerwear)
 * @param config - Assembly config
 */
export function decorateWithOuterwear(
  combos: AssembledCombo[],
  outerwearCandidates: SlotCandidate[],
  scannedCategory: Category,
  config: ComboAssemblerConfig = DEFAULT_CONFIG
): AssembledCombo[] {
  // If scanning outerwear, don't add more outerwear
  if (getScannedItemSlot(scannedCategory) === 'OUTERWEAR') {
    return combos;
  }

  // No outerwear candidates available
  if (outerwearCandidates.length === 0) {
    return combos;
  }

  // Filter candidates based on includeLowTier
  const eligibleOuterwear = config.includeLowTier
    ? outerwearCandidates
    : outerwearCandidates.filter(c => c.tier !== 'LOW');

  if (eligibleOuterwear.length === 0) {
    return combos;
  }

  // Sort by tier (HIGH > MEDIUM > LOW), then by score
  const sortedOuterwear = [...eligibleOuterwear].sort((a, b) => {
    const tierDiff = compareTierFloors(a.tier, b.tier);
    if (tierDiff !== 0) return tierDiff;
    return b.score - a.score;
  });

  // Pick the best outerwear (top candidate)
  const bestOuterwear = sortedOuterwear[0];

  // Decorate each combo with the best outerwear
  return combos.map(combo => ({
    ...combo,
    optionalOuterwear: {
      itemId: bestOuterwear.itemId,
      tier: bestOuterwear.tier,
      score: bestOuterwear.score,
      candidate: bestOuterwear,
    },
  }));
}

/**
 * Generate Cartesian product of slot candidates.
 */
function generateProductCombos(
  slots: OutfitSlot[],
  slotCandidates: SlotCandidate[][],
  seenComboIds: Set<string>,
  limit: number,
  maxReasons: number
): AssembledCombo[] {
  const combos: AssembledCombo[] = [];

  // Simple nested iteration (slots are typically 2-3, candidates capped)
  const iterate = (
    slotIdx: number,
    currentCandidates: SlotCandidate[]
  ): void => {
    if (combos.length >= limit) return;

    if (slotIdx >= slots.length) {
      // We have a complete combo
      const combo = assembleCombo(slots, currentCandidates, maxReasons);

      // Skip duplicates
      if (!seenComboIds.has(combo.id)) {
        seenComboIds.add(combo.id);
        combos.push(combo);
      }
      return;
    }

    const candidatesForSlot = slotCandidates[slotIdx];
    for (const candidate of candidatesForSlot) {
      if (combos.length >= limit) return;

      // Check for duplicate items (same itemId in different slots - shouldn't happen but guard)
      if (currentCandidates.some(c => c.itemId === candidate.itemId)) {
        continue;
      }

      iterate(slotIdx + 1, [...currentCandidates, candidate]);
    }
  };

  iterate(0, []);
  return combos;
}

/**
 * Assemble a combo from selected candidates.
 */
function assembleCombo(
  slots: OutfitSlot[],
  candidates: SlotCandidate[],
  maxReasons: number
): AssembledCombo {
  // Build slots object (exclude OUTERWEAR - it's handled separately as decoration)
  const slotsObj: AssembledCombo['slots'] = {};
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot !== 'OUTERWEAR') {
      slotsObj[slot] = candidates[i].itemId;
    }
  }

  // Compute tier floor
  const tierFloor = minTier(candidates.map(c => c.tier));

  // Compute avg score
  const avgScore = candidates.reduce((sum, c) => sum + c.score, 0) / candidates.length;

  // Extract reasons from CE evaluations
  const reasons = extractComboReasons(candidates, maxReasons);

  // Generate deterministic ID from sorted item IDs
  const sortedIds = candidates.map(c => c.itemId).sort();
  const id = sortedIds.join('_');

  return {
    id,
    slots: slotsObj,
    candidates,
    tierFloor,
    avgScore,
    reasons,
  };
}

// ============================================
// STEP 3: RANK COMBOS
// ============================================

/**
 * Rank combos by tier floor (primary), avg score (secondary), and stable tiebreaker.
 */
export function rankCombos(combos: AssembledCombo[]): AssembledCombo[] {
  return [...combos].sort((a, b) => {
    // Tier floor first (HIGH > MEDIUM > LOW)
    const tierDiff = compareTierFloors(a.tierFloor, b.tierFloor);
    if (tierDiff !== 0) return tierDiff;

    // Avg score second (higher is better)
    const scoreDiff = b.avgScore - a.avgScore;
    if (Math.abs(scoreDiff) > 0.001) return scoreDiff;

    // Stable tiebreaker: lexical combo ID
    return a.id.localeCompare(b.id);
  });
}

// ============================================
// STEP 4: EXTRACT REASONS
// ============================================

/**
 * Extract reasons from CE evaluations.
 * Takes up to 1-2 positive reasons per item, deduplicates, caps total.
 */
function extractComboReasons(
  candidates: SlotCandidate[],
  maxReasons: number
): string[] {
  const reasons: string[] = [];
  const seenKeys = new Set<string>();

  for (const candidate of candidates) {
    const eval_ = candidate.evaluation;

    // Skip if no explanation allowed
    if (!eval_.explanation_allowed) continue;

    // Use template ID as a "reason" for now
    // In v1, we can generate actual text from templates
    if (eval_.explanation_template_id) {
      const key = eval_.explanation_template_id;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        const reason = templateIdToReason(key, candidate);
        // Only add non-empty reasons
        if (reason.trim()) {
          reasons.push(reason);
        }
      }
    }

    if (reasons.length >= maxReasons) break;
  }

  return reasons.slice(0, maxReasons);
}

/**
 * Convert template ID to human-readable reason.
 * This is a placeholder - in v1, use proper template rendering.
 */
function templateIdToReason(templateId: string, candidate: SlotCandidate): string {
  // Simple mapping for common templates
  const templates: Record<string, string> = {
    'color_harmony_neutrals': 'Colors work well together',
    'color_harmony_analogous': 'Complementary color palette',
    'style_match': 'Matching style aesthetic',
    'formality_match': 'Same level of formality',
    'versatile_piece': 'Versatile piece that pairs easily',
  };

  return templates[templateId] ?? '';
}

// ============================================
// MAIN ASSEMBLER FUNCTION
// ============================================

export interface ComboAssemblerResult {
  /** Assembled and ranked combos */
  combos: AssembledCombo[];

  /** Whether we could form any combos */
  canFormCombos: boolean;

  /** Missing slots that prevent combo formation */
  missingSlots: { slot: OutfitSlot; category: string }[];

  /** Candidates by slot (for debugging) */
  candidatesBySlot: CandidatesBySlot;
}

/**
 * Main entry point: assemble combos from CE evaluations.
 */
export function assembleCombos(
  scannedCategory: Category,
  evaluations: PairEvaluation[],
  wardrobeCategoryMap: Map<string, Category>,
  config: Partial<ComboAssemblerConfig> = {}
): ComboAssemblerResult {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // Step 1: Build candidates by slot
  const candidatesBySlot = buildCandidatesBySlot(
    scannedCategory,
    evaluations,
    wardrobeCategoryMap,
    fullConfig
  );

  // Check for missing required slots
  const requiredSlots = getRequiredSlotsToFill(scannedCategory);
  const missingSlots = getMissingSlotsInfo(candidatesBySlot, requiredSlots);

  if (missingSlots.length > 0) {
    return {
      combos: [],
      canFormCombos: false,
      missingSlots,
      candidatesBySlot,
    };
  }

  // Step 2: Generate base combos
  const rawCombos = generateCombos(candidatesBySlot, scannedCategory, fullConfig);

  // Step 2.5: Decorate with optional outerwear
  const decoratedCombos = decorateWithOuterwear(
    rawCombos,
    candidatesBySlot.OUTERWEAR,
    scannedCategory,
    fullConfig
  );

  // Step 3: Rank combos
  const rankedCombos = rankCombos(decoratedCombos);

  return {
    combos: rankedCombos,
    canFormCombos: rankedCombos.length > 0,
    missingSlots: [],
    candidatesBySlot,
  };
}
