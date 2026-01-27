/* eslint-disable import/no-unresolved */
// @ts-nocheck - This is a Deno/Supabase Edge Function, not a Node.js file
/**
 * Analyze Image Edge Function
 *
 * Server-side OpenAI Vision API calls for clothing analysis.
 * This keeps the OpenAI API key secret and enables server-side rate limiting.
 *
 * Deploy: supabase functions deploy analyze-image --no-verify-jwt
 * 
 * Environment variables needed:
 * - OPENAI_API_KEY: Your OpenAI API key (set in Supabase dashboard)
 * - SUPABASE_URL: Auto-set by Supabase
 * - SUPABASE_SERVICE_ROLE_KEY: Auto-set by Supabase
 *
 * Security features:
 * - Requires valid Supabase auth token
 * - Consumes quota before making OpenAI call
 * - Short-term rate limiting (max 10 requests/hour per user)
 * - Global rate limiting (max 100 requests/minute)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting: in-memory store (resets on function cold start)
// For production, consider using Redis or Supabase for persistent rate limiting
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const globalRateLimit = { count: 0, resetAt: 0 };

const RATE_LIMITS = {
  PER_USER_HOUR: 50, // Max 50 requests per user per hour
  GLOBAL_MINUTE: 100, // Max 100 requests globally per minute
};

function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  
  // Check global rate limit
  if (globalRateLimit.resetAt < now) {
    globalRateLimit.count = 0;
    globalRateLimit.resetAt = now + 60000; // 1 minute
  }
  if (globalRateLimit.count >= RATE_LIMITS.GLOBAL_MINUTE) {
    return { allowed: false, retryAfter: Math.ceil((globalRateLimit.resetAt - now) / 1000) };
  }
  
  // Check per-user rate limit
  const userLimit = rateLimitStore.get(userId);
  if (userLimit && userLimit.resetAt > now) {
    if (userLimit.count >= RATE_LIMITS.PER_USER_HOUR) {
      return { allowed: false, retryAfter: Math.ceil((userLimit.resetAt - now) / 1000) };
    }
    userLimit.count++;
  } else {
    rateLimitStore.set(userId, { count: 1, resetAt: now + 3600000 }); // 1 hour
  }
  
  globalRateLimit.count++;
  return { allowed: true };
}

// OpenAI prompt for clothing analysis (combined with style signals for single API call)
const ANALYSIS_PROMPT = `Analyze this image and respond ONLY with a valid JSON object (no markdown, no explanation).

The JSON must have exactly this structure:
{
  "isFashionItem": true | false,
  "category": "tops" | "bottoms" | "dresses" | "skirts" | "outerwear" | "shoes" | "bags" | "accessories" | "unknown",
  "descriptiveLabel": "a short 2-4 word description",
  "colors": [{"hex": "#hexcode", "name": "Color Name"}],
  "styleTags": ["style1", "style2"],
  "styleNotes": ["note1", "note2"],
  "contextSufficient": true | false,
  "itemSignals": { ... category-specific signals ... },
  "confidenceSignals": {
    "color_profile": {
      "is_neutral": true | false,
      "dominant_hue": 0-360 (omit if neutral),
      "saturation": "low" | "med" | "high",
      "value": "low" | "med" | "high"
    },
    "style_family": "minimal" | "classic" | "street" | "athleisure" | "romantic" | "edgy" | "boho" | "preppy" | "formal" | "unknown",
    "formality_level": 1 | 2 | 3 | 4 | 5,
    "texture_type": "smooth" | "textured" | "soft" | "structured" | "mixed" | "unknown"
  },
  "styleSignals": {
    "version": 1,
    "aesthetic": {
      "primary": "<archetype>",
      "primary_confidence": <0.0-1.0>,
      "secondary": "<archetype|none>",
      "secondary_confidence": <0.0-1.0>
    },
    "formality": { "band": "<formality_band>", "confidence": <0.0-1.0> },
    "statement": { "level": "<statement_level>", "confidence": <0.0-1.0> },
    "season": { "heaviness": "<season_heaviness>", "confidence": <0.0-1.0> },
    "palette": { "colors": ["<color1>", "<color2>"], "confidence": <0.0-1.0> },
    "pattern": { "level": "<pattern_level>", "confidence": <0.0-1.0> },
    "material": { "family": "<material_family>", "confidence": <0.0-1.0> }
  }
}

FIRST, determine if this is a wearable fashion item:
- isFashionItem: true for clothing, shoes, bags, jewelry, scarves, belts, hats, watches
- isFashionItem: false for mugs, cups, electronics, food, plants, pets, furniture, vehicles, etc.
- If isFashionItem is false, set category to "unknown" and use empty arrays for styleTags/styleNotes/colors

Category rules (only apply if isFashionItem is true):
- tops: shirts, blouses, t-shirts, sweaters, tank tops
- bottoms: pants, trousers, jeans, shorts
- dresses: full dresses (not separates)
- skirts: skirts only (not pants)
- outerwear: jackets, coats, blazers, cardigans worn as outer layer
- shoes: all footwear
- bags: handbags, backpacks, totes
- accessories: jewelry, scarves, belts, hats, watches
- unknown: use ONLY when isFashionItem is false

styleTags (REQUIRED - must include 1-3 tags from this list):
- "casual": relaxed, everyday, comfortable
- "minimal": clean lines, simple, understated
- "office": professional, work-appropriate
- "street": urban, streetwear-influenced
- "feminine": soft, romantic, delicate details
- "sporty": athletic-inspired, active

IMPORTANT: styleTags must NEVER be empty. Always include at least one tag.

styleNotes (REQUIRED - 2 descriptive sentences about the item):
Write 2 natural, helpful sentences that describe the item's character and styling potential.
Focus on: material/texture feel, silhouette details, versatility, occasion suitability, or styling tips.
Example: ["Soft cotton fabric with a relaxed fit that drapes nicely.", "Versatile enough for casual weekends or layered under a blazer for work."]
Do NOT write single words or short phrases - write complete, informative sentences.

contextSufficient: Set to false if photo is blurry, item is partially visible, or item type is ambiguous.

confidenceSignals:
- color_profile.is_neutral: true for black, white, gray, beige, tan, cream, navy
- color_profile.dominant_hue: 0=red, 30=orange, 60=yellow, 120=green, 180=cyan, 240=blue, 300=magenta
- style_family: minimal, classic, street, athleisure, romantic, edgy, boho, preppy, formal
- formality_level: 1=athleisure, 2=casual, 3=smart casual, 4=business, 5=formal
- texture_type: smooth, textured, soft, structured, mixed

itemSignals (include ONLY fields relevant to category):

For tops:
  "silhouetteVolume": "fitted" | "relaxed" | "oversized"
  "lengthCategory": "cropped" | "mid" | "long"
  "layeringFriendly": true | false
  "stylingRisk": "low" | "medium" | "high"

For bottoms:
  "legShape": "slim" | "straight" | "wide"
  "rise": "low" | "mid" | "high"
  "balanceRequirement": "low" | "medium" | "high"
  "stylingRisk": "low" | "medium" | "high"

For skirts:
  "lengthCategory": "mini" | "midi" | "long"
  "skirtVolume": "straight" | "flowy"
  "stylingRisk": "low" | "medium" | "high"

For dresses:
  "dressSilhouette": "fitted" | "relaxed" | "structured"
  "lengthCategory": "mini" | "midi" | "long"
  "stylingRisk": "low" | "medium" | "high"

For outerwear:
  "structure": "soft" | "structured"
  "bulk": "low" | "medium" | "high"
  "layeringDependency": "low" | "medium" | "high"
  "stylingRisk": "low" | "medium" | "high"

For shoes:
  "styleVersatility": "high" | "medium" | "low"
  "statementLevel": "neutral" | "bold"
  "stylingRisk": "low" | "medium" | "high"

For bags/accessories:
  "styleVersatility": "high" | "medium" | "low"
  "stylingRisk": "low"

stylingRisk: "low" = versatile, "medium" = needs thought, "high" = statement piece

STYLE SIGNALS (for outfit matching - REQUIRED):

AESTHETIC ARCHETYPES (primary required, secondary optional):
- minimalist: Clean lines, simple silhouettes, neutral colors, understated
- classic: Timeless, tailored fits, traditional patterns, refined
- workwear: Functional, utility-inspired, durable fabrics, practical
- romantic: Soft, feminine, flowy fabrics, delicate details, florals
- boho: Free-spirited, earthy, layered, ethnic prints, relaxed
- western: Cowboy-inspired, leather, fringe, boots, denim, rustic
- street: Urban, casual, graphic elements, sneaker culture, bold
- sporty: Athletic-inspired, technical fabrics, active silhouettes
- edgy: Dark, unconventional, leather, studs, asymmetric, rebellious
- glam: Luxurious, sparkle, bold colors, statement pieces
- preppy: Polished casual, collegiate, clean-cut, polo/blazer vibes
- outdoor_utility: Technical outdoor, hiking, performance fabrics
Use "none" for secondary if purely one aesthetic (confidence < 0.35).

FORMALITY BANDS:
- athleisure: Gym-to-street, activewear, joggers
- casual: Everyday relaxed, t-shirts, jeans, sneakers
- smart_casual: Polished but relaxed, nice jeans, button-downs
- office: Professional, business casual to business formal
- formal: Dressy events, cocktail, suits
- evening: Black tie, gala, very formal

STATEMENT LEVEL: low (basic, versatile) | medium (some visual interest) | high (eye-catching, bold)

SEASON HEAVINESS: light (summer, thin) | mid (transitional, year-round) | heavy (winter, thick)

PALETTE COLORS (pick 2-4): black, white, cream, gray, brown, tan, beige, navy, denim_blue, blue, red, pink, green, olive, yellow, orange, purple, metallic, multicolor

PATTERN LEVEL: solid (no pattern) | subtle (quiet pattern) | bold (loud pattern, graphic)

MATERIAL FAMILY: denim | knit | leather | silk_satin | cotton | wool | synthetic_tech | other

CONFIDENCE SCORING: 0.9-1.0=certain, 0.7-0.89=confident, 0.5-0.69=moderate, 0.3-0.49=low, 0.0-0.29=uncertain

Respond with ONLY the JSON object.`;

interface AnalyzeRequest {
  imageDataUrl: string; // base64 data URL
  idempotencyKey: string;
  operationType?: 'scan' | 'wardrobe_add'; // Which quota pool to use (default: scan)
}

interface AnalyzeResponse {
  ok: boolean;
  data?: unknown;
  error?: {
    kind: string;
    message: string;
    retryAfterSeconds?: number;
  };
  quotaInfo?: {
    monthlyUsed: number;
    monthlyLimit: number;
    monthlyRemaining: number;
  };
}

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

    // Initialize Supabase client with user's token to get their identity
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Client with user's token (for RLS-protected queries)
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(token);
    if (authError || !user) {
      console.error("[analyze-image] Auth error:", authError);
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "unauthorized", message: "Invalid auth token" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    console.log(`[analyze-image] Request from user: ${userId}`);

    // Check short-term rate limit (in-memory)
    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) {
      console.log(`[analyze-image] Rate limited user: ${userId}`);
      return new Response(
        JSON.stringify({
          ok: false,
          error: {
            kind: "rate_limited",
            message: "Too many requests. Please slow down.",
            retryAfterSeconds: rateCheck.retryAfter,
          },
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Retry-After": String(rateCheck.retryAfter),
          } 
        }
      );
    }

    // Parse request body
    const body: AnalyzeRequest = await req.json();
    const { imageDataUrl, idempotencyKey, operationType = 'scan' } = body;

    if (!imageDataUrl || !idempotencyKey) {
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "bad_request", message: "Missing imageDataUrl or idempotencyKey" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate operationType
    if (operationType !== 'scan' && operationType !== 'wardrobe_add') {
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "bad_request", message: "Invalid operationType" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate image data URL format
    if (!imageDataUrl.startsWith("data:image/")) {
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "bad_request", message: "Invalid image format" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check quota using the user's auth context (RPC uses auth.uid())
    // Use correct quota function based on operation type
    const quotaFunction = operationType === 'wardrobe_add' 
      ? 'consume_wardrobe_add_credit' 
      : 'consume_scan_credit';
    
    console.log(`[analyze-image] Consuming ${operationType} quota for user: ${userId}, key: ${idempotencyKey}`);
    const { data: quotaData, error: quotaError } = await supabaseUser.rpc(
      quotaFunction,
      { p_idempotency_key: idempotencyKey }
    );

    if (quotaError) {
      console.error("[analyze-image] Quota check failed:", quotaError);
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "api_error", message: "Failed to check quota" } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const quotaResult = quotaData?.[0];
    console.log(`[analyze-image] Quota result:`, quotaResult);

    if (!quotaResult?.allowed) {
      const reason = quotaResult?.reason || "quota_exceeded";
      const isMonthly = reason === "monthly_quota_exceeded";
      const quotaType = operationType === 'wardrobe_add' ? 'wardrobe add' : 'scan';
      return new Response(
        JSON.stringify({
          ok: false,
          error: {
            kind: "quota_exceeded",
            message: isMonthly 
              ? `You've reached your monthly ${quotaType} limit. Resets next month.`
              : `You've used all your free ${quotaType}s. Upgrade to Pro for more.`,
          },
          quotaInfo: {
            monthlyUsed: quotaResult?.monthly_used ?? 0,
            monthlyLimit: quotaResult?.monthly_limit ?? 0,
            monthlyRemaining: quotaResult?.monthly_remaining ?? 0,
          },
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Quota consumed - now make the OpenAI call
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      console.error("[analyze-image] OPENAI_API_KEY not configured");
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "server_error", message: "Analysis service not configured" } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[analyze-image] Calling OpenAI API...`);
    const openaiStart = Date.now();

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
              { type: "text", text: ANALYSIS_PROMPT },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        max_tokens: 1500, // Increased for combined analysis + style signals
        temperature: 0,
      }),
    });

    const openaiDuration = Date.now() - openaiStart;
    console.log(`[analyze-image] OpenAI responded in ${openaiDuration}ms, status: ${openaiResponse.status}`);

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error(`[analyze-image] OpenAI error: ${openaiResponse.status}`, errorText);
      
      // Map OpenAI errors to client-friendly errors
      if (openaiResponse.status === 429) {
        return new Response(
          JSON.stringify({ ok: false, error: { kind: "rate_limited", message: "Analysis service is busy. Try again shortly." } }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "server_error", message: "Analysis failed. Please try again." } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const responseText = openaiData.choices?.[0]?.message?.content ?? "";

    if (!responseText) {
      console.error("[analyze-image] Empty response from OpenAI");
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "parse_error", message: "No analysis returned" } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse JSON response (handle markdown code blocks)
    let cleanedResponse = responseText.trim();
    if (cleanedResponse.startsWith("```json")) cleanedResponse = cleanedResponse.slice(7);
    if (cleanedResponse.startsWith("```")) cleanedResponse = cleanedResponse.slice(3);
    if (cleanedResponse.endsWith("```")) cleanedResponse = cleanedResponse.slice(0, -3);
    cleanedResponse = cleanedResponse.trim();

    let analysis;
    try {
      analysis = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error("[analyze-image] Failed to parse OpenAI response:", cleanedResponse.slice(0, 200));
      return new Response(
        JSON.stringify({ ok: false, error: { kind: "parse_error", message: "Couldn't understand the analysis" } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[analyze-image] Success in ${totalDuration}ms (OpenAI: ${openaiDuration}ms)`);

    // Return success with analysis and quota info
    const response: AnalyzeResponse = {
      ok: true,
      data: analysis,
      quotaInfo: {
        monthlyUsed: quotaResult?.monthly_used ?? 0,
        monthlyLimit: quotaResult?.monthly_limit ?? 0,
        monthlyRemaining: quotaResult?.monthly_remaining ?? 0,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[analyze-image] Unexpected error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: { kind: "unknown", message: "Something went wrong" } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
