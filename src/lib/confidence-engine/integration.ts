/**
 * Confidence Engine - Integration Layer
 *
 * Bridges existing app types (WardrobeItem, ScannedItem) to ConfidenceItem.
 * Provides conversion functions and inference logic for missing signals.
 */

import type {
  WardrobeItem,
  ScannedItem,
  ColorInfo,
  StyleVibe,
  Category as AppCategory,
} from '../types';

import type {
  ConfidenceItem,
  ColorProfile,
  StyleFamily,
  FormalityLevel,
  TextureType,
  Category,
} from './types';

// ============================================
// COLOR CONVERSION
// ============================================

/**
 * Known neutral colors by hex (normalized to uppercase)
 */
const NEUTRAL_COLORS = new Set([
  '#000000', // Black
  '#FFFFFF', // White
  '#1C1917', // Charcoal
  '#78716C', // Gray
  '#D6D3D1', // Light Gray
  '#F5F5DC', // Beige
  '#D2B48C', // Tan
  '#FFFDD0', // Cream
  '#C0C0C0', // Silver
  '#808080', // Gray variations
  '#A9A9A9',
  '#696969',
  '#2F2F2F',
  '#3D3D3D',
  '#E5E5E5',
  '#F0F0F0',
  '#FAFAFA',
]);

/**
 * Convert hex color to HSV
 */
function hexToHsv(hex: string): { h: number; s: number; v: number } {
  // Normalize hex
  let cleanHex = hex.replace('#', '').toUpperCase();
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }

  const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
  const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
  const b = parseInt(cleanHex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return { h, s, v };
}

/**
 * Determine if a color is neutral based on saturation and value
 */
function isNeutralColor(hex: string): boolean {
  const normalized = hex.toUpperCase();

  // Check known neutrals
  if (NEUTRAL_COLORS.has(normalized)) {
    return true;
  }

  // Check by HSV - low saturation = neutral
  const { s, v } = hexToHsv(hex);

  // Very low saturation (< 15%) is neutral
  if (s < 0.15) {
    return true;
  }

  // Very dark or very light colors are often perceived as neutral
  if (v < 0.15 || v > 0.95) {
    return s < 0.25;
  }

  return false;
}

/**
 * Map saturation value (0-1) to level
 */
function getSaturationLevel(s: number): 'low' | 'med' | 'high' {
  if (s < 0.33) return 'low';
  if (s < 0.66) return 'med';
  return 'high';
}

/**
 * Map value (0-1) to level
 */
function getValueLevel(v: number): 'low' | 'med' | 'high' {
  if (v < 0.33) return 'low';
  if (v < 0.66) return 'med';
  return 'high';
}

/**
 * Convert ColorInfo array to ColorProfile
 * Uses the first (dominant) color
 */
export function toColorProfile(colors: ColorInfo[]): ColorProfile {
  if (!colors || colors.length === 0) {
    // Default to neutral gray
    return {
      is_neutral: true,
      saturation: 'med',
      value: 'med',
    };
  }

  const primary = colors[0];
  const hex = primary.hex;
  const isNeutral = isNeutralColor(hex);
  const hsv = hexToHsv(hex);

  return {
    is_neutral: isNeutral,
    dominant_hue: isNeutral ? undefined : Math.round(hsv.h),
    saturation: getSaturationLevel(hsv.s),
    value: getValueLevel(hsv.v),
  };
}

// ============================================
// STYLE FAMILY CONVERSION
// ============================================

/**
 * Map app StyleVibe to confidence engine StyleFamily
 * Note: 'casual' maps to 'classic' (everyday/versatile baseline)
 * Note: 'sporty' is the only one that maps to 'athleisure'
 */
