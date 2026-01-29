/* eslint-disable import/no-unresolved */
// @ts-nocheck - This is a Deno/Supabase Edge Function, not a Node.js file
/**
 * Personalized Suggestions Edge Function
 *
 * Generates AI-powered personalized styling suggestions:
 * - why_it_works: 2 bullets explaining why matched items work together
 * - to_elevate: 2 bullets suggesting what could be added
 *
 * Key security principles:
 * - JWT verified via ANON-KEY client (not service role)
 * - user_id from verified JWT, never from request body
 * - Service role only for database writes
 * - Only IDs + safe enums sent to model (no item names/photos/descriptions)
 *
 * Deploy: supabase functions deploy personalized-suggestions --no-verify-jwt
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Current versions - increment when prompt/schema changes
const PROMPT_VERSION = 2;
const SCHEMA_VERSION = 1;

// Timeout for OpenAI call (fail-open behavior)
const OPENAI_TIMEOUT_MS = 8000;

// ============================================
// ENUM ALLOWLISTS (hardened - model must use these)
// ============================================

const ALLOWED_CATEGORIES = [
  'tops', 'bottoms', 'shoes', 'outerwear', 'dresses', 'accessories', 'bags', 'skirts'
] as const;

const ALLOWED_AESTHETICS = [
  'minimalist', 'classic', 'workwear', 'romantic', 'boho', 'western',
  'street', 'sporty', 'edgy', 'glam', 'preppy', 'outdoor_utility', 'casual', 'unknown'
] as const;

type Category = typeof ALLOWED_CATEGORIES[number];
type AestheticArchetype = typeof ALLOWED_AESTHETICS[number];

// ============================================
// TYPES
// ============================================

// Derived mode (server-side, never trust client)
type SuggestionsMode = 'paired' | 'solo' | 'near';

interface SafeMatchInfo {
  id: string;
  category: Category;
  dominant_color: string;
  aesthetic: AestheticArchetype;
  label?: string;
}

// NEAR match includes cap reasons (why it's close but not HIGH)
interface SafeNearMatchInfo extends SafeMatchInfo {
  cap_reasons?: string[];  // e.g., ['formality_mismatch', 'season_mismatch']
}

interface WardrobeSummary {
  total: number;
  by_category: Record<string, number>;
  dominant_aesthetics: AestheticArchetype[];
  updated_at: string;
}

interface StyleSignalsV1 {
  version: 1;
  aesthetic: {
    primary: string;
    primary_confidence: number;
    secondary: string;
    secondary_confidence: number;
  };
  formality: { band: string; confidence: number };
  statement: { level: string; confidence: number };
  season: { heaviness: string; confidence: number };
  palette: { colors: string[]; confidence: number };
  pattern: { level: string; confidence: number };
  material: { family: string; confidence: number };
}

interface SuggestionsRequest {
  scan_signals: StyleSignalsV1;
  scan_category?: Category;
  top_matches: SafeMatchInfo[];
  near_matches?: SafeNearMatchInfo[];  // NEAR mode: MEDIUM tier items
  wardrobe_summary: WardrobeSummary;
  intent: 'shopping' | 'own_item';
  cache_key: string;
  scan_id?: string;
  has_pairings?: boolean;
  mode?: SuggestionsMode;  // Client hint (telemetry only, NOT trusted)
}

interface SuggestionBullet {
  text: string;
  mentions: string[];
}

// Tagged union for recommend - allows mode-appropriate shapes
type RecommendConsiderAdding = {
  type: 'consider_adding';
  category: Category;
  attributes: string[];
};

type RecommendStylingTip = {
  type: 'styling_tip';
  tip: string;
  tags?: string[];
};

type Recommend = RecommendConsiderAdding | RecommendStylingTip;

interface ElevateBullet {
  text: string;
  recommend: Recommend;
}

interface PersonalizedSuggestions {
  version: 1;
  why_it_works: SuggestionBullet[];
  to_elevate: ElevateBullet[];
}

// ============================================
// HARDENED PROMPT
// ============================================

function buildPrompt(
  scanSignals: StyleSignalsV1,
  topMatches: SafeMatchInfo[],
  wardrobeSummary: WardrobeSummary,
  intent: 'shopping' | 'own_item'
): string {
  const validIds = topMatches.map(m => m.id);
  const validIdsList = validIds.join(', ');
  
  // Compact context to keep latency low
  const scanSummary = `aesthetic:${scanSignals.aesthetic?.primary ?? 'unknown'}; formality:${scanSignals.formality?.band ?? 'unknown'}; statement:${scanSignals.statement?.level ?? 'unknown'}; season:${scanSignals.season?.heaviness ?? 'unknown'}; pattern:${scanSignals.pattern?.level ?? 'unknown'}; colors:${scanSignals.palette?.colors?.join('/') ?? 'unknown'}`;
  const matchesSummary = topMatches.map(m =>
    `${m.id}|${m.category}|${m.dominant_color}|${m.aesthetic}`
  ).join(',');
  const wardrobeOverview = `total:${wardrobeSummary.total}; categories:${Object.entries(wardrobeSummary.by_category).map(([k, v]) => `${k}:${v}`).join(',')}; aesthetics:${wardrobeSummary.dominant_aesthetics?.join('/') ?? 'varied'}`;

  return `You are a personal stylist. Output ONLY JSON.

CONTEXT:
intent:${intent}
scan:${scanSummary}
matches:${matchesSummary}
wardrobe:${wardrobeOverview}

OUTPUT FORMAT (strict JSON only):
{
  "why_it_works": [
    { "text": "explanation without naming items", "mentions": ["ITEM_ID"] },
    { "text": "explanation without naming items", "mentions": ["ITEM_ID"] }
  ],
  "to_elevate": [
    { "text": "why this would help", "recommend": { "type": "consider_adding", "category": "CATEGORY", "attributes": ["attr1", "attr2"] } },
    { "text": "why this would help", "recommend": { "type": "consider_adding", "category": "CATEGORY", "attributes": ["attr1", "attr2"] } }
  ]
}

STRICT RULES (must follow):
1. "mentions" array MUST ONLY contain IDs from: [${validIdsList}]
2. NEVER write item names, labels, or descriptions in "text" - only put IDs in "mentions"
3. NEVER claim the user owns something not in the provided list
4. "to_elevate" MUST use type: "consider_adding" (never reference owned items)
5. "category" in to_elevate MUST be one of: ${ALLOWED_CATEGORIES.join(', ')}
6. Keep "text" concise (aim for 60-80 characters, max 100)
7. "attributes" must be natural language (e.g., "solid color" not "solid_color", "fitted silhouette" not "fitted_silhouette")
8. Be specific to these actual items, not generic fashion advice
Respond with ONLY the JSON object.`;
}

function buildSoloPrompt(
  scanSignals: StyleSignalsV1,
  scannedCategory: Category,
  wardrobeSummary: WardrobeSummary,
  intent: 'shopping' | 'own_item'
): string {
  const scanSummary = `aesthetic:${scanSignals.aesthetic?.primary ?? 'unknown'}; formality:${scanSignals.formality?.band ?? 'unknown'}; statement:${scanSignals.statement?.level ?? 'unknown'}; season:${scanSignals.season?.heaviness ?? 'unknown'}; pattern:${scanSignals.pattern?.level ?? 'unknown'}; colors:${scanSignals.palette?.colors?.join('/') ?? 'unknown'}`;
  const wardrobeOverview = `total:${wardrobeSummary.total}; categories:${Object.entries(wardrobeSummary.by_category).map(([k, v]) => `${k}:${v}`).join(',')}; aesthetics:${wardrobeSummary.dominant_aesthetics?.join('/') ?? 'varied'}`;

  return `You are a personal stylist. Output ONLY JSON.

CONTEXT:
intent:${intent}
scanned_item:category=${scannedCategory}
scan:${scanSummary}
wardrobe:${wardrobeOverview}
matches:[] (solo mode - no pairings)

OUTPUT FORMAT (strict JSON only):
{
  "why_it_works": [
    { "text": "specific styling tip for this ${scannedCategory}", "mentions": [] },
    { "text": "complementary styling approach for this item", "mentions": [] }
  ],
  "to_elevate": [
    { "text": "why this would help", "recommend": { "type": "consider_adding", "category": "CATEGORY", "attributes": ["attr1", "attr2"] } },
    { "text": "why this would help", "recommend": { "type": "consider_adding", "category": "CATEGORY", "attributes": ["attr1", "attr2"] } }
  ]
}

STRICT RULES (must follow):
1. Do NOT imply the user owns any specific item
2. Do NOT say "with your ..." or reference wardrobe item names
3. "mentions" MUST be an empty array for all bullets
4. "to_elevate" MUST use type: "consider_adding"
5. "category" in to_elevate MUST be one of: ${ALLOWED_CATEGORIES.join(', ')}
6. Keep "text" concise (aim for 60-80 characters, max 100)
7. "attributes" must be natural language (e.g., "solid color" not "solid_color", "fitted silhouette" not "fitted_silhouette")
8. Focus on how to style THIS ${scannedCategory}, not generic advice
9. For "to_elevate": PRIORITIZE core outfit-forming pieces first:
   - If scanned item is outerwear/accessories: suggest tops, bottoms, shoes, dresses
   - If scanned item is tops/bottoms/shoes: suggest complementary core pieces to complete outfit
   - Only suggest accessories AFTER core pieces are covered
10. "category" in to_elevate should be core pieces (tops, bottoms, shoes, dresses) NOT accessories/bags/outerwear
Respond with ONLY the JSON object.`;
}

/**
 * Build NEAR mode prompt - focuses on "how to make it work"
 * NEAR matches are MEDIUM tier items that are close but not HIGH
 */
