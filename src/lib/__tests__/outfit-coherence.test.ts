/**
 * Tests for Outfit Coherence Filter
 *
 * Phase 1 Rules:
 * - S1: Bottom/Dress ↔ Shoes big formality clash (REJECT unless exception vibe)
 * - S2: Sporty bottom/dress + heels (REJECT always)
 * - TB1: Top ↔ Bottom big formality clash (REJECT unless exception vibe)
 * - S3: Formal bottom/dress + athletic shoes (DEMOTE, not reject)
 */

import {
  formalityBand,
  isFormalShoe,
  isHeelShoe,
  isAthleticShoe,
  isSportyItem,
  hasExceptionVibe,
  checkOutfitCoherence,
  filterIncoherentCombos,
  type FormalityBand,
} from '../outfit-coherence';
import type { WardrobeItem } from '../types';
import type { AssembledCombo } from '../combo-assembler';

// ============================================
// TEST FIXTURES
// ============================================

function createWardrobeItem(
  overrides: Partial<WardrobeItem> & { id: string; category: WardrobeItem['category'] }
): WardrobeItem {
  return {
    imageUri: 'test.jpg',
    createdAt: Date.now(),
    colors: [],
    ...overrides,
  };
}

function createCombo(slots: {
  TOP?: string;
  BOTTOM?: string;
  SHOES?: string;
  DRESS?: string;
}): AssembledCombo {
  const slotIds = Object.values(slots).filter(Boolean);
  return {
    id: `combo-${slotIds.join('-')}`,
    slots,
    candidates: [],
    tierFloor: 'HIGH',
    avgScore: 0.8,
    reasons: [],
  };
}

// ============================================
// FORMALITY BAND TESTS
// ============================================

describe('formalityBand', () => {
  it('returns null for undefined/null', () => {
    expect(formalityBand(undefined)).toBeNull();
    expect(formalityBand(null)).toBeNull();
  });

  it('returns 0 (casual) for levels 1-2', () => {
    expect(formalityBand(1)).toBe(0);
    expect(formalityBand(2)).toBe(0);
  });

  it('returns 1 (smart-casual) for level 3', () => {
    expect(formalityBand(3)).toBe(1);
  });

  it('returns 2 (formal) for levels 4-5', () => {
    expect(formalityBand(4)).toBe(2);
    expect(formalityBand(5)).toBe(2);
  });
});

// ============================================
// SHOE TYPE INFERENCE TESTS
// ============================================

describe('isFormalShoe', () => {
  it('returns true for heels', () => {
    const shoe = createWardrobeItem({
      id: 'shoe-1',
      category: 'shoes',
      detectedLabel: 'Black Stiletto Heels',
    });
    expect(isFormalShoe(shoe)).toBe(true);
  });

  it('returns true for pumps', () => {
    const shoe = createWardrobeItem({
      id: 'shoe-1',
      category: 'shoes',
      detectedLabel: 'Nude Pumps',
    });
    expect(isFormalShoe(shoe)).toBe(true);
  });

  it('returns true for oxford shoes', () => {
    const shoe = createWardrobeItem({
      id: 'shoe-1',
      category: 'shoes',
      detectedLabel: 'Brown Oxford Shoes',
    });
    expect(isFormalShoe(shoe)).toBe(true);
  });

  it('returns true for dress shoes in styleNotes', () => {
    const shoe = createWardrobeItem({
      id: 'shoe-1',
      category: 'shoes',
      styleNotes: ['formal dress shoe', 'leather'],
    });
    expect(isFormalShoe(shoe)).toBe(true);
  });

  it('returns false for sneakers', () => {
    const shoe = createWardrobeItem({
      id: 'shoe-1',
      category: 'shoes',
      detectedLabel: 'White Sneakers',
    });
    expect(isFormalShoe(shoe)).toBe(false);
  });

  it('returns false for non-shoes', () => {
    const top = createWardrobeItem({
      id: 'top-1',
      category: 'tops',
      detectedLabel: 'High Heel Print T-Shirt',
    });
    expect(isFormalShoe(top)).toBe(false);
  });
});