const STYLE_VIBE_TO_FAMILY: Record<StyleVibe, StyleFamily> = {
  casual: 'classic',      // Casual = everyday/versatile, not athletic
  minimal: 'minimal',
  office: 'classic',      // Office maps to classic
  street: 'street',
  feminine: 'romantic',   // Feminine maps to romantic
  sporty: 'athleisure',   // Only sporty maps to athleisure
};

/**
 * Tags that should NOT drive family selection when more specific tags exist
 * These are "modifier" tags, not primary style indicators
 */
const LOW_PRIORITY_VIBES: StyleVibe[] = ['casual'];

/**
 * Convert StyleVibe array to primary StyleFamily
 * Uses enhanced keyword matching when vibes are missing
 *
 * Priority logic: If tags include both 'casual' and a more specific tag,
 * the specific tag wins (e.g., ["casual", "minimal"] → minimal, not classic)
 */
export function toStyleFamily(
  vibes: StyleVibe[] | undefined,
  styleNotes?: string[]
): StyleFamily {
  // Use primary vibe if available
  if (vibes && vibes.length > 0) {
    // Find the first non-low-priority vibe
    const primaryVibe = vibes.find(v => !LOW_PRIORITY_VIBES.includes(v));

    if (primaryVibe) {
      return STYLE_VIBE_TO_FAMILY[primaryVibe];
    }

    // All vibes are low-priority (e.g., ["casual"] alone)
    // Use the first one's mapping
    return STYLE_VIBE_TO_FAMILY[vibes[0]];
  }

  // Fallback: infer from styleNotes using enhanced keyword matching
  if (styleNotes && styleNotes.length > 0) {
    const notesLower = styleNotes.join(' ').toLowerCase();

    // Romantic/feminine indicators (common in wrap tops, etc.)
    if (notesLower.includes('wrap') || notesLower.includes('v-neck') ||
        notesLower.includes('v-neckline') || notesLower.includes('draped') ||
        notesLower.includes('feminine') || notesLower.includes('soft') ||
        notesLower.includes('ruffle') || notesLower.includes('lace') ||
        notesLower.includes('floral') || notesLower.includes('delicate')) {
      return 'romantic';
    }

    // Minimal indicators
    if (notesLower.includes('clean lines') || notesLower.includes('simple') ||
        notesLower.includes('understated') || notesLower.includes('sleek') ||
        notesLower.includes('minimal') || notesLower.includes('streamlined')) {
      return 'minimal';
    }

    // Classic indicators
    if (notesLower.includes('timeless') || notesLower.includes('tailored') ||
        notesLower.includes('polished') || notesLower.includes('traditional') ||
        notesLower.includes('classic') || notesLower.includes('refined')) {
      return 'classic';
    }

    // Edgy indicators
    if (notesLower.includes('edgy') || notesLower.includes('punk') ||
        notesLower.includes('bold') || notesLower.includes('leather') ||
        notesLower.includes('hardware') || notesLower.includes('studded') ||
        notesLower.includes('asymmetric')) {
      return 'edgy';
    }

    // Boho indicators
    if (notesLower.includes('boho') || notesLower.includes('bohemian') ||
        notesLower.includes('artistic') || notesLower.includes('free-spirited') ||
        notesLower.includes('embroidered') || notesLower.includes('fringe')) {
      return 'boho';
    }

    // Preppy indicators
    if (notesLower.includes('preppy') || notesLower.includes('collegiate') ||
        notesLower.includes('nautical') || notesLower.includes('polo')) {
      return 'preppy';
    }

    // Formal indicators
    if (notesLower.includes('formal') || notesLower.includes('elegant') ||
        notesLower.includes('dressy') || notesLower.includes('evening') ||
        notesLower.includes('business') || notesLower.includes('professional')) {
      return 'formal';
    }

    // Street indicators
    if (notesLower.includes('street') || notesLower.includes('urban') ||
        notesLower.includes('graphic') || notesLower.includes('oversized') ||
        notesLower.includes('cargo') || notesLower.includes('hoodie')) {
      return 'street';
    }

    // Athleisure indicators
    if (notesLower.includes('athletic') || notesLower.includes('sporty') ||
        notesLower.includes('active') || notesLower.includes('workout') ||
        notesLower.includes('performance') || notesLower.includes('comfortable')) {
      return 'athleisure';
    }

    // "Statement" is contextual - check what kind
    if (notesLower.includes('statement')) {
      // Statement + fitted/wrap = romantic
      if (notesLower.includes('fitted') || notesLower.includes('wrap') || notesLower.includes('silhouette')) {
        return 'romantic';
      }
      // Default statement = edgy
      return 'edgy';
    }
  }

  return 'unknown';
}