function buildNearPrompt(
  scanSignals: StyleSignalsV1,
  nearMatches: SafeNearMatchInfo[],
  wardrobeSummary: WardrobeSummary,
  intent: 'shopping' | 'own_item'
): string {
  // Cap to top 3 near matches to keep prompt small
  const topNearMatches = nearMatches.slice(0, 3);
  const validIds = topNearMatches.map(m => m.id);
  const validIdsList = validIds.join(', ');
  
  // Compact context
  const scanSummary = `aesthetic:${scanSignals.aesthetic?.primary ?? 'unknown'}; formality:${scanSignals.formality?.band ?? 'unknown'}; statement:${scanSignals.statement?.level ?? 'unknown'}; season:${scanSignals.season?.heaviness ?? 'unknown'}; pattern:${scanSignals.pattern?.level ?? 'unknown'}; colors:${scanSignals.palette?.colors?.join('/') ?? 'unknown'}`;
  
  // Include cap reasons (top 2 per match) to explain why it's NEAR not HIGH
  const matchesSummary = topNearMatches.map(m => {
    const capReasons = (m.cap_reasons ?? []).slice(0, 2).join('+') || 'style_gap';
    return `${m.id}|${m.category}|${m.dominant_color}|${m.aesthetic}|cap:${capReasons}`;
  }).join(',');
  
  const wardrobeOverview = `total:${wardrobeSummary.total}; categories:${Object.entries(wardrobeSummary.by_category).map(([k, v]) => `${k}:${v}`).join(',')}; aesthetics:${wardrobeSummary.dominant_aesthetics?.join('/') ?? 'varied'}`;

  return `You are a personal stylist. Output ONLY JSON.

CONTEXT:
intent:${intent}
scan:${scanSummary}
near_matches:${matchesSummary}
wardrobe:${wardrobeOverview}
note: These items are CLOSE matches but not perfect. Focus on HOW to make them work.

OUTPUT FORMAT (strict JSON only):
{
  "why_it_works": [
    { "text": "why this item is close to working", "mentions": ["ITEM_ID"] },
    { "text": "why this item is close to working", "mentions": ["ITEM_ID"] }
  ],
  "to_elevate": [
    { "text": "how to bridge the style gap", "recommend": { "type": "styling_tip", "tip": "specific styling advice", "tags": ["tag1"] } },
    { "text": "how to bridge the style gap", "recommend": { "type": "styling_tip", "tip": "specific styling advice", "tags": ["tag1"] } }
  ]
}

STRICT RULES (must follow):
1. "mentions" array MUST ONLY contain IDs from: [${validIdsList}]
2. NEVER write item names, labels, or descriptions in "text" - only put IDs in "mentions"
3. "to_elevate" MUST use type: "styling_tip" (NOT "consider_adding" - focus on styling, not buying)
4. "tip" must be specific styling advice to bridge the gap (e.g., "tuck in for cleaner silhouette")
5. "tags" are optional keywords for the tip (e.g., ["proportion", "layering"])
6. Keep "text" concise (aim for 60-80 characters, max 100)
7. Use natural language (e.g., "solid color" not "solid_color", "fitted silhouette" not "fitted_silhouette")
8. Focus on HOW to style these items to make them work, based on cap reasons
Respond with ONLY the JSON object.`;
}

