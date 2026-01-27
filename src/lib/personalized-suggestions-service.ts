/**
 * Personalized Suggestions Service
 *
 * Client-side service for fetching AI-generated personalized suggestions.
 * Uses cache-first strategy with hashed cache key and fail-open behavior.
 */

import * as Crypto from "expo-crypto";
import { supabase } from "./supabase";
import type { StyleSignalsV1, AestheticArchetype } from "./trust-filter/types";
import type { EnrichedMatch } from "./useConfidenceEngine";
import { ALLOWED_ELEVATE_CATEGORIES } from "./types";
import type {
  Category,
  StyleVibe,
  WardrobeItem,
  PersonalizedSuggestions,
  SafeMatchInfo,
  WardrobeSummary,
  SuggestionBullet,
  ElevateBullet,
} from "./types";

// ============================================
// CONFIG
// ============================================

const PROMPT_VERSION = 1;
const SCHEMA_VERSION = 1;
const TIMEOUT_MS = 1200;

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

export async function fetchPersonalizedSuggestions({
  scanId,
  scanSignals,
  highFinal,
  wardrobeSummary,
  intent,
}: {
  scanId: string;
  scanSignals: StyleSignalsV1;
  highFinal: EnrichedMatch[];
  wardrobeSummary: WardrobeSummary;
  intent: "shopping" | "own_item";
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

  const topIds = topMatches.map(match => match.id).sort().join("|");
  const rawKey = `${scanId}|${topIds}|${wardrobeSummary.updated_at}|${PROMPT_VERSION}|${SCHEMA_VERSION}`;
  const cacheKey = await sha256Hex(rawKey);

  const cached = await checkSuggestionsCache(cacheKey);
  if (cached) {
    void incrementCacheHit(cacheKey);
    return { ok: true, data: cached, source: "cache_hit" };
  }

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
        top_matches: topMatches,
        wardrobe_summary: wardrobeSummary,
        intent,
        cache_key: cacheKey,
        scan_id: scanId,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const { suggestions, wasRepaired } = validateAndRepairSuggestions(
      payload,
      topMatches.map(match => match.id),
    );

    return { ok: true, data: suggestions, source: "ai_call", wasRepaired };
  } catch (error) {
    const err = error as Error;
    const isTimeout = err.name === "AbortError";
    const kind = isTimeout ? "timeout" : "network";

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
): { suggestions: PersonalizedSuggestions; wasRepaired: boolean } {
  const validIdSet = new Set(validIds);
  let wasRepaired = false;

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
      const validMentions = originalMentions.filter(
        (id: unknown): id is string =>
          typeof id === "string" && validIdSet.has(id),
      );

      if (validMentions.length !== originalMentions.length) {
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

      const category = ALLOWED_ELEVATE_CATEGORIES.includes(
        rec?.category as Category,
      )
        ? (rec?.category as Category)
        : "accessories";

      if (category !== rec?.category) wasRepaired = true;
      if (rec?.type !== "consider_adding") wasRepaired = true;

      const attributes = Array.isArray(rec?.attributes)
        ? (rec?.attributes as unknown[])
            .filter((attr): attr is string => typeof attr === "string")
            .slice(0, 4)
        : ["simple"];

      if (!Array.isArray(rec?.attributes)) wasRepaired = true;

      return {
        text: trimmedText,
        recommend: {
          type: "consider_adding",
          category,
          attributes,
        },
      };
    });
  }

  while (toElevate.length < 2) {
    toElevate.push({ ...FALLBACK_TO_ELEVATE });
    wasRepaired = true;
  }

  return {
    suggestions: {
      version: 1,
      why_it_works: whyItWorks,
      to_elevate: toElevate,
    },
    wasRepaired,
  };
}
