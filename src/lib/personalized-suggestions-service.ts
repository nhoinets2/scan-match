/**
 * Personalized Suggestions Service
 *
 * Client-side service for fetching AI-generated personalized suggestions.
 * Uses cache-first strategy with hashed cache key and fail-open behavior.
 */

import * as Crypto from "expo-crypto";
import { supabase } from "./supabase";
import { trackEvent } from "./analytics";
import type { StyleSignalsV1, AestheticArchetype } from "./trust-filter/types";
import type { EnrichedMatch } from "./useConfidenceEngine";
import { ALLOWED_ELEVATE_CATEGORIES, isAddOnCategory } from "./types";
import type {
  Category,
  StyleVibe,
  WardrobeItem,
  AddOnCategory,
  PersonalizedSuggestions,
  SafeMatchInfo,
  SafeNearMatchInfo,
  WardrobeSummary,
  SuggestionBullet,
  ElevateBullet,
  Recommend,
  RecommendConsiderAdding,
  RecommendStylingTip,
} from "./types";

// ============================================
// CONFIG
// ============================================

const PROMPT_VERSION = 2;
const SCHEMA_VERSION = 2;
const TIMEOUT_MS = 7500; // Slightly less than Edge Function timeout (8000ms)

// ============================================
// TYPES
// ============================================

export type SuggestionsResult =
  | {
      ok: true;
      data: PersonalizedSuggestions;
      source: "cache_hit" | "ai_call";
      wasRepaired?: boolean;
    }
  | {
      ok: false;
      error: {
        kind: "timeout" | "network" | "unauthorized";
        message: string;
      };
    };

type WardrobeItemWithSignals = WardrobeItem & {
  style_signals_v1?: StyleSignalsV1 | null;
};

// ============================================
// EDGE FUNCTION URL
// ============================================

function getSuggestionsUrl(): string {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL not configured");
  }
  return `${supabaseUrl}/functions/v1/personalized-suggestions`;
}

// ============================================
// HASHING
// ============================================

async function sha256Hex(data: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    data,
  );
}

// ============================================
// CACHE
// ============================================

async function checkSuggestionsCache(
  cacheKey: string,
): Promise<PersonalizedSuggestions | null> {
  try {
    const { data, error } = await supabase
      .from("personalized_suggestions_cache")
      .select("suggestions, expires_at")
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data.suggestions as PersonalizedSuggestions;
  } catch (error) {
    console.warn("[Suggestions] Cache lookup failed:", error);
    return null;
  }
}

async function incrementCacheHit(cacheKey: string): Promise<void> {
  try {
    await supabase.rpc("increment_suggestions_cache_hit", {
      p_cache_key: cacheKey,
    });
  } catch (error) {
    // Non-blocking: cache hit tracking shouldn't break UX
    if (__DEV__) {
      console.log("[Suggestions] Cache hit increment failed:", error);
    }
  }
}

// ============================================
// INPUT SHAPING
// ============================================

function mapStyleVibeToAesthetic(vibe: StyleVibe): AestheticArchetype {
  const mapping: Record<StyleVibe, AestheticArchetype> = {
    casual: "classic",
    minimal: "minimalist",
    office: "classic",
    street: "street",
    feminine: "romantic",
    sporty: "sporty",
  };
  return mapping[vibe] ?? "unknown";
}

/**
 * Get wardrobe item's aesthetic from its style_signals_v1.
 * Falls back to inferred mapping from user style tags if signals not ready.
 */
function getWardrobeItemAesthetic(
  item: WardrobeItemWithSignals,
): AestheticArchetype {
  const primary = item.style_signals_v1?.aesthetic?.primary;
  if (primary && primary !== "none") {
    return primary;
  }

  const fallbackVibe = item.userStyleTags?.[0];
  return fallbackVibe ? mapStyleVibeToAesthetic(fallbackVibe) : "unknown";
}

// ============================================
// MAIN SERVICE
// ============================================

/** Mode type for personalized suggestions */
export type SuggestionsMode = "paired" | "solo" | "near";