// ============================================
// VALIDATION & REPAIR
// ============================================

const FALLBACK_WHY_IT_WORKS: SuggestionBullet = {
  text: "The colors and styles complement each other well",
  mentions: [],
};

const FALLBACK_TO_ELEVATE_CONSIDER_ADDING: ElevateBullet = {
  text: "Could add visual interest",
  recommend: { type: 'consider_adding', category: 'accessories', attributes: ['simple', 'neutral'] },
};

const FALLBACK_TO_ELEVATE_STYLING_TIP: ElevateBullet = {
  text: "Try adjusting proportions for better balance",
  recommend: { type: 'styling_tip', tip: 'Experiment with tucking or layering to improve the silhouette', tags: ['proportion'] },
};

/**
 * Smart text trimming - avoids chopping mid-word
 */
function smartTrim(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  
  const trimmed = text.slice(0, maxLen);
  const lastSpace = trimmed.lastIndexOf(' ');
  
  if (lastSpace > maxLen * 0.6) {
    return trimmed.slice(0, lastSpace) + '…';
  }
  
  return trimmed.slice(0, maxLen - 1) + '…';
}

/**
 * Validate and repair AI suggestions
 * 
 * @param data - Raw AI response
 * @param validIds - Valid item IDs for mentions (top_matches for paired, near_matches for near, empty for solo)
 * @param mode - Derived mode: 'paired', 'solo', or 'near'
 * @returns Validated/repaired suggestions + repair flag
 */
