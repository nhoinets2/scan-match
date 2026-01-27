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
const PROMPT_VERSION = 1;
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

interface SafeMatchInfo {
  id: string;
  category: Category;
  dominant_color: string;
  aesthetic: AestheticArchetype;
  label?: string;
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
  top_matches: SafeMatchInfo[];
  wardrobe_summary: WardrobeSummary;
  intent: 'shopping' | 'own_item';
  cache_key: string;
  scan_id?: string;
}

interface SuggestionBullet {
  text: string;
  mentions: string[];
}

interface ElevateBullet {
  text: string;
  recommend: {
    type: 'consider_adding';
    category: Category;
    attributes: string[];
  };
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
7. Be specific to these actual items, not generic fashion advice
Respond with ONLY the JSON object.`;
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
  recommend: { type: 'consider_adding', category: 'accessories', attributes: ['simple', 'neutral'] },
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

function validateAndRepairSuggestions(
  data: unknown,
  validIds: string[]
): { suggestions: PersonalizedSuggestions; wasRepaired: boolean } {
  const validIdSet = new Set(validIds);
  let wasRepaired = false;
  
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
        
        // Strip invalid mentions (only keep IDs that exist in input)
        const originalMentions = Array.isArray(bullet?.mentions) ? bullet.mentions : [];
        const validMentions = originalMentions.filter((id: unknown) =>
          typeof id === 'string' && validIdSet.has(id)
        );
        
        if (validMentions.length !== originalMentions.length) wasRepaired = true;
        
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
  
  // Process to_elevate
  let toElevate: ElevateBullet[] = [];
  if (Array.isArray(raw.to_elevate)) {
    toElevate = raw.to_elevate
      .slice(0, 2)
      .map(bullet => {
        const rec = bullet?.recommend as Record<string, unknown> | undefined;
        const originalText = typeof bullet?.text === 'string' ? bullet.text : '';
        const trimmedText = smartTrim(originalText || FALLBACK_TO_ELEVATE.text, 100);
        
        if (trimmedText !== originalText) wasRepaired = true;
        
        // Validate category - clamp to allowed values
        const rawCategory = rec?.category as string | undefined;
        const category = (ALLOWED_CATEGORIES as readonly string[]).includes(rawCategory ?? '')
          ? (rawCategory as Category)
          : 'accessories';
        
        if (category !== rawCategory) wasRepaired = true;
        
        // Force type to 'consider_adding'
        if (rec?.type !== 'consider_adding') wasRepaired = true;
        
        // Validate attributes
        const rawAttrs = rec?.attributes;
        const attributes = Array.isArray(rawAttrs)
          ? rawAttrs.filter((a): a is string => typeof a === 'string').slice(0, 4)
          : ['simple'];
        
        return {
          text: trimmedText,
          recommend: {
            type: 'consider_adding' as const,
            category,
            attributes,
          },
        };
      });
  }
  
  // Pad to exactly 2 bullets
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
    const { scan_signals, top_matches, wardrobe_summary, intent, cache_key, scan_id } = body;
    
    // Validate required fields
    if (!scan_signals || !top_matches || !cache_key) {
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "bad_request", message: "Missing required fields" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Validate top_matches (max 5, valid structure)
    if (!Array.isArray(top_matches) || top_matches.length === 0 || top_matches.length > 5) {
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "bad_request", message: "top_matches must be 1-5 items" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const validIds = top_matches.map(m => m.id).filter(id => typeof id === 'string' && id.length > 0);
    if (validIds.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "bad_request", message: "No valid item IDs provided" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[personalized-suggestions] Processing: user=${userId.slice(0, 8)}..., matches=${top_matches.length}, intent=${intent}`);
    
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
    
    const prompt = buildPrompt(scan_signals, top_matches, wardrobe_summary ?? { total: 0, by_category: {}, dominant_aesthetics: [], updated_at: '' }, intent ?? 'own_item');
    
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
      } catch (parseError) {
        const preview = cleanedResponse.slice(0, 200);
        console.error(`[personalized-suggestions] JSON parse failed. Preview: ${preview}`);
        throw parseError;
      }
      
      // Validate and repair
      const result = validateAndRepairSuggestions(rawSuggestions, validIds);
      suggestions = result.suggestions;
      wasRepaired = result.wasRepaired;
      
      console.log(`[personalized-suggestions] OpenAI success in ${latencyMs}ms, repaired=${wasRepaired}`);
      
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