describe('isHeelShoe', () => {
  it('returns true for heels', () => {
    const shoe = createWardrobeItem({
      id: 'shoe-1',
      category: 'shoes',
      detectedLabel: 'Black Heels',
    });
    expect(isHeelShoe(shoe)).toBe(true);
  });

  it('returns true for stilettos', () => {
    const shoe = createWardrobeItem({
      id: 'shoe-1',
      category: 'shoes',
      detectedLabel: 'Red Stilettos',
    });
    expect(isHeelShoe(shoe)).toBe(true);
  });

  it('returns true for pumps', () => {
    const shoe = createWardrobeItem({
      id: 'shoe-1',
      category: 'shoes',
      detectedLabel: 'Classic Pumps',
    });
    expect(isHeelShoe(shoe)).toBe(true);
  });

  it('returns false for oxfords (formal but not heels)', () => {
    const shoe = createWardrobeItem({
      id: 'shoe-1',
      category: 'shoes',
      detectedLabel: 'Oxford Shoes',
    });
    expect(isHeelShoe(shoe)).toBe(false);
  });

  it('returns false for sneakers', () => {
    const shoe = createWardrobeItem({
      id: 'shoe-1',
      category: 'shoes',
      detectedLabel: 'Sneakers',
    });
    expect(isHeelShoe(shoe)).toBe(false);
  });
});

describe('isAthleticShoe', () => {
  it('returns true for sneakers', () => {
    const shoe = createWardrobeItem({
      id: 'shoe-1',
      category: 'shoes',
      detectedLabel: 'White Sneakers',
    });
    expect(isAthleticShoe(shoe)).toBe(true);
  });

  it('returns true for trainers', () => {
    const shoe = createWardrobeItem({
      id: 'shoe-1',
      category: 'shoes',
      detectedLabel: 'Running Trainers',
    });
    expect(isAthleticShoe(shoe)).toBe(true);
  });

  it('returns true for running shoes', () => {
    const shoe = createWardrobeItem({
      id: 'shoe-1',
      category: 'shoes',
      detectedLabel: 'Nike Running Shoes',
    });
    expect(isAthleticShoe(shoe)).toBe(true);
  });

  it('returns true for athletic in styleNotes', () => {
    const shoe = createWardrobeItem({
      id: 'shoe-1',
      category: 'shoes',
      styleNotes: ['athletic', 'comfortable'],
    });
    expect(isAthleticShoe(shoe)).toBe(true);
  });

  it('returns false for heels', () => {
    const shoe = createWardrobeItem({
      id: 'shoe-1',
      category: 'shoes',
      detectedLabel: 'Black Heels',
    });
    expect(isAthleticShoe(shoe)).toBe(false);
  });
});

// ============================================
// SPORTY ITEM DETECTION TESTS
// ============================================

describe('isSportyItem', () => {
  it('returns true for sporty userStyleTag', () => {
    const pants = createWardrobeItem({
      id: 'pants-1',
      category: 'bottoms',
      userStyleTags: ['sporty'],
    });
    expect(isSportyItem(pants)).toBe(true);
  });

  it('returns true for joggers in detectedLabel', () => {
    const pants = createWardrobeItem({
      id: 'pants-1',
      category: 'bottoms',
      detectedLabel: 'Gray Joggers',
    });
    expect(isSportyItem(pants)).toBe(true);
  });

  it('returns true for athleisure in styleNotes', () => {
    const pants = createWardrobeItem({
      id: 'pants-1',
      category: 'bottoms',
      styleNotes: ['athleisure', 'comfortable'],
    });
    expect(isSportyItem(pants)).toBe(true);
  });

  it('returns true for sweatpants', () => {
    const pants = createWardrobeItem({
      id: 'pants-1',
      category: 'bottoms',
      detectedLabel: 'Black Sweatpants',
    });
    expect(isSportyItem(pants)).toBe(true);
  });

  it('returns true for leggings', () => {
    const pants = createWardrobeItem({
      id: 'pants-1',
      category: 'bottoms',
      detectedLabel: 'Athletic Leggings',
    });
    expect(isSportyItem(pants)).toBe(true);
  });

  it('returns false for regular jeans', () => {
    const pants = createWardrobeItem({
      id: 'pants-1',
      category: 'bottoms',
      detectedLabel: 'Blue Jeans',
    });
    expect(isSportyItem(pants)).toBe(false);
  });
});

// ============================================
// EXCEPTION VIBE DETECTION TESTS
// ============================================

describe('hasExceptionVibe', () => {
  it('returns true for street userStyleTag', () => {
    const item = createWardrobeItem({
      id: 'item-1',
      category: 'bottoms',
      userStyleTags: ['street'],
    });
    expect(hasExceptionVibe(item)).toBe(true);
  });

  it('returns true for streetwear in styleNotes', () => {
    const item = createWardrobeItem({
      id: 'item-1',
      category: 'bottoms',
      styleNotes: ['streetwear', 'urban'],
    });
    expect(hasExceptionVibe(item)).toBe(true);
  });

  it('returns true for edgy in styleNotes', () => {
    const item = createWardrobeItem({
      id: 'item-1',
      category: 'tops',
      styleNotes: ['edgy', 'bold'],
    });
    expect(hasExceptionVibe(item)).toBe(true);
  });

  it('returns false for regular casual item', () => {
    const item = createWardrobeItem({
      id: 'item-1',
      category: 'bottoms',
      detectedLabel: 'Casual Pants',
    });
    expect(hasExceptionVibe(item)).toBe(false);
  });
});

