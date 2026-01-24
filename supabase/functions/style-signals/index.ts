/* eslint-disable import/no-unresolved */
// @ts-nocheck - This is a Deno/Supabase Edge Function, not a Node.js file
/**
 * Style Signals Edge Function
 *
 * Generates style_signals_v1 (aesthetic, formality, statement, season, pattern, material)
 * for wardrobe items and scan results. Used by Trust Filter v1.
 *
 * Endpoints:
 * POST /style-signals with { type: 'scan', scanId } - Generate signals for a scan
 * POST /style-signals with { type: 'wardrobe', itemId } - Generate signals for wardrobe item
 *
 * Deploy: supabase functions deploy style-signals --no-verify-jwt
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Current prompt version - increment when prompt changes significantly
const CURRENT_PROMPT_VERSION = 1;

// ============================================
// STYLE SIGNALS PROMPT
// ============================================

const STYLE_SIGNALS_PROMPT = `Analyze this clothing item image and respond ONLY with a valid JSON object (no markdown, no explanation).

The JSON must have EXACTLY this structure with ALL keys present:
{
  "version": 1,
  "aesthetic": {
    "primary": "<archetype>",
    "primary_confidence": <0.0-1.0>,
    "secondary": "<archetype|none>",
    "secondary_confidence": <0.0-1.0>
  },
  "formality": {
    "band": "<formality_band>",
    "confidence": <0.0-1.0>
  },
  "statement": {
    "level": "<statement_level>",
    "confidence": <0.0-1.0>
  },
  "season": {
    "heaviness": "<season_heaviness>",
    "confidence": <0.0-1.0>
  },
  "palette": {
    "colors": ["<color1>", "<color2>"],
    "confidence": <0.0-1.0>
  },
  "pattern": {
    "level": "<pattern_level>",
    "confidence": <0.0-1.0>
  },
  "material": {
    "family": "<material_family>",
    "confidence": <0.0-1.0>
  }
}

AESTHETIC ARCHETYPES (choose primary and optionally secondary):
- minimalist: Clean lines, simple silhouettes, neutral colors, understated elegance
- classic: Timeless pieces, tailored fits, traditional patterns, refined
- workwear: Functional, utility-inspired, durable fabrics, practical details
- romantic: Soft, feminine, flowy fabrics, delicate details, florals
- boho: Free-spirited, earthy, layered, ethnic prints, relaxed
- western: Cowboy-inspired, leather, fringe, boots, denim, rustic
- street: Urban, casual, graphic elements, sneaker culture, bold
- sporty: Athletic-inspired, technical fabrics, active silhouettes
- edgy: Dark, unconventional, leather, studs, asymmetric, rebellious
- glam: Luxurious, sparkle, bold colors, statement pieces, evening-ready
- preppy: Polished casual, collegiate, clean-cut, polo/blazer vibes
- outdoor_utility: Technical outdoor, hiking, camping, performance fabrics

For secondary: Use "none" if the item is purely one aesthetic (confidence < 0.35).

FORMALITY BANDS:
- athleisure: Gym-to-street, activewear, joggers, sports bras
- casual: Everyday relaxed, t-shirts, jeans, sneakers
- smart_casual: Polished but relaxed, nice jeans, button-downs
- office: Professional, business casual to business formal
- formal: Dressy events, cocktail, suits
- evening: Black tie, gala, very formal occasions

STATEMENT LEVEL:
- low: Basic, versatile, blends into outfit
- medium: Some visual interest, moderate attention
- high: Eye-catching, bold, conversation starter

SEASON HEAVINESS:
- light: Summer fabrics, thin materials, breathable
- mid: Transitional, medium weight, year-round
- heavy: Winter, thick fabrics, insulated

PALETTE COLORS (pick 2-4 dominant colors):
black, white, cream, gray, brown, tan, beige, navy, denim_blue, blue,
red, pink, green, olive, yellow, orange, purple, metallic, multicolor

PATTERN LEVEL:
- solid: No pattern, single color
- subtle: Small/quiet pattern, tone-on-tone, minimal print
- bold: Large/loud pattern, graphic, statement print

MATERIAL FAMILY:
- denim: Jeans, chambray, raw denim
- knit: Sweaters, jersey, t-shirt fabric
- leather: Real or faux leather
- silk_satin: Silky, shiny, luxe fabrics
- cotton: Woven cotton, poplin, canvas
- wool: Wool, cashmere, heavy knits
- synthetic_tech: Polyester, nylon, technical fabrics
- other: Mixed or unusual materials

CONFIDENCE SCORING:
- 0.9-1.0: Very certain, clear indicators
- 0.7-0.89: Confident, strong signals
- 0.5-0.69: Moderate confidence, some ambiguity
- 0.3-0.49: Low confidence, difficult to determine
- 0.0-0.29: Very uncertain, use "unknown" instead

If you cannot determine a value, use "unknown" for string fields and 0.0 for confidence.

Respond with ONLY the JSON object, no explanation.`;

// ============================================
// TYPES
// ============================================

interface StyleSignalsRequest {
  type: 'scan' | 'wardrobe';
  scanId?: string;
  itemId?: string;
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

// ============================================
// VALIDATION
// ============================================

const VALID_ARCHETYPES = [
  'minimalist', 'classic', 'workwear', 'romantic', 'boho', 'western',
  'street', 'sporty', 'edgy', 'glam', 'preppy', 'outdoor_utility', 'unknown', 'none'
];

const VALID_FORMALITY = [
  'athleisure', 'casual', 'smart_casual', 'office', 'formal', 'evening', 'unknown'
];

const VALID_STATEMENT = ['low', 'medium', 'high', 'unknown'];

const VALID_SEASON = ['light', 'mid', 'heavy', 'unknown'];

const VALID_PATTERN = ['solid', 'subtle', 'bold', 'unknown'];

const VALID_MATERIAL = [
  'denim', 'knit', 'leather', 'silk_satin', 'cotton', 'wool', 'synthetic_tech', 'other', 'unknown'
];

const VALID_COLORS = [
  'black', 'white', 'cream', 'gray', 'brown', 'tan', 'beige',
  'navy', 'denim_blue', 'blue', 'red', 'pink', 'green', 'olive',
  'yellow', 'orange', 'purple', 'metallic', 'multicolor', 'unknown'
];

function validateAndNormalizeSignals(raw: unknown): StyleSignalsV1 {
  const signals = raw as StyleSignalsV1;

  // Ensure all required keys exist
  const normalized: StyleSignalsV1 = {
    version: 1,
    aesthetic: {
      primary: VALID_ARCHETYPES.includes(signals?.aesthetic?.primary) 
        ? signals.aesthetic.primary : 'unknown',
      primary_confidence: clampConfidence(signals?.aesthetic?.primary_confidence),
      secondary: VALID_ARCHETYPES.includes(signals?.aesthetic?.secondary)
        ? signals.aesthetic.secondary : 'none',
      secondary_confidence: clampConfidence(signals?.aesthetic?.secondary_confidence),
    },
    formality: {
      band: VALID_FORMALITY.includes(signals?.formality?.band)
        ? signals.formality.band : 'unknown',
      confidence: clampConfidence(signals?.formality?.confidence),
    },
    statement: {
      level: VALID_STATEMENT.includes(signals?.statement?.level)
        ? signals.statement.level : 'unknown',
      confidence: clampConfidence(signals?.statement?.confidence),
    },
    season: {
      heaviness: VALID_SEASON.includes(signals?.season?.heaviness)
        ? signals.season.heaviness : 'unknown',
      confidence: clampConfidence(signals?.season?.confidence),
    },
    palette: {
      colors: normalizeColors(signals?.palette?.colors),
      confidence: clampConfidence(signals?.palette?.confidence),
    },
    pattern: {
      level: VALID_PATTERN.includes(signals?.pattern?.level)
        ? signals.pattern.level : 'unknown',
      confidence: clampConfidence(signals?.pattern?.confidence),
    },
    material: {
      family: VALID_MATERIAL.includes(signals?.material?.family)
        ? signals.material.family : 'unknown',
      confidence: clampConfidence(signals?.material?.confidence),
    },
  };

  // Apply secondary rules
  if (normalized.aesthetic.secondary_confidence < 0.35) {
    normalized.aesthetic.secondary = 'none';
    normalized.aesthetic.secondary_confidence = 0;
  }
  if (normalized.aesthetic.secondary === normalized.aesthetic.primary) {
    normalized.aesthetic.secondary = 'none';
    normalized.aesthetic.secondary_confidence = 0;
  }

  return normalized;
}

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeColors(colors: unknown): string[] {
  if (!Array.isArray(colors)) return ['unknown'];
  const valid = colors
    .filter((c): c is string => typeof c === 'string' && VALID_COLORS.includes(c))
    .slice(0, 4);
  return valid.length > 0 ? valid : ['unknown'];
}

function computeInputHash(imageUri: string, updatedAt?: string): string {
  // Simple hash: concatenate image URI and timestamp
  const input = `${imageUri}|${updatedAt || 'none'}`;
  // Use a simple hash function (for production, consider crypto.subtle.digest)
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ============================================
// CREATE UNKNOWN-FILLED SIGNALS (FALLBACK)
// ============================================

function createUnknownSignals(): StyleSignalsV1 {
  return {
    version: 1,
    aesthetic: {
      primary: 'unknown',
      primary_confidence: 0,
      secondary: 'none',
      secondary_confidence: 0,
    },
    formality: { band: 'unknown', confidence: 0 },
    statement: { level: 'unknown', confidence: 0 },
    season: { heaviness: 'unknown', confidence: 0 },
    palette: { colors: ['unknown'], confidence: 0 },
    pattern: { level: 'unknown', confidence: 0 },
    material: { family: 'unknown', confidence: 0 },
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
    // Get auth token from header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "unauthorized", message: "Missing auth token" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(token);
    if (authError || !user) {
      console.error("[style-signals] Auth error:", authError);
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "unauthorized", message: "Invalid auth token" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;

    // Parse request body
    const body: StyleSignalsRequest = await req.json();
    const { type, scanId, itemId } = body;

    if (!type || (type !== 'scan' && type !== 'wardrobe')) {
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "bad_request", message: "Invalid type. Must be 'scan' or 'wardrobe'" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let imageUri: string;
    let recordId: string;
    let tableName: string;
    let existingHash: string | null = null;
    let existingPromptVersion: number | null = null;
    let existingStatus: string | null = null;

    // ============================================
    // LOAD RECORD AND CHECK CACHE
    // ============================================

    if (type === 'scan') {
      if (!scanId) {
        return new Response(
          JSON.stringify({ ok: false, error: { kind: "bad_request", message: "Missing scanId" } }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      tableName = 'recent_checks';
      recordId = scanId;

      const { data: scan, error: scanError } = await supabaseUser
        .from('recent_checks')
        .select('id, image_uri, style_signals_status, style_signals_input_hash, style_signals_prompt_version')
        .eq('id', scanId)
        .eq('user_id', userId)
        .single();

      if (scanError || !scan) {
        console.error("[style-signals] Scan not found:", scanError);
        return new Response(
          JSON.stringify({ ok: false, error: { kind: "not_found", message: "Scan not found" } }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      imageUri = scan.image_uri;
      existingHash = scan.style_signals_input_hash;
      existingPromptVersion = scan.style_signals_prompt_version;
      existingStatus = scan.style_signals_status;

    } else {
      // type === 'wardrobe'
      if (!itemId) {
        return new Response(
          JSON.stringify({ ok: false, error: { kind: "bad_request", message: "Missing itemId" } }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      tableName = 'wardrobe_items';
      recordId = itemId;

      const { data: item, error: itemError } = await supabaseUser
        .from('wardrobe_items')
        .select('id, image_uri, style_signals_status, style_signals_input_hash, style_signals_prompt_version')
        .eq('id', itemId)
        .eq('user_id', userId)
        .single();

      if (itemError || !item) {
        console.error("[style-signals] Item not found:", itemError);
        return new Response(
          JSON.stringify({ ok: false, error: { kind: "not_found", message: "Wardrobe item not found" } }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      imageUri = item.image_uri;
      existingHash = item.style_signals_input_hash;
      existingPromptVersion = item.style_signals_prompt_version;
      existingStatus = item.style_signals_status;
    }

    // Compute current input hash
    const currentHash = computeInputHash(imageUri);

    // Check cache: if hash matches, prompt version is current, and status is ready, return cached
    if (
      existingStatus === 'ready' &&
      existingHash === currentHash &&
      existingPromptVersion === CURRENT_PROMPT_VERSION
    ) {
      console.log(`[style-signals] Cache hit for ${type} ${recordId}`);
      
      // Return cached signals
      const { data: cached } = await supabaseUser
        .from(tableName)
        .select('style_signals_v1')
        .eq('id', recordId)
        .single();

      return new Response(
        JSON.stringify({
          ok: true,
          cached: true,
          data: cached?.style_signals_v1,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[style-signals] Generating signals for ${type} ${recordId}`);

    // ============================================
    // SET STATUS TO PROCESSING
    // ============================================

    await supabaseAdmin
      .from(tableName)
      .update({
        style_signals_status: 'processing',
        style_signals_updated_at: new Date().toISOString(),
      })
      .eq('id', recordId);

    // ============================================
    // CALL OPENAI
    // ============================================

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      console.error("[style-signals] OPENAI_API_KEY not configured");
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "server_error", message: "Analysis service not configured" } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If image is a storage URL, we can use it directly
    // If it's a local file:// URI, we can't process it server-side
    if (imageUri.startsWith('file://')) {
      console.error("[style-signals] Cannot process local file URI");
      await supabaseAdmin
        .from(tableName)
        .update({
          style_signals_status: 'failed',
          style_signals_error: 'Image not uploaded to cloud storage',
          style_signals_updated_at: new Date().toISOString(),
        })
        .eq('id', recordId);

      return new Response(
        JSON.stringify({ ok: false, error: { kind: "bad_request", message: "Image must be uploaded to cloud storage first" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let signals: StyleSignalsV1;
    let retryCount = 0;
    const maxRetries = 1;

    while (retryCount <= maxRetries) {
      try {
        const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: STYLE_SIGNALS_PROMPT },
                  { type: "image_url", image_url: { url: imageUri } },
                ],
              },
            ],
            max_tokens: 800,
            temperature: 0,
          }),
        });

        if (!openaiResponse.ok) {
          const errorText = await openaiResponse.text();
          console.error(`[style-signals] OpenAI error: ${openaiResponse.status}`, errorText);
          throw new Error(`OpenAI API error: ${openaiResponse.status}`);
        }

        const openaiData = await openaiResponse.json();
        const responseText = openaiData.choices?.[0]?.message?.content ?? "";

        if (!responseText) {
          throw new Error("Empty response from OpenAI");
        }

        // Parse JSON response
        let cleanedResponse = responseText.trim();
        if (cleanedResponse.startsWith("```json")) cleanedResponse = cleanedResponse.slice(7);
        if (cleanedResponse.startsWith("```")) cleanedResponse = cleanedResponse.slice(3);
        if (cleanedResponse.endsWith("```")) cleanedResponse = cleanedResponse.slice(0, -3);
        cleanedResponse = cleanedResponse.trim();

        const rawSignals = JSON.parse(cleanedResponse);
        signals = validateAndNormalizeSignals(rawSignals);
        break; // Success, exit retry loop

      } catch (error) {
        console.error(`[style-signals] Attempt ${retryCount + 1} failed:`, error);
        retryCount++;

        if (retryCount > maxRetries) {
          // All retries exhausted, store unknown-filled signals
          console.log(`[style-signals] Max retries exceeded, storing unknown-filled signals`);
          signals = createUnknownSignals();

          await supabaseAdmin
            .from(tableName)
            .update({
              style_signals_v1: signals,
              style_signals_version: 1,
              style_signals_status: 'failed',
              style_signals_error: String(error),
              style_signals_updated_at: new Date().toISOString(),
              style_signals_source: type === 'scan' ? 'scan_ai' : 'wardrobe_ai',
              style_signals_prompt_version: CURRENT_PROMPT_VERSION,
              style_signals_input_hash: currentHash,
            })
            .eq('id', recordId);

          return new Response(
            JSON.stringify({
              ok: false,
              error: { kind: "analysis_failed", message: "Failed to analyze image style" },
              fallbackData: signals,
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // ============================================
    // STORE SUCCESS
    // ============================================

    await supabaseAdmin
      .from(tableName)
      .update({
        style_signals_v1: signals!,
        style_signals_version: 1,
        style_signals_status: 'ready',
        style_signals_error: null,
        style_signals_updated_at: new Date().toISOString(),
        style_signals_source: type === 'scan' ? 'scan_ai' : 'wardrobe_ai',
        style_signals_prompt_version: CURRENT_PROMPT_VERSION,
        style_signals_input_hash: currentHash,
      })
      .eq('id', recordId);

    const totalDuration = Date.now() - startTime;
    console.log(`[style-signals] Success for ${type} ${recordId} in ${totalDuration}ms`);

    return new Response(
      JSON.stringify({
        ok: true,
        cached: false,
        data: signals!,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[style-signals] Unexpected error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: { kind: "unknown", message: "Something went wrong" } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
