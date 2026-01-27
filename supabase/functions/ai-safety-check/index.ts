/* eslint-disable import/no-unresolved */
// @ts-nocheck - This is a Deno/Supabase Edge Function, not a Node.js file
/**
 * AI Safety Check Edge Function
 *
 * Targeted LLM-based sanity check for borderline Trust Filter results.
 * Called for top K HIGH_FINAL matches to veto or demote obvious mismatches
 * that deterministic rules missed.
 *
 * Features:
 * - Cache-first lookup (by unique_key)
 * - Timeout (1000ms default) + fallback keep
 * - Rate limit (50/day default, ai_call only)
 * - Strict JSON parsing + schema validation
 * - Dry-run mode (returns verdicts but clients don't apply)
 * - Telemetry: source + latency_ms
 *
 * Deploy: supabase functions deploy ai-safety-check --no-verify-jwt
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================
// CONFIGURATION (from env vars)
// ============================================

const AI_SAFETY_ENABLED = Deno.env.get("AI_SAFETY_ENABLED") !== "false"; // default: true
const AI_SAFETY_DRY_RUN = Deno.env.get("AI_SAFETY_DRY_RUN") === "true"; // default: false
const AI_SAFETY_TIMEOUT_MS = parseInt(Deno.env.get("AI_SAFETY_TIMEOUT_MS") || "3000", 10);
const AI_SAFETY_DAILY_CAP = parseInt(Deno.env.get("AI_SAFETY_DAILY_CAP") || "50", 10);
const AI_SAFETY_MODEL_ID = Deno.env.get("AI_SAFETY_MODEL_ID") || "gpt-4o";
const AI_SAFETY_PROMPT_VERSION = parseInt(Deno.env.get("AI_SAFETY_PROMPT_VERSION") || "1", 10);
const AI_SAFETY_CACHE_TTL_DAYS = parseInt(Deno.env.get("AI_SAFETY_CACHE_TTL_DAYS") || "7", 10);

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// AI SAFETY CHECK PROMPT (Locked)
// ============================================

const AI_SAFETY_PROMPT = `You are a wardrobe pairing validator. Given a SCAN item (what the user photographed) and MATCH candidates from their wardrobe, decide if each pairing makes visual/style sense.

For each pair, output:
- action: "keep" | "demote" | "hide"
- reason_code: one of ai_keep, ai_sanity_veto, ai_sanity_demote
- confidence: 0.0-1.0
- reason: 1 short sentence

Rules:
- "hide" (ai_sanity_veto): obvious clash that would embarrass the user (e.g., formal dress shoes + gym shorts)
- "demote" (ai_sanity_demote): questionable but possible outfit (e.g., statement boots + athleisure hoodie)
- "keep" (ai_keep): reasonable pairing, even if not obvious

Be CONSERVATIVE: only hide/demote if the clash is clear. When in doubt, keep.

Examples:
- western boots (statement high, casual) + black joggers (athleisure, sporty) → hide, ai_sanity_veto, 0.95, "Cowboy boots clash with athletic joggers."
- western boots (statement high, casual) + dark straight jeans (casual, classic) → keep, ai_keep, 0.9, "Both casual; classic denim anchors statement boots."
- western boots (statement high, casual) + athleisure hoodie (athleisure, sporty) → demote, ai_sanity_demote, 0.75, "Sporty top clashes with western aesthetic; risky but possible."
- silk blouse (office, romantic) + cargo shorts (casual, workwear) → hide, ai_sanity_veto, 0.9, "Dressy top inappropriate with casual cargo shorts."
- minimal white sneakers (casual, minimalist) + navy chinos (smart_casual, classic) → keep, ai_keep, 0.95, "Clean pairing; sneakers work with smart casual."

Respond ONLY with valid JSON array, no markdown:
[{"itemId":"<id>","action":"keep|demote|hide","reason_code":"ai_keep|ai_sanity_veto|ai_sanity_demote","confidence":<0-1>,"reason":"<short explanation>"}]`;

// ============================================
// TYPES
// ============================================

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

interface PairInput {
  itemId: string;
  match_input_hash: string;
  pairType: string; // e.g., "shoes+bottoms", "shoes+tops"
  trust_filter_distance: string; // e.g., "close", "medium", "far"
  match_signals: StyleSignalsV1;
}

interface AISafetyRequest {
  scan: {
    input_hash: string;
    signals: StyleSignalsV1;
  };
  pairs: PairInput[];
  /** Client's requested dry_run preference (informational only - server decides) */
  dry_run?: boolean;
  /** Client's policy version (for debugging/logging - server uses its own) */
  policy_version?: number;
}