// ============================================
// S2: SPORTY + HEELS (ALWAYS REJECT)
// ============================================

describe('S2: Sporty bottom + heels (always reject)', () => {
  it('rejects sporty pants + heels', () => {
    const sportyPants = createWardrobeItem({
      id: 'pants-1',
      category: 'bottoms',
      detectedLabel: 'Gray Joggers',
    });
    const heels = createWardrobeItem({
      id: 'shoes-1',
      category: 'shoes',
      detectedLabel: 'Black Heels',
    });

    const wardrobeById = new Map([
      ['pants-1', sportyPants],
      ['shoes-1', heels],
    ]);

    const combo = createCombo({ BOTTOM: 'pants-1', SHOES: 'shoes-1' });
    const result = checkOutfitCoherence(combo, wardrobeById);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('S2_SPORTY_HEELS');
    }
  });

  it('rejects sporty pants + stilettos', () => {
    const sportyPants = createWardrobeItem({
      id: 'pants-1',
      category: 'bottoms',
      styleNotes: ['athleisure', 'comfortable'],
    });
    const stilettos = createWardrobeItem({
      id: 'shoes-1',
      category: 'shoes',
      detectedLabel: 'Red Stilettos',
    });

    const wardrobeById = new Map([
      ['pants-1', sportyPants],
      ['shoes-1', stilettos],
    ]);

    const combo = createCombo({ BOTTOM: 'pants-1', SHOES: 'shoes-1' });
    const result = checkOutfitCoherence(combo, wardrobeById);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('S2_SPORTY_HEELS');
    }
  });

  it('rejects even with exception vibe (no bypass for S2)', () => {
    const sportyPants = createWardrobeItem({
      id: 'pants-1',
      category: 'bottoms',
      detectedLabel: 'Track Pants',
      userStyleTags: ['street'], // Exception vibe
    });
    const heels = createWardrobeItem({
      id: 'shoes-1',
      category: 'shoes',
      detectedLabel: 'Pumps',
    });

    const wardrobeById = new Map([
      ['pants-1', sportyPants],
      ['shoes-1', heels],
    ]);

    const combo = createCombo({ BOTTOM: 'pants-1', SHOES: 'shoes-1' });
    const result = checkOutfitCoherence(combo, wardrobeById);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('S2_SPORTY_HEELS');
    }
  });

  it('allows sporty pants + sneakers (not heels)', () => {
    const sportyPants = createWardrobeItem({
      id: 'pants-1',
      category: 'bottoms',
      detectedLabel: 'Joggers',
    });
    const sneakers = createWardrobeItem({
      id: 'shoes-1',
      category: 'shoes',
      detectedLabel: 'White Sneakers',
    });

    const wardrobeById = new Map([
      ['pants-1', sportyPants],
      ['shoes-1', sneakers],
    ]);

    const combo = createCombo({ BOTTOM: 'pants-1', SHOES: 'shoes-1' });
    const result = checkOutfitCoherence(combo, wardrobeById);

    expect(result.ok).toBe(true);
  });
});

// ============================================
// S1: BOTTOM/DRESS ↔ SHOES FORMALITY CLASH
// ============================================