// ============================================
// FORMALITY INFERENCE
// ============================================

/**
 * Infer formality level from category, style, and attributes
 */
export function inferFormalityLevel(
  category: AppCategory,
  styleFamily: StyleFamily,
  styleNotes?: string[],
  attributes?: { structure?: string }
): FormalityLevel {
  // Check style notes for explicit formality hints
  if (styleNotes) {
    const notesLower = styleNotes.join(' ').toLowerCase();

    if (notesLower.includes('formal') || notesLower.includes('black-tie') || notesLower.includes('evening')) {
      return 5;
    }
    if (notesLower.includes('business') || notesLower.includes('professional') || notesLower.includes('office')) {
      return 4;
    }
    if (notesLower.includes('smart casual') || notesLower.includes('polished')) {
      return 3;
    }
    if (notesLower.includes('casual') || notesLower.includes('everyday')) {
      return 2;
    }
    if (notesLower.includes('athleisure') || notesLower.includes('loungewear') || notesLower.includes('sporty')) {
      return 1;
    }
  }

  // Style family baseline
  const familyBaseline: Record<StyleFamily, FormalityLevel> = {
    formal: 5,
    classic: 3,
    preppy: 3,
    minimal: 3,
    romantic: 3,
    boho: 2,
    athleisure: 1,
    street: 2,
    edgy: 2,
    unknown: 2,
  };

  let level = familyBaseline[styleFamily];

  // Category adjustments
  if (category === 'shoes') {
    // Shoes tend to not change base formality much
  } else if (category === 'outerwear') {
    // Structured outerwear is more formal
    if (attributes?.structure === 'structured') {
      level = Math.min(5, level + 1) as FormalityLevel;
    }
  } else if (category === 'accessories' || category === 'bags') {
    // These don't strongly affect formality
  }

  return level;
}

// ============================================
// TEXTURE INFERENCE
// ============================================

/**
 * Infer texture type from style notes and attributes
 */
export function inferTextureType(
  styleNotes?: string[],
  attributes?: { structure?: string }
): TextureType {
  if (styleNotes) {
    const notesLower = styleNotes.join(' ').toLowerCase();

    // Smooth textures
    if (notesLower.includes('silk') || notesLower.includes('satin') ||
        notesLower.includes('polished') || notesLower.includes('sleek')) {
      return 'smooth';
    }

    // Textured materials
    if (notesLower.includes('knit') || notesLower.includes('tweed') ||
        notesLower.includes('corduroy') || notesLower.includes('ribbed') ||
        notesLower.includes('cable')) {
      return 'textured';
    }

    // Soft materials
    if (notesLower.includes('cashmere') || notesLower.includes('jersey') ||
        notesLower.includes('cotton') || notesLower.includes('soft') ||
        notesLower.includes('fleece')) {
      return 'soft';
    }

    // Structured materials
    if (notesLower.includes('denim') || notesLower.includes('canvas') ||
        notesLower.includes('stiff') || notesLower.includes('tailored') ||
        notesLower.includes('structured')) {
      return 'structured';
    }

    // Mixed
    if (notesLower.includes('mixed') || notesLower.includes('contrast')) {
      return 'mixed';
    }
  }

  // Fall back to attributes
  if (attributes?.structure === 'structured') {
    return 'structured';
  }
  if (attributes?.structure === 'soft') {
    return 'soft';
  }

  return 'unknown';
}