interface VerdictResult {
  itemId: string;
  action: "keep" | "demote" | "hide";
  reason_code: "ai_keep" | "ai_sanity_veto" | "ai_sanity_demote" | "timeout_fallback" | "error_fallback";
  ai_confidence: number | null;
  ai_reason: string | null;
  source: "ai_call" | "cache_hit";
  latency_ms: number | null;
  cached: boolean;
}

interface AIModelResponse {
  itemId: string;
  action: "keep" | "demote" | "hide";
  reason_code: string;
  confidence: number;
  reason: string;
}

// ============================================
// HELPER: Compute unique cache key
// ============================================

function computeUniqueKey(scanHash: string, matchHash: string, promptVersion: number): string {
  return `${scanHash}|${matchHash}|v${promptVersion}`;
}

// ============================================
// HELPER: Format signals for prompt
// ============================================

function formatSignalsForPrompt(signals: StyleSignalsV1): string {
  return `aesthetic=${signals.aesthetic.primary}(${signals.aesthetic.primary_confidence.toFixed(2)}), ` +
    `formality=${signals.formality.band}, statement=${signals.statement.level}, ` +
    `season=${signals.season.heaviness}, material=${signals.material.family}`;
}

// ============================================
// HELPER: Build AI prompt for batch
// ============================================

function buildPromptContent(
  scanSignals: StyleSignalsV1,
  pairs: PairInput[]
): string {
  const scanDesc = formatSignalsForPrompt(scanSignals);
  
  const pairsDesc = pairs.map((p, i) => {
    const matchDesc = formatSignalsForPrompt(p.match_signals);
    return `${i + 1}. itemId="${p.itemId}", pairType=${p.pairType}, distance=${p.trust_filter_distance}\n   Match: ${matchDesc}`;
  }).join("\n");

  return `SCAN ITEM:\n${scanDesc}\n\nMATCH CANDIDATES:\n${pairsDesc}\n\nEvaluate each pair and respond with JSON array.`;
}

// ============================================
// HELPER: Parse AI response with validation
// ============================================

function parseAIResponse(responseText: string, expectedItemIds: string[]): Map<string, AIModelResponse> {
  const results = new Map<string, AIModelResponse>();
  
  // Clean markdown if present
  let cleaned = responseText.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();
  
  const parsed = JSON.parse(cleaned);
  
  if (!Array.isArray(parsed)) {
    throw new Error("Expected JSON array from AI");
  }
  
  for (const item of parsed) {
    if (!item.itemId || !item.action || !item.reason_code) {
      console.warn("[ai-safety] Skipping malformed item:", item);
      continue;
    }
    
    // Validate action
    if (!["keep", "demote", "hide"].includes(item.action)) {
      console.warn(`[ai-safety] Invalid action '${item.action}' for ${item.itemId}, defaulting to keep`);
      item.action = "keep";
      item.reason_code = "error_fallback";
    }
    
    // Validate reason_code
    const validReasonCodes = ["ai_keep", "ai_sanity_veto", "ai_sanity_demote"];
    if (!validReasonCodes.includes(item.reason_code)) {
      // Map action to appropriate reason_code
      item.reason_code = item.action === "hide" ? "ai_sanity_veto" : 
                         item.action === "demote" ? "ai_sanity_demote" : "ai_keep";
    }
    
    // Clamp confidence
    item.confidence = Math.max(0, Math.min(1, item.confidence ?? 0.5));
    
    results.set(item.itemId, item);
  }
  
  // Fill in any missing items with keep fallback
  for (const itemId of expectedItemIds) {
    if (!results.has(itemId)) {
      results.set(itemId, {
        itemId,
        action: "keep",
        reason_code: "error_fallback",
        confidence: 0,
        reason: "Item not evaluated by AI",
      });
    }
  }
  
  return results;
}

// ============================================
// HELPER: Call AI with timeout
// ============================================