describe('S1: Bottom/Dress ↔ Shoes formality clash', () => {
  it('rejects casual pants (band 0) + formal shoes (band 2)', () => {
    // Casual pants (formality 1-2 → band 0)
    const casualPants = createWardrobeItem({
      id: 'pants-1',
      category: 'bottoms',
      detectedLabel: 'Casual Jeans',
      styleNotes: ['casual', 'everyday'],
    });
    // Formal shoes (formality 4-5 → band 2)
    const formalShoes = createWardrobeItem({
      id: 'shoes-1',
      category: 'shoes',
      detectedLabel: 'Formal Dress Shoes',
      styleNotes: ['formal', 'leather'],
    });

    const wardrobeById = new Map([
      ['pants-1', casualPants],
      ['shoes-1', formalShoes],
    ]);

    const combo = createCombo({ BOTTOM: 'pants-1', SHOES: 'shoes-1' });
    const result = checkOutfitCoherence(combo, wardrobeById);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('S1_FORMALITY_CLASH');
    }
  });

  it('allows with exception vibe (street style)', () => {
    const casualPants = createWardrobeItem({
      id: 'pants-1',
      category: 'bottoms',
      detectedLabel: 'Casual Jeans',
      styleNotes: ['casual', 'streetwear'], // Exception vibe
    });
    const formalShoes = createWardrobeItem({
      id: 'shoes-1',
      category: 'shoes',
      detectedLabel: 'Dress Shoes',
      styleNotes: ['formal'],
    });

    const wardrobeById = new Map([
      ['pants-1', casualPants],
      ['shoes-1', formalShoes],
    ]);

    const combo = createCombo({ BOTTOM: 'pants-1', SHOES: 'shoes-1' });
    const result = checkOutfitCoherence(combo, wardrobeById);

    expect(result.ok).toBe(true);
  });

  it('allows same-band combinations', () => {
    const casualPants = createWardrobeItem({
      id: 'pants-1',
      category: 'bottoms',
      detectedLabel: 'Casual Jeans',
      styleNotes: ['casual'],
    });
    const casualShoes = createWardrobeItem({
      id: 'shoes-1',
      category: 'shoes',
      detectedLabel: 'Canvas Shoes',
      styleNotes: ['casual'],
    });

    const wardrobeById = new Map([
      ['pants-1', casualPants],
      ['shoes-1', casualShoes],
    ]);

    const combo = createCombo({ BOTTOM: 'pants-1', SHOES: 'shoes-1' });
    const result = checkOutfitCoherence(combo, wardrobeById);

    expect(result.ok).toBe(true);
  });

  it('allows one-band difference (smart-casual bottom + casual shoes)', () => {
    // Smart-casual pants (band 1) + casual shoes (band 0) = diff of 1 (allowed)
    const smartCasualPants = createWardrobeItem({
      id: 'pants-1',
      category: 'bottoms',
      detectedLabel: 'Chinos',
      styleNotes: ['smart casual', 'polished'],
    });
    const casualShoes = createWardrobeItem({
      id: 'shoes-1',
      category: 'shoes',
      detectedLabel: 'Canvas Shoes',
      styleNotes: ['casual'],
    });

    const wardrobeById = new Map([
      ['pants-1', smartCasualPants],
      ['shoes-1', casualShoes],
    ]);

    const combo = createCombo({ BOTTOM: 'pants-1', SHOES: 'shoes-1' });
    const result = checkOutfitCoherence(combo, wardrobeById);

    // Should not reject - diff is only 1
    expect(result.ok).toBe(true);
  });
});

// ============================================
// TB1: TOP ↔ BOTTOM FORMALITY CLASH
// ============================================

describe('TB1: Top ↔ Bottom formality clash', () => {
  it('rejects hoodie (band 0) + formal trousers (band 2)', () => {
    const hoodie = createWardrobeItem({
      id: 'top-1',
      category: 'tops',
      detectedLabel: 'Casual Hoodie',
      styleNotes: ['athleisure', 'comfortable'],
    });
    const formalTrousers = createWardrobeItem({
      id: 'pants-1',
      category: 'bottoms',
      detectedLabel: 'Formal Trousers',
      styleNotes: ['formal', 'business'],
    });
    // Use formal shoes so S1 doesn't trigger (formal bottom + formal shoes = no S1 clash)
    const formalShoes = createWardrobeItem({
      id: 'shoes-1',
      category: 'shoes',
      detectedLabel: 'Formal Oxford Shoes',
      styleNotes: ['formal', 'dress shoe'],
    });

    const wardrobeById = new Map([
      ['top-1', hoodie],
      ['pants-1', formalTrousers],
      ['shoes-1', formalShoes],
    ]);

    const combo = createCombo({ TOP: 'top-1', BOTTOM: 'pants-1', SHOES: 'shoes-1' });
    const result = checkOutfitCoherence(combo, wardrobeById);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('TB1_TOP_BOTTOM_CLASH');
    }
  });

  it('allows with exception vibe', () => {
    const hoodie = createWardrobeItem({
      id: 'top-1',
      category: 'tops',
      detectedLabel: 'Hoodie',
      styleNotes: ['athleisure', 'edgy'], // Exception vibe
    });
    const formalTrousers = createWardrobeItem({
      id: 'pants-1',
      category: 'bottoms',
      detectedLabel: 'Formal Trousers',
      styleNotes: ['formal'],
    });
    // Use formal shoes so S1 doesn't interfere
    const formalShoes = createWardrobeItem({
      id: 'shoes-1',
      category: 'shoes',
      detectedLabel: 'Oxford Shoes',
      styleNotes: ['formal'],
    });

    const wardrobeById = new Map([
      ['top-1', hoodie],
      ['pants-1', formalTrousers],
      ['shoes-1', formalShoes],
    ]);

    const combo = createCombo({ TOP: 'top-1', BOTTOM: 'pants-1', SHOES: 'shoes-1' });
    const result = checkOutfitCoherence(combo, wardrobeById);

    expect(result.ok).toBe(true);
  });
});