function validateAndRepairSuggestions(
  data: unknown,
  validIds: string[],
  mode: SuggestionsMode
): { suggestions: PersonalizedSuggestions; wasRepaired: boolean; mentionsStrippedCount: number } {
  const validIdSet = new Set(validIds);
  let wasRepaired = false;
  let mentionsStrippedCount = 0;
  const runtimeEnv = (Deno.env.get("SUPABASE_ENV") ?? Deno.env.get("DENO_ENV") ?? "").toLowerCase();
  const isDev = runtimeEnv === "development" || runtimeEnv === "local";
  const suspiciousWithYour = /\bwith your\b/i;
  const suspiciousYourItem = /\byour\s+\w+/i;
  
  const isSoloMode = mode === 'solo';
  const isNearMode = mode === 'near';
  
  // Ensure object shape
  const raw = (typeof data === 'object' && data !== null) 
    ? data as Record<string, unknown> 
    : {};
  
  // Process why_it_works
  let whyItWorks: SuggestionBullet[] = [];
  if (Array.isArray(raw.why_it_works)) {
    whyItWorks = raw.why_it_works
      .slice(0, 2)
      .map(bullet => {
        const originalText = typeof bullet?.text === 'string' ? bullet.text : '';
        const trimmedText = smartTrim(originalText || FALLBACK_WHY_IT_WORKS.text, 100);
        
        if (trimmedText !== originalText) wasRepaired = true;
        
        const originalMentions = Array.isArray(bullet?.mentions) ? bullet.mentions : [];

        // SOLO mode: force empty mentions
        if (isSoloMode) {
          if (originalMentions.length > 0) {
            wasRepaired = true;
            mentionsStrippedCount += originalMentions.length;
          }
          if (isDev && (suspiciousWithYour.test(trimmedText) || suspiciousYourItem.test(trimmedText))) {
            console.warn("[personalized-suggestions] Solo suspicious phrase in why_it_works:", trimmedText);
          }
          return {
            text: trimmedText,
            mentions: [],
          };
        }

        // PAIRED or NEAR mode: strip invalid mentions (must be subset of validIds)
        const validMentions = originalMentions.filter((id: unknown) =>
          typeof id === 'string' && validIdSet.has(id)
        );

        const strippedCount = originalMentions.length - validMentions.length;
        if (strippedCount > 0) {
          wasRepaired = true;
          mentionsStrippedCount += strippedCount;
          if (isDev) {
            console.warn(`[personalized-suggestions] ${mode} mode: stripped ${strippedCount} invalid mentions`);
          }
        }

        return {
          text: trimmedText,
          mentions: validMentions,
        };
      });
  }
  
  // Pad to exactly 2 bullets
  while (whyItWorks.length < 2) {
    whyItWorks.push({ ...FALLBACK_WHY_IT_WORKS });
    wasRepaired = true;
  }
  
  // Process to_elevate with recommend union validation
  let toElevate: ElevateBullet[] = [];
  if (Array.isArray(raw.to_elevate)) {
    toElevate = raw.to_elevate
      .slice(0, 2)
      .map(bullet => {
        const rec = bullet?.recommend as Record<string, unknown> | undefined;
        const recType = rec?.type as string | undefined;
        
        // NEAR mode expects styling_tip; PAIRED/SOLO expect consider_adding
        const expectedType = isNearMode ? 'styling_tip' : 'consider_adding';
        
        // Determine which type the model returned
        if (recType === 'styling_tip') {
          // Validate styling_tip type
          const rawTip = rec?.tip;
          const tip = typeof rawTip === 'string' && rawTip.trim() 
            ? smartTrim(rawTip.trim(), 100)
            : 'Experiment with layering or proportions';
          
          if (tip !== rawTip) wasRepaired = true;
          
          const rawTags = rec?.tags;
          const tags = Array.isArray(rawTags)
            ? rawTags.filter((t): t is string => typeof t === 'string').slice(0, 4)
            : undefined;
          
          const originalText = typeof bullet?.text === 'string' ? bullet.text : '';
          const trimmedText = smartTrim(originalText || FALLBACK_TO_ELEVATE_STYLING_TIP.text, 100);
          if (trimmedText !== originalText) wasRepaired = true;
          
          // If we got styling_tip but expected consider_adding (paired/solo), repair to consider_adding
          if (expectedType === 'consider_adding') {
            wasRepaired = true;
            return {
              text: trimmedText,
              recommend: {
                type: 'consider_adding' as const,
                category: 'accessories' as Category,
                attributes: ['simple', 'complementary'],
              },
            };
          }
          
          return {
            text: trimmedText,
            recommend: {
              type: 'styling_tip' as const,
              tip,
              ...(tags && tags.length > 0 ? { tags } : {}),
            },
          };
        } else {
          // Validate consider_adding type (or unknown type → default to consider_adding for paired/solo)
          const originalText = typeof bullet?.text === 'string' ? bullet.text : '';
          const trimmedText = smartTrim(originalText || FALLBACK_TO_ELEVATE_CONSIDER_ADDING.text, 100);
          
          if (trimmedText !== originalText) wasRepaired = true;
          
          // Validate category - clamp to allowed values
          const rawCategory = rec?.category as string | undefined;
          const category = (ALLOWED_CATEGORIES as readonly string[]).includes(rawCategory ?? '')
            ? (rawCategory as Category)
            : 'accessories';
          
          if (category !== rawCategory) wasRepaired = true;
          
          // Check type mismatch
          if (recType !== 'consider_adding') wasRepaired = true;
          
          // Validate attributes
          const rawAttrs = rec?.attributes;
          const attributes = Array.isArray(rawAttrs)
            ? rawAttrs
                .filter((a): a is string => typeof a === 'string')
                .map(a => a.replace(/_/g, ' ').trim())
                .slice(0, 4)
            : ['simple'];
          
          // If we got consider_adding but expected styling_tip (near mode), repair to styling_tip
          if (expectedType === 'styling_tip') {
            wasRepaired = true;
            // Convert category+attributes suggestion to a styling tip
            const convertedTip = `Consider adding ${attributes.join(', ')} ${category} to complete the look`;
            return {
              text: trimmedText,
              recommend: {
                type: 'styling_tip' as const,
                tip: smartTrim(convertedTip, 100),
                tags: [category],
              },
            };
          }
          
          return {
            text: trimmedText,
            recommend: {
              type: 'consider_adding' as const,
              category,
              attributes,
            },
          };
        }
      });
  }
  
  // Pad to exactly 2 bullets with mode-appropriate fallback
  const fallbackToElevate = isNearMode 
    ? FALLBACK_TO_ELEVATE_STYLING_TIP 
    : FALLBACK_TO_ELEVATE_CONSIDER_ADDING;
  while (toElevate.length < 2) {
    toElevate.push({ ...fallbackToElevate });
    wasRepaired = true;
  }
  
  return {
    suggestions: {
      version: 1,
      why_it_works: whyItWorks,
      to_elevate: toElevate,
    },
    wasRepaired,
    mentionsStrippedCount,
  };
}

