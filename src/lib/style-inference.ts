/**
 * Style Inference Module
 *
 * Deterministic fallback inference for styleTags from styleNotes.
 * Used when AI returns empty/invalid styleTags.
 *
 * Philosophy: High precision > high recall. Only assign tags we're confident about.
 */

import type { StyleVibe } from "./types";
import type { StyleFamily } from "./confidence-engine/types";

// ============================================
// KEYWORD MAPS (weighted by confidence)
// ============================================

interface KeywordEntry {
  keywords: string[];
  weight: number;  // 1 = weak signal, 2 = medium, 3 = strong
}

// Maps StyleFamily (engine) to keyword patterns
const STYLE_FAMILY_KEYWORDS: Record<StyleFamily, KeywordEntry[]> = {
  minimal: [
    { keywords: ["clean lines", "simple", "understated", "sleek", "monochrome"], weight: 3 },
    { keywords: ["neutral", "versatile", "everyday", "classic-cut", "streamlined"], weight: 2 },
    { keywords: ["refined", "pared-down", "unfussy", "no embellishment"], weight: 2 },
  ],
  classic: [
    { keywords: ["timeless", "tailored", "polished", "button-down", "trench"], weight: 3 },
    { keywords: ["structured", "refined", "traditional", "elegant"], weight: 2 },
    { keywords: ["sophisticated", "well-cut", "quality"], weight: 1 },
  ],
  romantic: [
    { keywords: ["wrap", "ruffle", "lace", "feminine", "floral", "draped"], weight: 3 },
    { keywords: ["v-neckline", "v-neck", "soft", "delicate", "flowing"], weight: 2 },
    { keywords: ["graceful", "pretty", "gentle", "bow", "pleated"], weight: 2 },
  ],
  edgy: [
    { keywords: ["leather", "hardware", "buckles", "studded", "combat", "punk"], weight: 3 },
    { keywords: ["sharp", "dark", "bold", "asymmetric", "zippers"], weight: 2 },
    { keywords: ["unconventional", "rebellious", "tough", "moto"], weight: 2 },
  ],
  street: [
    { keywords: ["oversized", "graphic", "hoodie", "sneaker", "cargo"], weight: 3 },
    { keywords: ["urban", "streetwear", "relaxed fit", "logo"], weight: 2 },
    { keywords: ["casual-cool", "laid-back", "skate"], weight: 2 },
  ],
  athleisure: [
    { keywords: ["active", "workout", "performance", "legging", "sports bra"], weight: 3 },
    { keywords: ["athletic", "sporty", "gym", "yoga", "running"], weight: 2 },
    { keywords: ["comfortable", "stretch", "moisture-wicking"], weight: 1 },
  ],
  boho: [
    { keywords: ["bohemian", "boho", "artistic", "free-spirited", "peasant"], weight: 3 },
    { keywords: ["flowy", "embroidered", "fringe", "earthy", "crochet"], weight: 2 },
    { keywords: ["relaxed", "eclectic", "vintage-inspired", "layered"], weight: 1 },
  ],
  preppy: [
    { keywords: ["preppy", "collegiate", "polo", "plaid", "argyle"], weight: 3 },
    { keywords: ["crisp", "nautical", "country club", "ivy league"], weight: 2 },
    { keywords: ["clean-cut", "put-together", "smart"], weight: 1 },
  ],
  formal: [
    { keywords: ["formal", "black-tie", "evening", "gown", "tuxedo"], weight: 3 },
    { keywords: ["business", "professional", "office", "suit", "blazer"], weight: 2 },
    { keywords: ["dressy", "elegant", "sophisticated", "polished"], weight: 2 },
  ],
  unknown: [],
};

// Maps StyleVibe (app) to keyword patterns
// Note: StyleVibe is a subset that maps to StyleFamily
const STYLE_VIBE_KEYWORDS: Record<StyleVibe, KeywordEntry[]> = {
  casual: [
    { keywords: ["casual", "everyday", "relaxed", "comfortable", "easy"], weight: 3 },
    { keywords: ["laid-back", "weekend", "effortless", "simple"], weight: 2 },
  ],
  minimal: [
    { keywords: ["minimal", "clean", "simple", "understated", "sleek"], weight: 3 },
    { keywords: ["neutral", "versatile", "streamlined", "unfussy"], weight: 2 },
  ],
  office: [
    { keywords: ["office", "work", "business", "professional"], weight: 3 },
    { keywords: ["polished", "tailored", "smart", "formal"], weight: 2 },
  ],
  street: [
    { keywords: ["street", "streetwear", "urban", "oversized", "graphic"], weight: 3 },
    { keywords: ["sneaker", "hoodie", "cargo", "casual-cool"], weight: 2 },
  ],
  feminine: [
    { keywords: ["feminine", "romantic", "soft", "delicate", "floral"], weight: 3 },
    { keywords: ["wrap", "ruffle", "lace", "graceful", "pretty"], weight: 2 },
  ],
  sporty: [
    { keywords: ["sporty", "athletic", "active", "workout", "performance"], weight: 3 },
    { keywords: ["gym", "running", "yoga", "comfortable", "stretch"], weight: 2 },
  ],
};