// ============================================
// MAIN CONVERSION FUNCTIONS
// ============================================

/**
 * Convert WardrobeItem to ConfidenceItem
 */
export function wardrobeItemToConfidenceItem(item: WardrobeItem): ConfidenceItem {
  const colorProfile = toColorProfile(item.colors);
  const styleFamily = toStyleFamily(item.userStyleTags, item.styleNotes);
  const formalityLevel = inferFormalityLevel(
    item.category,
    styleFamily,
    item.styleNotes,
    item.attributes
  );
  const textureType = inferTextureType(item.styleNotes, item.attributes);

  return {
    id: item.id,
    category: item.category as Category,
    color_profile: colorProfile,
    style_family: styleFamily,
    formality_level: formalityLevel,
    texture_type: textureType,
    image_uri: item.imageUri,
    label: item.detectedLabel,
  };
}

/**
 * Convert ScannedItem to ConfidenceItem
 */
export function scannedItemToConfidenceItem(item: ScannedItem): ConfidenceItem {
  const colorProfile = toColorProfile(item.colors);
  const styleFamily = toStyleFamily(item.styleTags, item.styleNotes);

  // Use item signals if available for better inference
  let formalityLevel = inferFormalityLevel(
    item.category,
    styleFamily,
    item.styleNotes
  );

  // Adjust formality based on item signals
  if (item.itemSignals) {
    // Statement pieces tend to be less casual
    if (item.itemSignals.statementLevel === 'bold') {
      formalityLevel = Math.min(5, formalityLevel + 1) as FormalityLevel;
    }
    // Relaxed silhouettes suggest lower formality
    if (item.itemSignals.silhouetteVolume === 'relaxed' ||
        item.itemSignals.silhouetteVolume === 'oversized') {
      formalityLevel = Math.max(1, formalityLevel - 1) as FormalityLevel;
    }
  }

  const textureType = inferTextureType(item.styleNotes);

  return {
    id: item.id,
    category: item.category as Category,
    color_profile: colorProfile,
    style_family: styleFamily,
    formality_level: formalityLevel,
    texture_type: textureType,
    image_uri: item.imageUri,
    label: item.descriptiveLabel,
  };
}

/**
 * Convert array of WardrobeItems to ConfidenceItems
 */
export function convertWardrobe(items: WardrobeItem[]): ConfidenceItem[] {
  return items.map(wardrobeItemToConfidenceItem);
}

// ============================================
// ENHANCED SIGNALS (for OpenAI integration)
// ============================================

/**
 * Enhanced color profile with full HSV data
 * This type is returned by OpenAI analysis
 */
export interface EnhancedColorProfile {
  is_neutral: boolean;
  dominant_hue?: number;
  saturation: 'low' | 'med' | 'high';
  value: 'low' | 'med' | 'high';
}

/**
 * Enhanced item signals returned by OpenAI
 * These are stored alongside existing item data
 */
export interface ConfidenceSignals {
  color_profile: EnhancedColorProfile;
  style_family: StyleFamily;
  formality_level: FormalityLevel;
  texture_type: TextureType;
}

/**
 * Convert ScannedItem with enhanced signals to ConfidenceItem
 */
export function scannedItemWithSignalsToConfidenceItem(
  item: ScannedItem,
  signals: ConfidenceSignals
): ConfidenceItem {
  return {
    id: item.id,
    category: item.category as Category,
    color_profile: signals.color_profile,
    style_family: signals.style_family,
    formality_level: signals.formality_level,
    texture_type: signals.texture_type,
    image_uri: item.imageUri,
    label: item.descriptiveLabel,
  };
}

/**
 * Merge inferred signals with any explicit signals from analysis
 * Explicit signals take precedence
 */