async function callAIWithTimeout(
  openaiKey: string,
  prompt: string,
  content: string,
  timeoutMs: number,
  modelId: string
): Promise<{ success: boolean; response?: string; latencyMs: number; error?: string }> {
  const startTime = Date.now();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content },
        ],
        max_tokens: 1000,
        temperature: 0,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, latencyMs, error: `OpenAI error: ${response.status} - ${errorText}` };
    }
    
    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content ?? "";
    
    return { success: true, response: responseText, latencyMs };
    
  } catch (error) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    
    if (error.name === "AbortError") {
      return { success: false, latencyMs, error: "Timeout" };
    }
    
    return { success: false, latencyMs, error: String(error) };
  }
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
    // Check if feature is enabled
    if (!AI_SAFETY_ENABLED) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: { kind: "feature_disabled", message: "AI Safety Check is disabled" } 
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: AISafetyRequest = await req.json();
    const { scan, pairs, dry_run: requestedDryRun, policy_version: clientPolicyVersion } = body;

    // Server decides effective dry_run (from env var), but we track what client requested
    const effectiveDryRun = AI_SAFETY_DRY_RUN;

    if (!scan?.input_hash || !scan?.signals || !pairs?.length) {
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "bad_request", message: "Missing scan or pairs" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Limit batch size
    const MAX_PAIRS = 10;
    if (pairs.length > MAX_PAIRS) {
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "bad_request", message: `Max ${MAX_PAIRS} pairs per request` } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get auth token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "unauthorized", message: "Missing auth token" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Verify user
    const { data: userData, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !userData?.user) {
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "unauthorized", message: "Invalid auth token" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Log policy version mismatch for debugging (server version is source of truth)
    const policyVersionMismatch = clientPolicyVersion !== undefined && clientPolicyVersion !== AI_SAFETY_PROMPT_VERSION;
    if (policyVersionMismatch) {
      console.warn(`[ai-safety] Policy version mismatch: client=${clientPolicyVersion}, server=${AI_SAFETY_PROMPT_VERSION}`);
    }

    console.log(`[ai-safety] Request: user=${userId.slice(0, 8)}..., pairs=${pairs.length}, requested_dry_run=${requestedDryRun ?? 'not_specified'}, effective_dry_run=${effectiveDryRun}, server_policy_v=${AI_SAFETY_PROMPT_VERSION}`);

    // ============================================
    // STEP 1: CACHE-FIRST LOOKUP
    // ============================================

    const uniqueKeys = pairs.map(p => 
      computeUniqueKey(scan.input_hash, p.match_input_hash, AI_SAFETY_PROMPT_VERSION)
    );

    const { data: cachedVerdicts, error: cacheError } = await supabaseAdmin
      .from("ai_safety_verdicts")
      .select("unique_key, action, reason_code, ai_confidence, ai_reason")
      .in("unique_key", uniqueKeys);

    if (cacheError) {
      console.error("[ai-safety] Cache lookup error:", cacheError);
      // Continue without cache on error
    }

    const cachedMap = new Map<string, {
      action: string;
      reason_code: string;
      ai_confidence: number | null;
      ai_reason: string | null;
    }>();

    for (const cached of cachedVerdicts ?? []) {
      cachedMap.set(cached.unique_key, cached);
    }

    // Build results from cache
    const results: VerdictResult[] = [];
    const uncachedPairs: PairInput[] = [];
    const uncachedKeys: string[] = [];

    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      const key = uniqueKeys[i];
      const cached = cachedMap.get(key);

      if (cached) {
        // Cache hit
        results.push({
          itemId: pair.itemId,
          action: cached.action as "keep" | "demote" | "hide",
          reason_code: cached.reason_code as VerdictResult["reason_code"],
          ai_confidence: cached.ai_confidence,
          ai_reason: cached.ai_reason,
          source: "cache_hit",
          latency_ms: null,
          cached: true,
        });

        // Increment cache hit counter (fire-and-forget)
        supabaseAdmin.rpc("increment_ai_safety_cache_hit", { p_user_id: userId }).then(() => {}).catch(() => {});
      } else {
        uncachedPairs.push(pair);
        uncachedKeys.push(key);
      }
    }

    const cacheHits = results.length;
    console.log(`[ai-safety] Cache: ${cacheHits}/${pairs.length} hits`);

    // If all cached, return early
    if (uncachedPairs.length === 0) {
      const totalDuration = Date.now() - startTime;
      return new Response(
        JSON.stringify({
          ok: true,
          verdicts: results,
          requested_dry_run: requestedDryRun ?? null,
          effective_dry_run: effectiveDryRun,
          stats: {
            total_pairs: pairs.length,
            cache_hits: cacheHits,
            ai_calls: 0,
            total_latency_ms: totalDuration,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // STEP 2: RATE LIMIT CHECK
    // ============================================

    const { data: rateLimitResult, error: rateLimitError } = await supabaseAdmin.rpc(
      "check_ai_safety_rate_limit",
      { p_user_id: userId, p_daily_limit: AI_SAFETY_DAILY_CAP, p_increment: true }
    );

    if (rateLimitError) {
      console.error("[ai-safety] Rate limit check error:", rateLimitError);
      // Fail open on DB errors
    } else if (rateLimitResult && !rateLimitResult.allowed) {
      console.warn(`[ai-safety] Rate limited: user=${userId.slice(0, 8)}..., count=${rateLimitResult.current_count}/${AI_SAFETY_DAILY_CAP}`);
      
      // Return cache hits + keep fallback for uncached
      for (const pair of uncachedPairs) {
        results.push({
          itemId: pair.itemId,
          action: "keep",
          reason_code: "error_fallback",
          ai_confidence: null,
          ai_reason: "Rate limited",
          source: "cache_hit", // Not really, but no AI call made
          latency_ms: null,
          cached: false,
        });
      }

      const totalDuration = Date.now() - startTime;
      return new Response(
        JSON.stringify({
          ok: true,
          verdicts: results,
          requested_dry_run: requestedDryRun ?? null,
          effective_dry_run: effectiveDryRun,
          rate_limited: true,
          stats: {
            total_pairs: pairs.length,
            cache_hits: cacheHits,
            ai_calls: 0,
            total_latency_ms: totalDuration,
            rate_limit_remaining: 0,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // STEP 3: CALL AI MODEL
    // ============================================

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      console.error("[ai-safety] OPENAI_API_KEY not configured");
      
      // Fallback: return keep for all uncached
      for (const pair of uncachedPairs) {
        results.push({
          itemId: pair.itemId,
          action: "keep",
          reason_code: "error_fallback",
          ai_confidence: null,
          ai_reason: "AI service not configured",
          source: "ai_call",
          latency_ms: 0,
          cached: false,
        });
      }

      return new Response(
        JSON.stringify({
          ok: true,
          verdicts: results,
          requested_dry_run: requestedDryRun ?? null,
          effective_dry_run: effectiveDryRun,
          stats: { total_pairs: pairs.length, cache_hits: cacheHits, ai_calls: 0, total_latency_ms: Date.now() - startTime },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const promptContent = buildPromptContent(scan.signals, uncachedPairs);
    console.log(`[ai-safety] Calling ${AI_SAFETY_MODEL_ID} for ${uncachedPairs.length} pairs...`);

    const aiResult = await callAIWithTimeout(
      openaiKey,
      AI_SAFETY_PROMPT,
      promptContent,
      AI_SAFETY_TIMEOUT_MS,
      AI_SAFETY_MODEL_ID
    );

    console.log(`[ai-safety] AI call: success=${aiResult.success}, latency=${aiResult.latencyMs}ms`);

    // ============================================
    // STEP 4: PROCESS AI RESPONSE
    // ============================================

    let aiParsedResults: Map<string, AIModelResponse>;

    if (!aiResult.success) {
      console.warn(`[ai-safety] AI failed: ${aiResult.error}`);
      
      // Timeout/error fallback: return keep for all uncached
      aiParsedResults = new Map();
      for (const pair of uncachedPairs) {
        aiParsedResults.set(pair.itemId, {
          itemId: pair.itemId,
          action: "keep",
          reason_code: aiResult.error === "Timeout" ? "timeout_fallback" : "error_fallback",
          confidence: 0,
          reason: aiResult.error ?? "Unknown error",
        });
      }
    } else {
      try {
        const expectedIds = uncachedPairs.map(p => p.itemId);
        aiParsedResults = parseAIResponse(aiResult.response!, expectedIds);
      } catch (parseError) {
        console.error("[ai-safety] Parse error:", parseError);
        
        // Parse error fallback: keep all
        aiParsedResults = new Map();
        for (const pair of uncachedPairs) {
          aiParsedResults.set(pair.itemId, {
            itemId: pair.itemId,
            action: "keep",
            reason_code: "error_fallback",
            confidence: 0,
            reason: "Failed to parse AI response",
          });
        }
      }
    }

    // ============================================
    // STEP 5: STORE VERDICTS AND BUILD RESULTS
    // ============================================

    // Calculate expiry time for cache TTL
    const expiresAt = new Date(Date.now() + AI_SAFETY_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const verdictsToStore: Array<{
      unique_key: string;
      scan_input_hash: string;
      match_input_hash: string;
      prompt_version: number;
      action: string;
      reason_code: string;
      ai_confidence: number | null;
      ai_reason: string | null;
      source: string;
      latency_ms: number | null;
      model_id: string | null;
      expires_at: string;
    }> = [];

    for (let i = 0; i < uncachedPairs.length; i++) {
      const pair = uncachedPairs[i];
      const key = uncachedKeys[i];
      const aiVerdict = aiParsedResults.get(pair.itemId);

      if (!aiVerdict) continue;

      results.push({
        itemId: pair.itemId,
        action: aiVerdict.action as "keep" | "demote" | "hide",
        reason_code: aiVerdict.reason_code as VerdictResult["reason_code"],
        ai_confidence: aiVerdict.confidence,
        ai_reason: aiVerdict.reason,
        source: "ai_call",
        latency_ms: aiResult.latencyMs,
        cached: false,
      });

      verdictsToStore.push({
        unique_key: key,
        scan_input_hash: scan.input_hash,
        match_input_hash: pair.match_input_hash,
        prompt_version: AI_SAFETY_PROMPT_VERSION,
        action: aiVerdict.action,
        reason_code: aiVerdict.reason_code,
        ai_confidence: aiVerdict.confidence,
        ai_reason: aiVerdict.reason,
        source: "ai_call",
        latency_ms: aiResult.latencyMs,
        model_id: AI_SAFETY_MODEL_ID,
        expires_at: expiresAt,
      });
    }

    // Store verdicts (fire-and-forget, but log errors)
    if (verdictsToStore.length > 0) {
      const { error: storeError } = await supabaseAdmin
        .from("ai_safety_verdicts")
        .upsert(verdictsToStore, { onConflict: "unique_key" });

      if (storeError) {
        console.error("[ai-safety] Failed to store verdicts:", storeError);
      } else {
        console.log(`[ai-safety] Stored ${verdictsToStore.length} verdicts`);
      }

      // Update pairs checked counter
      supabaseAdmin.rpc("increment_ai_safety_pairs_checked", { 
        p_user_id: userId, 
        p_count: uncachedPairs.length 
      }).then(() => {}).catch(() => {});
    }

    // ============================================
    // STEP 6: RETURN RESULTS
    // ============================================

    const totalDuration = Date.now() - startTime;
    const aiCallsMade = uncachedPairs.length > 0 ? 1 : 0;

    // Log summary
    const actions = { keep: 0, demote: 0, hide: 0 };
    for (const r of results) {
      actions[r.action]++;
    }
    console.log(`[ai-safety] Complete: ${results.length} verdicts (keep=${actions.keep}, demote=${actions.demote}, hide=${actions.hide}), ${totalDuration}ms`);

    // Build response with safe defaults
    const responsePayload = {
      ok: true,
      verdicts: results,
      requested_dry_run: requestedDryRun ?? null,
      effective_dry_run: effectiveDryRun,
      stats: {
        total_pairs: pairs.length,
        cache_hits: cacheHits,
        ai_calls: aiCallsMade,
        ai_latency_ms: aiResult?.latencyMs ?? null,
        total_latency_ms: totalDuration,
        rate_limit_remaining: rateLimitResult?.remaining ?? null,
      },
    };

    return new Response(
      JSON.stringify(responsePayload),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[ai-safety] Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: { kind: "unknown", message: errorMessage } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