// ============================================
// S3: FORMAL BOTTOM + ATHLETIC SHOES (DEMOTE)
// ============================================

describe('S3: Formal bottom + athletic shoes (demote, not reject)', () => {
  it('allows formal trousers + sneakers but adds penalty', () => {
    const formalTrousers = createWardrobeItem({
      id: 'pants-1',
      category: 'bottoms',
      detectedLabel: 'Tailored Trousers',
      styleNotes: ['formal', 'business'],
    });
    const sneakers = createWardrobeItem({
      id: 'shoes-1',
      category: 'shoes',
      detectedLabel: 'White Sneakers',
    });

    const wardrobeById = new Map([
      ['pants-1', formalTrousers],
      ['shoes-1', sneakers],
    ]);

    const combo = createCombo({ BOTTOM: 'pants-1', SHOES: 'shoes-1' });
    const result = checkOutfitCoherence(combo, wardrobeById);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.penalty).toBe(1);
      expect(result.reasons).toContain('S3_FORMAL_WITH_ATHLETIC');
    }
  });

  it('no penalty for casual pants + sneakers', () => {
    const casualPants = createWardrobeItem({
      id: 'pants-1',
      category: 'bottoms',
      detectedLabel: 'Jeans',
      styleNotes: ['casual'],
    });
    const sneakers = createWardrobeItem({
      id: 'shoes-1',
      category: 'shoes',
      detectedLabel: 'Sneakers',
    });

    const wardrobeById = new Map([
      ['pants-1', casualPants],
      ['shoes-1', sneakers],
    ]);

    const combo = createCombo({ BOTTOM: 'pants-1', SHOES: 'shoes-1' });
    const result = checkOutfitCoherence(combo, wardrobeById);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.penalty).toBe(0);
    }
  });
});

// ============================================
// FILTER FUNCTION TESTS
// ============================================

describe('filterIncoherentCombos', () => {
  it('filters out rejected combos and preserves valid ones', () => {
    const sportyPants = createWardrobeItem({
      id: 'sporty-pants',
      category: 'bottoms',
      detectedLabel: 'Joggers',
    });
    const heels = createWardrobeItem({
      id: 'heels',
      category: 'shoes',
      detectedLabel: 'Black Heels',
    });
    const casualPants = createWardrobeItem({
      id: 'casual-pants',
      category: 'bottoms',
      detectedLabel: 'Jeans',
      styleNotes: ['casual'],
    });
    const sneakers = createWardrobeItem({
      id: 'sneakers',
      category: 'shoes',
      detectedLabel: 'Sneakers',
    });

    const wardrobeItems = [sportyPants, heels, casualPants, sneakers];

    const badCombo = createCombo({ BOTTOM: 'sporty-pants', SHOES: 'heels' });
    const goodCombo = createCombo({ BOTTOM: 'casual-pants', SHOES: 'sneakers' });

    const result = filterIncoherentCombos([badCombo, goodCombo], wardrobeItems);

    expect(result.combos).toHaveLength(1);
    expect(result.combos[0].id).toBe(goodCombo.id);
    expect(result.rejectedCount).toBe(1);
    expect(result.rejectionLog[0].reason).toBe('S2_SPORTY_HEELS');
  });

  it('tracks penalties for demoted combos', () => {
    const formalPants = createWardrobeItem({
      id: 'formal-pants',
      category: 'bottoms',
      detectedLabel: 'Formal Trousers',
      styleNotes: ['formal'],
    });
    const sneakers = createWardrobeItem({
      id: 'sneakers',
      category: 'shoes',
      detectedLabel: 'Sneakers',
    });

    const wardrobeItems = [formalPants, sneakers];
    const combo = createCombo({ BOTTOM: 'formal-pants', SHOES: 'sneakers' });

    const result = filterIncoherentCombos([combo], wardrobeItems);

    expect(result.combos).toHaveLength(1);
    expect(result.penaltyById.get(combo.id)).toBe(1);
  });
});