export function mergeWithExplicitSignals(
  inferred: ConfidenceItem,
  explicit: Partial<ConfidenceSignals>
): ConfidenceItem {
  return {
    ...inferred,
    color_profile: explicit.color_profile ?? inferred.color_profile,
    style_family: explicit.style_family ?? inferred.style_family,
    formality_level: explicit.formality_level ?? inferred.formality_level,
    texture_type: explicit.texture_type ?? inferred.texture_type,
  };
}

// ============================================
// STYLE-AWARE COPY RESOLUTION
// ============================================

/**
 * Priority order for deterministic vibe selection from multiple tags.
 * Higher priority vibes appear first; casual is lowest priority.
 * Used for COPY generation only - does not affect CE scoring.
 */
export const VIBE_PRIORITY: StyleVibe[] = [
  'office',
  'minimal',
  'street',
  'feminine',
  'sporty',
  'casual',
];

/**
 * Reverse mapping from CE StyleFamily to UI StyleVibe for copy generation.
 *
 * NOTE: 'classic' maps to 'casual' (not 'office') because classic in CE
 * is a catch-all for everyday/versatile items. Office-flavored copy only
 * appears when explicitly indicated via 'office' tag or 'formal'/'preppy' family.
 */
export const STYLE_FAMILY_TO_UI_VIBE: Record<StyleFamily, StyleVibe> = {
  romantic: 'feminine',
  boho: 'feminine',
  minimal: 'minimal',
  athleisure: 'sporty',
  street: 'street',
  edgy: 'street',
  preppy: 'office',
  formal: 'office',
  classic: 'casual', // Safe default - see note above
  unknown: 'casual',
};

/**
 * Resolve UI vibe for suggestion COPY generation only.
 *
 * IMPORTANT: This does NOT affect CE scoring or matching.
 * The vibe determines which text variation to use for Mode A/B bullets.
 *
 * Rules:
 * 1. Preserve "casual intent" - if all tags are casual, return casual
 * 2. explicitStyleFamily (from AI analysis) takes precedence when present
 * 3. styleTags use VIBE_PRIORITY for deterministic selection
 * 4. Fall back to toStyleFamily() for keyword matching
 */
export function resolveUiVibeForCopy(args: {
  styleTags?: StyleVibe[] | null;
  styleNotes?: string[] | null;
  explicitStyleFamily?: StyleFamily | null;
}): StyleVibe {
  const { styleTags, styleNotes, explicitStyleFamily } = args;

  // Determine casual intent: all tags are 'casual'
  const casualIntent =
    styleTags != null &&
    styleTags.length > 0 &&
    styleTags.every((t) => t === 'casual');

  // 1. If explicit style family provided and not unknown
  if (explicitStyleFamily != null && explicitStyleFamily !== 'unknown') {
    // Preserve casual intent even with classic family
    if (explicitStyleFamily === 'classic' && casualIntent) {
      return 'casual';
    }
    return STYLE_FAMILY_TO_UI_VIBE[explicitStyleFamily];
  }

  // 2. If styleTags exist, use priority-based selection
  if (styleTags != null && styleTags.length > 0) {
    // Find first vibe in VIBE_PRIORITY that exists in styleTags
    for (const vibe of VIBE_PRIORITY) {
      if (styleTags.includes(vibe)) {
        return vibe;
      }
    }
    // Fallback (shouldn't happen if VIBE_PRIORITY covers all StyleVibes)
    return styleTags[0];
  }

  // 3. Fall back to keyword matching via existing toStyleFamily
  const notesForMatching = Array.isArray(styleNotes) ? styleNotes : undefined;
  const family = toStyleFamily(styleTags ?? undefined, notesForMatching);

  // Preserve casual intent (edge case: mostly redundant but safe)
  if (family === 'classic' && casualIntent) {
    return 'casual';
  }

  return STYLE_FAMILY_TO_UI_VIBE[family];
}