// "Statement" is contextual - only activates with other cues
const STATEMENT_CONTEXTUAL_BOOST: Record<StyleFamily, string[]> = {
  edgy: ["statement", "bold", "striking"],
  romantic: ["statement", "dramatic"],
  formal: ["statement", "glamorous"],
  boho: ["statement", "artistic"],
  minimal: [],  // "statement" rarely means minimal
  classic: [],
  street: ["statement"],
  athleisure: [],
  preppy: [],
  unknown: [],
};

// ============================================
// SCORING ENGINE
// ============================================

interface StyleScore {
  family: StyleFamily;
  score: number;
  matchedKeywords: string[];
}

/**
 * Score all style families against the given text
 */
function scoreStyleFamilies(text: string): StyleScore[] {
  const textLower = text.toLowerCase();
  const scores: StyleScore[] = [];

  for (const [family, entries] of Object.entries(STYLE_FAMILY_KEYWORDS)) {
    if (family === 'unknown') continue;

    let totalScore = 0;
    const matchedKeywords: string[] = [];

    for (const entry of entries) {
      for (const keyword of entry.keywords) {
        if (textLower.includes(keyword.toLowerCase())) {
          totalScore += entry.weight;
          matchedKeywords.push(keyword);
        }
      }
    }

    // Check for contextual "statement" boost
    const contextualBoosts = STATEMENT_CONTEXTUAL_BOOST[family as StyleFamily] || [];
    if (contextualBoosts.length > 0 && matchedKeywords.length > 0) {
      // Only apply boost if we already have other matches
      for (const boostWord of contextualBoosts) {
        if (textLower.includes(boostWord) && !matchedKeywords.includes(boostWord)) {
          totalScore += 1;  // Weak boost
          matchedKeywords.push(`${boostWord} (contextual)`);
        }
      }
    }

    if (totalScore > 0) {
      scores.push({
        family: family as StyleFamily,
        score: totalScore,
        matchedKeywords,
      });
    }
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  return scores;
}

/**
 * Score StyleVibe (app-level tags) against text
 */
function scoreStyleVibes(text: string): Array<{ vibe: StyleVibe; score: number }> {
  const textLower = text.toLowerCase();
  const scores: Array<{ vibe: StyleVibe; score: number }> = [];

  for (const [vibe, entries] of Object.entries(STYLE_VIBE_KEYWORDS)) {
    let totalScore = 0;

    for (const entry of entries) {
      for (const keyword of entry.keywords) {
        if (textLower.includes(keyword.toLowerCase())) {
          totalScore += entry.weight;
        }
      }
    }

    if (totalScore > 0) {
      scores.push({ vibe: vibe as StyleVibe, score: totalScore });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  return scores;
}

// ============================================
// PUBLIC API
// ============================================

export interface StyleInferenceResult {
  styleTags: StyleVibe[];
  styleFamily: StyleFamily;
  confidence: 'high' | 'medium' | 'low';
  matchedKeywords: string[];
  fallbackUsed: boolean;
}

// Tie-breaker order: more versatile styles win
const STYLE_FAMILY_PRIORITY: StyleFamily[] = [
  'minimal', 'classic', 'romantic', 'preppy', 'athleisure',
  'street', 'edgy', 'boho', 'formal', 'unknown'
];

/**
 * Infer style tags and family from styleNotes
 *
 * Returns:
 * - styleTags: 1-3 StyleVibe tags for the app
 * - styleFamily: Primary StyleFamily for confidence engine
 * - confidence: How confident we are in the inference
 * - matchedKeywords: Keywords that triggered the inference
 * - fallbackUsed: Whether we had to use fallback inference
 */
export function inferStyleFromNotes(
  styleNotes: string[],
  existingTags?: StyleVibe[]
): StyleInferenceResult {
  // If we already have valid tags, just derive family from them
  if (existingTags && existingTags.length > 0) {
    const family = vibeToFamily(existingTags[0]);
    return {
      styleTags: existingTags.slice(0, 3),
      styleFamily: family,
      confidence: 'high',
      matchedKeywords: [],
      fallbackUsed: false,
    };
  }

  const text = styleNotes.join(' ');

  if (!text.trim()) {
    return {
      styleTags: [],
      styleFamily: 'unknown',
      confidence: 'low',
      matchedKeywords: [],
      fallbackUsed: true,
    };
  }

  // Score both StyleFamily and StyleVibe
  const familyScores = scoreStyleFamilies(text);
  const vibeScores = scoreStyleVibes(text);

  // Determine primary family
  let primaryFamily: StyleFamily = 'unknown';
  let matchedKeywords: string[] = [];
  let confidence: 'high' | 'medium' | 'low' = 'low';

  if (familyScores.length > 0) {
    const topScore = familyScores[0];
    primaryFamily = topScore.family;
    matchedKeywords = topScore.matchedKeywords;

    // Determine confidence based on score and margin
    if (topScore.score >= 4) {
      confidence = 'high';
    } else if (topScore.score >= 2) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    // Handle ties - use priority order
    if (familyScores.length > 1 && familyScores[1].score >= topScore.score * 0.75) {
      // Close second place - check priority
      const topPriority = STYLE_FAMILY_PRIORITY.indexOf(topScore.family);
      const secondPriority = STYLE_FAMILY_PRIORITY.indexOf(familyScores[1].family);

      if (secondPriority < topPriority) {
        // Second place is more versatile, but keep original as it scored higher
        // Just note the ambiguity in confidence
        confidence = confidence === 'high' ? 'medium' : 'low';
      }
    }
  }

  // Build styleTags from vibeScores (max 3)
  const styleTags: StyleVibe[] = vibeScores
    .slice(0, 3)
    .map(s => s.vibe);

  // If no vibes matched but we have a family, try to derive a vibe
  if (styleTags.length === 0 && primaryFamily !== 'unknown') {
    const derivedVibe = familyToVibe(primaryFamily);
    if (derivedVibe) {
      styleTags.push(derivedVibe);
    }
  }

  return {
    styleTags,
    styleFamily: primaryFamily,
    confidence,
    matchedKeywords,
    fallbackUsed: true,
  };
}

/**
 * Map StyleVibe to StyleFamily
 * Note: 'casual' maps to 'classic' (everyday/versatile baseline)
 */
export function vibeToFamily(vibe: StyleVibe): StyleFamily {
  const mapping: Record<StyleVibe, StyleFamily> = {
    casual: 'classic',      // Casual = everyday/versatile, not athletic
    minimal: 'minimal',
    office: 'classic',
    street: 'street',
    feminine: 'romantic',
    sporty: 'athleisure',   // Only sporty maps to athleisure
  };
  return mapping[vibe];
}

/**
 * Map StyleFamily to primary StyleVibe (best approximation)
 */
export function familyToVibe(family: StyleFamily): StyleVibe | null {
  const mapping: Record<StyleFamily, StyleVibe | null> = {
    minimal: 'minimal',
    classic: 'office',
    romantic: 'feminine',
    edgy: 'street',  // Closest approximation
    street: 'street',
    athleisure: 'sporty',
    boho: 'casual',  // Closest approximation
    preppy: 'office',  // Closest approximation
    formal: 'office',  // Closest approximation
    unknown: null,
  };
  return mapping[family];
}

/**
 * Tags that should NOT drive family selection when more specific tags exist
 * These are "modifier" tags, not primary style indicators
 */
const LOW_PRIORITY_VIBES: StyleVibe[] = ['casual'];

/**
 * Get the primary vibe for family selection, respecting priority rules
 * If tags include both 'casual' and a more specific tag, the specific tag wins
 */
function getPrimaryVibe(tags: StyleVibe[]): StyleVibe {
  // Find the first non-low-priority vibe
  const primaryVibe = tags.find(v => !LOW_PRIORITY_VIBES.includes(v));
  // Fall back to first tag if all are low-priority
  return primaryVibe ?? tags[0];
}

/**
 * Validate and normalize styleTags with fallback inference
 *
 * This is the main entry point - use after AI analysis to ensure
 * styleTags is never empty when styleNotes exist.
 *
 * Priority logic: If tags include both 'casual' and a more specific tag,
 * the specific tag drives family (e.g., ["casual", "minimal"] → minimal)
 */
export function normalizeStyleTags(
  styleTags: StyleVibe[] | undefined,
  styleNotes: string[]
): { styleTags: StyleVibe[]; styleFamily: StyleFamily; fallbackUsed: boolean } {
  // Check if we have valid existing tags
  const validTags = (styleTags || []).filter(tag =>
    ['casual', 'minimal', 'office', 'street', 'feminine', 'sporty'].includes(tag)
  );

  if (validTags.length > 0) {
    // Use priority logic to determine family
    const primaryVibe = getPrimaryVibe(validTags);
    return {
      styleTags: validTags.slice(0, 3),
      styleFamily: vibeToFamily(primaryVibe),
      fallbackUsed: false,
    };
  }

  // No valid tags - use inference
  const result = inferStyleFromNotes(styleNotes);

  // Log warning for instrumentation
  if (styleNotes.length > 0 && result.styleTags.length === 0) {
    console.warn('[StyleInference] Could not infer style from notes:', {
      styleNotes,
      matchedKeywords: result.matchedKeywords,
    });
  }

  return {
    styleTags: result.styleTags,
    styleFamily: result.styleFamily,
    fallbackUsed: true,
  };
}