export async function fetchPersonalizedSuggestions({
  scanId,
  scanSignals,
  highFinal,
  nearFinal,
  wardrobeSummary,
  intent,
  scanCategory,
  preferAddOnCategories,
  addOnCategories,
}: {
  scanId: string;
  scanSignals: StyleSignalsV1;
  highFinal: EnrichedMatch[];
  nearFinal?: EnrichedMatch[];
  wardrobeSummary: WardrobeSummary;
  intent: "shopping" | "own_item";
  scanCategory?: Category | null;
  preferAddOnCategories?: boolean;
  addOnCategories?: AddOnCategory[];
}): Promise<SuggestionsResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (!session?.access_token) {
    return {
      ok: false,
      error: { kind: "unauthorized", message: "Not authenticated" },
    };
  }

  const topMatches: SafeMatchInfo[] = highFinal.slice(0, 5).map(match => ({
    id: match.wardrobeItem.id,
    category: match.wardrobeItem.category as Category,
    dominant_color: match.wardrobeItem.colors?.[0]?.name ?? "unknown",
    aesthetic: getWardrobeItemAesthetic(match.wardrobeItem),
    label: match.wardrobeItem.detectedLabel,
  }));

  // Build near matches with cap_reasons for NEAR mode
  const nearMatches: SafeNearMatchInfo[] = (nearFinal ?? []).slice(0, 3).map(match => ({
    id: match.wardrobeItem.id,
    category: match.wardrobeItem.category as Category,
    dominant_color: match.wardrobeItem.colors?.[0]?.name ?? "unknown",
    aesthetic: getWardrobeItemAesthetic(match.wardrobeItem),
    label: match.wardrobeItem.detectedLabel,
    cap_reasons: match.capReasons?.slice(0, 2) ?? [], // Top 2 cap reasons per match
  }));

  const topIds = topMatches.map(match => match.id).sort().join("|");
  const nearIds = nearMatches.map(match => match.id).sort().join("|");
  
  // Derive mode from data arrays (same logic as server)
  // near_matches.length > 0 → near, top_matches.length === 0 → solo, else → paired
  const mode: SuggestionsMode = nearMatches.length > 0 
    ? "near" 
    : topMatches.length === 0 
      ? "solo" 
      : "paired";
  
  // Build cache key with all context that affects output (includes mode + near IDs)
  const rawKey = [
    scanId,
    topIds,  // empty string for solo mode
    nearIds, // empty string for paired/solo modes
    wardrobeSummary.updated_at,
    PROMPT_VERSION,
    SCHEMA_VERSION,
    `mode:${mode}`,
    `scanCat:${scanCategory ?? "null"}`,
    `preferAddOns:${preferAddOnCategories ? 1 : 0}`,
  ].join("|");
  const cacheKey = await sha256Hex(rawKey);

  const startTime = Date.now();
  
  // Determine valid IDs for mention validation based on mode
  // NEAR mode: validate against near_match_ids
  // PAIRED mode: validate against top_match_ids
  // SOLO mode: empty array (no mentions allowed)
  const validIds = mode === "near" 
    ? nearMatches.map(match => match.id)
    : topMatches.map(match => match.id);

  const cached = await checkSuggestionsCache(cacheKey);
  if (cached) {
    void incrementCacheHit(cacheKey);
    
    const { suggestions, wasRepaired, removedCategories, mentionsStrippedCount } = validateAndRepairSuggestions(
      cached,
      validIds,
      mode,
      scanCategory ?? null,
      preferAddOnCategories,
      addOnCategories,
    );
    const latencyMs = Date.now() - startTime;
    if (__DEV__ && removedCategories.length > 0) {
      console.log("[Suggestions] Repaired cached to_elevate categories", {
        scanId,
        scanCategory,
        removedCategories,
        source: "cache_hit",
        wasRepaired,
        promptVersion: PROMPT_VERSION,
        schemaVersion: SCHEMA_VERSION,
      });
    }
    
    // Track cache hit event with age calculation
    trackEvent("personalized_suggestions_cache_hit", {
      scan_id: scanId,
      cache_age_seconds: 0, // Age not available from cache metadata in v1
    });
    
    // Track completion for cache hit
    trackEvent("personalized_suggestions_completed", {
      scan_id: scanId,
      latency_ms: latencyMs,
      source: "cache_hit",
      prompt_version: PROMPT_VERSION,
      schema_version: SCHEMA_VERSION,
      was_repaired: wasRepaired,
      mode,
      mentions_stripped_count: mentionsStrippedCount,
      removed_by_scan_category_count: removedCategories.length,
      applied_add_on_preference: preferAddOnCategories ?? false,
    });
    
    return { ok: true, data: suggestions, source: "cache_hit", wasRepaired };
  }

  // Track started event (cache miss, about to call Edge Function)
  trackEvent("personalized_suggestions_started", {
    scan_id: scanId,
    intent,
    top_match_count: topMatches.length,
    near_match_count: nearMatches.length,
    prompt_version: PROMPT_VERSION,
    schema_version: SCHEMA_VERSION,
    mode,
    scan_category: scanCategory ?? null,
    prefer_add_on_categories: preferAddOnCategories ?? false,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(getSuggestionsUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        scan_signals: scanSignals,
        scan_category: scanCategory ?? null,
        top_matches: topMatches,
        near_matches: nearMatches.length > 0 ? nearMatches : undefined, // Only include for NEAR mode
        wardrobe_summary: wardrobeSummary,
        intent,
        cache_key: cacheKey,
        scan_id: scanId,
        mode, // Telemetry only - server derives mode from arrays
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const { suggestions, wasRepaired, removedCategories, mentionsStrippedCount } = validateAndRepairSuggestions(
      payload,
      validIds,
      mode,
      scanCategory ?? null,
      preferAddOnCategories,
      addOnCategories,
    );
    if (__DEV__ && removedCategories.length > 0) {
      console.log("[Suggestions] Repaired ai to_elevate categories", {
        scanId,
        scanCategory,
        removedCategories,
        source: "ai_call",
        wasRepaired,
        promptVersion: PROMPT_VERSION,
        schemaVersion: SCHEMA_VERSION,
      });
    }

    const latencyMs = Date.now() - startTime;

    // Track successful completion
    trackEvent("personalized_suggestions_completed", {
      scan_id: scanId,
      latency_ms: latencyMs,
      source: "ai_call",
      prompt_version: PROMPT_VERSION,
      schema_version: SCHEMA_VERSION,
      was_repaired: wasRepaired,
      mode,
      mentions_stripped_count: mentionsStrippedCount,
      removed_by_scan_category_count: removedCategories.length,
      applied_add_on_preference: preferAddOnCategories ?? false,
    });

    return { ok: true, data: suggestions, source: "ai_call", wasRepaired };
  } catch (error) {
    const err = error as Error;
    const isTimeout = err.name === "AbortError";
    const kind = isTimeout ? "timeout" : "network";

    // Track failure with specific error kind
    trackEvent("personalized_suggestions_failed", {
      scan_id: scanId,
      error_kind: kind,
      prompt_version: PROMPT_VERSION,
      schema_version: SCHEMA_VERSION,
    });

    if (__DEV__) {
      console.log(`[Suggestions] ${kind}: ${err.message}`);
    }

    return { ok: false, error: { kind, message: err.message } };
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================
// VALIDATION & REPAIR
// ============================================

const FALLBACK_WHY_IT_WORKS: SuggestionBullet = {
  text: "The colors and styles complement each other well",
  mentions: [],
};

const FALLBACK_TO_ELEVATE: ElevateBullet = {
  text: "Could add visual interest",
  recommend: {
    type: "consider_adding",
    category: "accessories",
    attributes: ["simple", "neutral"],
  },
};

const FALLBACK_TO_ELEVATE_NEAR: ElevateBullet = {
  text: "Try different styling approaches",
  recommend: {
    type: "styling_tip",
    tip: "Experiment with tucking, rolling, or layering to adjust proportions",
  },
};

const FALLBACK_ELEVATE_ORDER: Category[] = [
  "accessories",
  "bags",
  "outerwear",
  "shoes",
  "tops",
  "bottoms",
  "skirts",
  "dresses",
];

const FALLBACK_ELEVATE_ADD_ON_ORDER: Category[] = [
  "accessories",
  "bags",
  "outerwear",
];

function smartTrim(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;

  const trimmed = text.slice(0, maxLen);
  const lastSpace = trimmed.lastIndexOf(" ");

  if (lastSpace > maxLen * 0.6) {
    return trimmed.slice(0, lastSpace) + "…";
  }

  return trimmed.slice(0, maxLen - 1) + "…";
}

export function validateAndRepairSuggestions(
  data: unknown,
  validIds: string[],
  mode: SuggestionsMode = "paired",
  scanCategory?: Category | null,
  preferAddOnCategories?: boolean,
  addOnCategories?: AddOnCategory[],
): {
  suggestions: PersonalizedSuggestions;
  wasRepaired: boolean;
  removedCategories: Category[];
  mentionsStrippedCount: number;
} {
  const validIdSet = new Set(validIds);
  const isSoloMode = mode === "solo";
  const isNearMode = mode === "near";
  let wasRepaired = false;
  const removedCategories: Category[] = [];
  let mentionsStrippedCount = 0;

  const raw =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : {};

  let whyItWorks: SuggestionBullet[] = [];
  if (Array.isArray(raw.why_it_works)) {
    whyItWorks = raw.why_it_works.slice(0, 2).map(bullet => {
      const originalText =
        typeof bullet?.text === "string" ? bullet.text : "";
      const trimmedText = smartTrim(
        originalText || FALLBACK_WHY_IT_WORKS.text,
        100,
      );

      if (trimmedText !== originalText) wasRepaired = true;

      const originalMentions = Array.isArray(bullet?.mentions)
        ? bullet.mentions
        : [];
      
      // Solo mode: force empty mentions (never reference owned items)
      // NEAR/PAIRED mode: validate against valid IDs (strip invalid ones)
      const validMentions = isSoloMode
        ? []
        : originalMentions.filter(
            (id: unknown): id is string =>
              typeof id === "string" && validIdSet.has(id),
          );

      const strippedInThisBullet = originalMentions.length - validMentions.length;
      if (strippedInThisBullet > 0) {
        mentionsStrippedCount += strippedInThisBullet;
        wasRepaired = true;
      }

      return {
        text: trimmedText,
        mentions: validMentions,
      };
    });
  }

  while (whyItWorks.length < 2) {
    whyItWorks.push({ ...FALLBACK_WHY_IT_WORKS });
    wasRepaired = true;
  }

  let toElevate: ElevateBullet[] = [];
  if (Array.isArray(raw.to_elevate)) {
    toElevate = raw.to_elevate.slice(0, 2).map(bullet => {
      const rec = bullet?.recommend as Record<string, unknown> | undefined;
      const originalText =
        typeof bullet?.text === "string" ? bullet.text : "";
      const trimmedText = smartTrim(
        originalText || FALLBACK_TO_ELEVATE.text,
        100,
      );

      if (trimmedText !== originalText) wasRepaired = true;

      // Handle recommend union based on mode and what was returned
      const recType = rec?.type;
      
      // NEAR mode expects styling_tip, PAIRED/SOLO expect consider_adding
      if (isNearMode && recType === "styling_tip") {
        // Validate styling_tip type
        const tip = typeof rec?.tip === "string" && rec.tip.length > 0
          ? smartTrim(rec.tip, 150)
          : "Try different styling approaches to make this work";
        
        if (tip !== rec?.tip) wasRepaired = true;
        
        const tags = Array.isArray(rec?.tags)
          ? (rec.tags as unknown[])
              .filter((tag): tag is string => typeof tag === "string")
              .slice(0, 3)
          : undefined;

        return {
          text: trimmedText,
          recommend: {
            type: "styling_tip" as const,
            tip,
            ...(tags && tags.length > 0 ? { tags } : {}),
          },
        };
      }

      // Default: consider_adding (for PAIRED, SOLO, or when NEAR returns wrong type)
      const category = ALLOWED_ELEVATE_CATEGORIES.includes(
        rec?.category as Category,
      )
        ? (rec?.category as Category)
        : "accessories";

      if (category !== rec?.category) wasRepaired = true;
      if (recType !== "consider_adding" && recType !== "styling_tip") wasRepaired = true;

      const attributes = Array.isArray(rec?.attributes)
        ? (rec?.attributes as unknown[])
            .filter((attr): attr is string => typeof attr === "string")
            .slice(0, 4)
        : ["simple"];

      if (!Array.isArray(rec?.attributes)) wasRepaired = true;

      return {
        text: trimmedText,
        recommend: {
          type: "consider_adding" as const,
          category,
          attributes,
        },
      };
    });
  }

  // NEAR mode uses styling_tip recommendations - skip category-based filtering
  // PAIRED/SOLO modes use consider_adding recommendations - apply category filters
  if (!isNearMode) {
    if (scanCategory) {
      const filtered = toElevate.filter(bullet => {
        if (bullet.recommend.type !== "consider_adding") return true;
        return (bullet.recommend as RecommendConsiderAdding).category !== scanCategory;
      });
      const removed = toElevate
        .filter(bullet => {
          if (bullet.recommend.type !== "consider_adding") return false;
          return (bullet.recommend as RecommendConsiderAdding).category === scanCategory;
        })
        .map(bullet => (bullet.recommend as RecommendConsiderAdding).category);
      if (filtered.length !== toElevate.length) {
        wasRepaired = true;
        removedCategories.push(...removed);
      }
      toElevate = filtered;
    }

    if (preferAddOnCategories) {
      const hasAddOnBullet = toElevate.some(bullet => {
        if (bullet.recommend.type !== "consider_adding") return false;
        return isAddOnCategory((bullet.recommend as RecommendConsiderAdding).category);
      });
      if (hasAddOnBullet && (addOnCategories?.length ?? 0) >= 2) {
        const filtered = toElevate.filter(bullet => {
          if (bullet.recommend.type !== "consider_adding") return true;
          return isAddOnCategory((bullet.recommend as RecommendConsiderAdding).category);
        });
        if (filtered.length !== toElevate.length) {
          wasRepaired = true;
        }
        toElevate = filtered;
      }
    }

    if (preferAddOnCategories && (addOnCategories?.length ?? 0) >= 2) {
      const seen = new Set<Category>();
      const filtered = toElevate.filter(bullet => {
        if (bullet.recommend.type !== "consider_adding") return true;
        const cat = (bullet.recommend as RecommendConsiderAdding).category;
        if (seen.has(cat)) return false;
        seen.add(cat);
        return true;
      });
      if (filtered.length !== toElevate.length) {
        wasRepaired = true;
      }
      toElevate = filtered;
    }
  }

  // Build fallback bullets
  if (isNearMode) {
    // NEAR mode: use styling_tip fallbacks
    const NEAR_FALLBACK_TIPS: ElevateBullet[] = [
      {
        text: "Consider layering to adjust proportions",
        recommend: {
          type: "styling_tip",
          tip: "Try adding a third piece like a cardigan or jacket to balance the silhouette",
        },
      },
      {
        text: "Experiment with different styling techniques",
        recommend: {
          type: "styling_tip",
          tip: "Rolling, cuffing, or tucking can help make pieces work together better",
        },
      },
    ];

    let fallbackIndex = 0;
    while (toElevate.length < 2) {
      toElevate.push({ ...NEAR_FALLBACK_TIPS[fallbackIndex % NEAR_FALLBACK_TIPS.length] });
      fallbackIndex++;
      wasRepaired = true;
    }
  } else {
    // PAIRED/SOLO mode: use consider_adding fallbacks with category logic
    const hasAddOnBullet = toElevate.some(bullet => {
      if (bullet.recommend.type !== "consider_adding") return false;
      return isAddOnCategory((bullet.recommend as RecommendConsiderAdding).category);
    });
    const availableAddOns =
      addOnCategories && addOnCategories.length > 0
        ? addOnCategories
        : FALLBACK_ELEVATE_ADD_ON_ORDER;
    const addOnCount = addOnCategories?.length ?? 0;
    const isSingleAddOnPreference =
      preferAddOnCategories && hasAddOnBullet && addOnCount === 1;
    const addOnOrder = FALLBACK_ELEVATE_ADD_ON_ORDER.filter(category =>
      availableAddOns.includes(category as AddOnCategory),
    );
    const coreOrder = FALLBACK_ELEVATE_ORDER.filter(
      category => !isAddOnCategory(category),
    );
    const coreElevateShortlist: Category[] = [
      "shoes",
      "tops",
    ];
    const coreShortlistOrder = coreElevateShortlist.filter(
      category => category !== (scanCategory ?? null),
    );
    const fallbackOrder =
      isSingleAddOnPreference
        ? [...coreShortlistOrder, ...coreOrder]
        : preferAddOnCategories && hasAddOnBullet
          ? (availableAddOns.length >= 2
              ? addOnOrder
              : [...addOnOrder, ...coreOrder])
          : FALLBACK_ELEVATE_ORDER;

    const buildFallbackElevate = (
      usedCategories: Set<Category>,
      blockedCategory?: Category | null,
    ): ElevateBullet => {
      const fallbackCategory =
        fallbackOrder.find(
          category =>
            category !== blockedCategory && !usedCategories.has(category),
        ) ??
        fallbackOrder.find(
          category => category !== blockedCategory,
        ) ??
        "accessories";

      return {
        ...FALLBACK_TO_ELEVATE,
        recommend: {
          ...FALLBACK_TO_ELEVATE.recommend,
          category: fallbackCategory,
        },
      };
    };

    const usedCategories = new Set(
      toElevate
        .filter(bullet => bullet.recommend.type === "consider_adding")
        .map(bullet => (bullet.recommend as RecommendConsiderAdding).category),
    );
    while (toElevate.length < 2) {
      const fallback = buildFallbackElevate(usedCategories, scanCategory ?? null);
      toElevate.push(fallback);
      usedCategories.add((fallback.recommend as RecommendConsiderAdding).category);
      wasRepaired = true;
    }
  }

  return {
    suggestions: {
      version: 1,
      why_it_works: whyItWorks,
      to_elevate: toElevate,
    },
    wasRepaired,
    removedCategories,
    mentionsStrippedCount,
  };
}