// ============================================
// MAIN HANDLER
// ============================================

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // ============================================
    // 1. VERIFY JWT (using ANON-KEY client, NOT service role)
    // ============================================
    
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    
    if (!token) {
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "unauthorized", message: "Missing auth token" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // CRITICAL: Use ANON-KEY client with user's token to verify identity
    // User identity comes from a client configured with the user's bearer token
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    
    if (authError || !user) {
      console.error("[personalized-suggestions] Auth error:", authError);
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "unauthorized", message: "Invalid auth token" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // CRITICAL: user_id from verified JWT, NOT from request body
    const userId = user.id;
    
    // ============================================
    // 2. PARSE REQUEST (but DON'T trust user_id from it)
    // ============================================
    
    const body: SuggestionsRequest = await req.json();
    const { scan_signals, scan_category, top_matches, near_matches, wardrobe_summary, intent, cache_key, scan_id, has_pairings } = body;
    void has_pairings;
    
    // Validate required fields (near_matches optional)
    if (!scan_signals || !cache_key) {
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "bad_request", message: "Missing required fields" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Ensure arrays exist (top_matches can be undefined for NEAR mode)
    const safeTopMatches = Array.isArray(top_matches) ? top_matches : [];
    const safeNearMatches = Array.isArray(near_matches) ? near_matches : [];
    
    // Validate array sizes
    if (safeTopMatches.length > 5) {
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "bad_request", message: "top_matches must be 0-5 items" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (safeNearMatches.length > 5) {
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "bad_request", message: "near_matches must be 0-5 items" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // MODE DERIVATION (server-side, never trust client)
    // ============================================
    // Priority: near_matches > top_matches > solo
    const derivedMode: SuggestionsMode = safeNearMatches.length > 0 
      ? 'near' 
      : safeTopMatches.length === 0 
        ? 'solo' 
        : 'paired';
    
    // Get valid IDs based on mode
    const validIds = derivedMode === 'near'
      ? safeNearMatches.map(m => m.id).filter(id => typeof id === 'string' && id.length > 0)
      : safeTopMatches.map(m => m.id).filter(id => typeof id === 'string' && id.length > 0);
    
    // For paired/near modes, require at least one valid ID
    if (derivedMode !== 'solo' && validIds.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "bad_request", message: "No valid item IDs provided" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[personalized-suggestions] Processing: user=${userId.slice(0, 8)}..., mode=${derivedMode}, top=${safeTopMatches.length}, near=${safeNearMatches.length}, intent=${intent}`);
    
    // ============================================
    // 3. CALL OPENAI WITH TIMEOUT
    // ============================================
    
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      console.error("[personalized-suggestions] OPENAI_API_KEY not configured");
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "server_error", message: "AI service not configured" } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const safeWardrobeSummary = wardrobe_summary ?? { total: 0, by_category: {}, dominant_aesthetics: [], updated_at: '' };
    const safeScanCategory = (ALLOWED_CATEGORIES as readonly string[]).includes(scan_category ?? '')
      ? (scan_category as Category)
      : 'tops';
    
    // Build prompt based on derived mode
    let prompt: string;
    switch (derivedMode) {
      case 'near':
        prompt = buildNearPrompt(scan_signals, safeNearMatches, safeWardrobeSummary, intent ?? 'own_item');
        break;
      case 'solo':
        console.log(`[personalized-suggestions] Solo mode: scan_category=${safeScanCategory}`);
        prompt = buildSoloPrompt(scan_signals, safeScanCategory, safeWardrobeSummary, intent ?? 'own_item');
        break;
      case 'paired':
      default:
        prompt = buildPrompt(scan_signals, safeTopMatches, safeWardrobeSummary, intent ?? 'own_item');
        break;
    }
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error(`[personalized-suggestions] Timeout reached (${OPENAI_TIMEOUT_MS}ms), aborting OpenAI request`);
      controller.abort();
    }, OPENAI_TIMEOUT_MS);
    
    let suggestions: PersonalizedSuggestions;
    let wasRepaired = false;
    let latencyMs: number;
    
    try {
      const openaiStart = Date.now();
      
      console.log(`[personalized-suggestions] OpenAI request start (timeout ${OPENAI_TIMEOUT_MS}ms)`);
      const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "user", content: prompt },
          ],
          max_tokens: 300,
          temperature: 0.1, // Favor speed + consistency
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      
      console.log(`[personalized-suggestions] OpenAI response received in ${Date.now() - openaiStart}ms`);
      
      latencyMs = Date.now() - openaiStart;
      
      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        console.error(`[personalized-suggestions] OpenAI error: ${openaiResponse.status}`, errorText);
        throw new Error(`OpenAI error: ${openaiResponse.status}`);
      }
      
      const openaiData = await openaiResponse.json();
      const finishReason = openaiData?.choices?.[0]?.finish_reason ?? "unknown";
      const responseText = openaiData.choices?.[0]?.message?.content ?? "";
      console.log(`[personalized-suggestions] OpenAI finish_reason=${finishReason}, content_length=${responseText.length}`);
      
      if (!responseText) {
        throw new Error("Empty response from OpenAI");
      }

      if (finishReason === "length") {
        throw new Error("OpenAI response truncated (finish_reason=length)");
      }
      
      // Parse JSON response (strip markdown if present)
      let cleanedResponse = responseText.trim();
      if (cleanedResponse.startsWith("```json")) cleanedResponse = cleanedResponse.slice(7);
      if (cleanedResponse.startsWith("```")) cleanedResponse = cleanedResponse.slice(3);
      if (cleanedResponse.endsWith("```")) cleanedResponse = cleanedResponse.slice(0, -3);
      cleanedResponse = cleanedResponse.trim();
      
      let rawSuggestions: unknown;
      try {
        rawSuggestions = JSON.parse(cleanedResponse);
        console.log(`[personalized-suggestions] Raw AI response:`, JSON.stringify(rawSuggestions, null, 2));
      } catch (parseError) {
        const preview = cleanedResponse.slice(0, 200);
        console.error(`[personalized-suggestions] JSON parse failed. Preview: ${preview}`);
        throw parseError;
      }
      
      // Validate and repair
      const result = validateAndRepairSuggestions(rawSuggestions, validIds, derivedMode);
      suggestions = result.suggestions;
      wasRepaired = result.wasRepaired;
      
      console.log(`[personalized-suggestions] OpenAI success in ${latencyMs}ms, mode=${derivedMode}, repaired=${wasRepaired}, mentionsStripped=${result.mentionsStrippedCount}`);
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      const err = error as Error;
      const isTimeout = err.name === 'AbortError';
      const errorKind = isTimeout ? 'timeout' : 'openai_error';
      
      console.error(`[personalized-suggestions] ${errorKind}: ${err.message}`);
      
      // Fail-open: return error, client shows nothing
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: { kind: errorKind, message: isTimeout ? 'Request timed out' : err.message } 
        }),
        { status: isTimeout ? 504 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    clearTimeout(timeoutId);
    
    // ============================================
    // 4. WRITE TO CACHE (using SERVICE ROLE)
    // ============================================
    
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    
    try {
      await serviceClient
        .from('personalized_suggestions_cache')
        .upsert({
          user_id: userId,  // From verified JWT, NOT request body
          cache_key,
          suggestions,
          prompt_version: PROMPT_VERSION,
          schema_version: SCHEMA_VERSION,
          latency_ms: latencyMs,
          source: 'ai_call',
          scan_id: scan_id ?? null,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        }, {
          onConflict: 'user_id,cache_key',
        });
        
      console.log(`[personalized-suggestions] Cached for user=${userId.slice(0, 8)}...`);
    } catch (cacheError) {
      // Log but don't fail - suggestions still work without caching
      console.error(`[personalized-suggestions] Cache write failed:`, cacheError);
    }
    
    // ============================================
    // 5. RETURN RESPONSE
    // ============================================
    
    const totalDuration = Date.now() - startTime;
    console.log(`[personalized-suggestions] Complete in ${totalDuration}ms (OpenAI: ${latencyMs}ms)`);
    
    return new Response(
      JSON.stringify({
        ok: true,
        data: suggestions,
        meta: {
          source: 'ai_call',
          mode: derivedMode,
          latencyMs,
          wasRepaired,
          promptVersion: PROMPT_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error("[personalized-suggestions] Unexpected error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: { kind: "unknown", message: "Something went wrong" } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
