// AI API integration for clothing image analysis

import { fetch } from "expo/fetch";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";
import {
  Category,
  ColorInfo,
  StyleVibe,
  SilhouetteVolume,
  LengthCategory,
  LegShape,
  Rise,
  StructureLevel,
  BulkLevel,
  VersatilityLevel,
  StatementLevel,
  StylingRisk,
} from "./types";

import type {
  StyleFamily,
  FormalityLevel,
  TextureType,
} from "./confidence-engine/types";

import type { ConfidenceSignals } from "./confidence-engine/integration";
import { normalizeStyleTags, vibeToFamily } from "./style-inference";

// Analysis cache for deterministic results
import {
  sha256Hex,
  generateCacheKey,
  getCachedAnalysis,
  setCachedAnalysis,
  logCacheTelemetry,
  ANALYSIS_MODEL,
  PROMPT_VERSION,
} from "./analysis-cache";

// Telemetry for tracking analysis quality
import {
  logAnalysisTelemetry,
  updateLocalStats,
  createAnalysisTelemetryEvent,
} from "./analysis-telemetry";

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_VIBECODE_OPENAI_API_KEY;

// ============================================
// ANALYZE RESULT TYPES (Error Union)
// ============================================

/**
 * Categorized error kinds for analysis failures.
 * Used for:
 * - User-friendly error messages
 * - Retry logic (e.g., rate_limited has retryAfterSeconds)
 * - Telemetry segmentation
 */
export type AnalyzeErrorKind =
  | "no_network"      // Network request failed, no connectivity
  | "timeout"         // Request took too long (AbortController timeout)
  | "cancelled"       // User cancelled (navigation/unmount) - usually don't show UI
  | "rate_limited"    // 429 - too many requests
  | "api_error"       // Generic API error (non-specific 4xx/5xx)
  | "unauthorized"    // 401/403 - auth issues
  | "bad_request"     // 400 - malformed request or unprocessable image
  | "server_error"    // 5xx - OpenAI server issues
  | "parse_error"     // JSON parse failed or invalid schema
  | "unknown";        // Catch-all for unexpected errors

/**
 * Structured error object for analysis failures.
 * Contains user-safe message + optional debug info.
 */
export interface AnalyzeError {
  kind: AnalyzeErrorKind;
  message: string;           // User-safe short message
  debug?: string;            // Optional developer string for logs
  retryAfterSeconds?: number; // For rate_limited errors
  httpStatus?: number;       // HTTP status code if available
}

/**
 * Result union type for analyzeClothingImage.
 * Either success with item data, or failure with error details.
 * 
 * Usage:
 * ```
 * const result = await analyzeClothingImage({ imageUri });
 * if (!result.ok) {
 *   // Handle error - result.error has kind, message, etc.
 *   return;
 * }
 * // Success - result.data is ClothingAnalysisResult
 * ```
 */
export type AnalyzeResult =
  | { ok: true; data: ClothingAnalysisResult; cacheHit: boolean }
  | { ok: false; error: AnalyzeError };

/**
 * Classify an error into AnalyzeError with appropriate kind and message.
 * Handles network errors, HTTP status codes, and fallback to unknown.
 */
export function classifyAnalyzeError(err: unknown, res?: Response): AnalyzeError {
  const errMessage = err instanceof Error ? err.message : String(err || "");
  const errName = err && typeof err === "object" && "name" in err ? String(err.name) : "";
  
  // Debug logging in dev only
  if (__DEV__) {
    console.log("[classifyAnalyzeError] name:", errName, "message:", errMessage);
  }
  
  // Note: Abort/timeout detection is handled deterministically in analyzeClothingImage
  // via didTimeout flag. This function only classifies non-abort errors.

  // Network/fetch errors - focused on common React Native patterns
  const isNetworkError =
    errMessage.includes("Network request failed") ||
    errMessage.includes("The Internet connection appears to be offline") ||
    errMessage.includes("ENOTFOUND") ||
    errMessage.includes("ECONNRESET") ||
    errMessage.includes("ECONNREFUSED") ||
    errMessage.includes("EHOSTUNREACH") ||
    errMessage.includes("Unable to resolve host") ||
    errMessage.includes("NSURLErrorDomain") ||
    errMessage.includes("Could not connect");

  if (isNetworkError) {
    return {
      kind: "no_network",
      message: "No internet connection.",
      debug: errMessage,
    };
  }

  // HTTP-based errors
  const status = res?.status;
  if (status) {
    if (status === 429) {
      // Rate limited - try to get Retry-After header
      const retryAfterHeader = res?.headers?.get?.("retry-after");
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      return {
        kind: "rate_limited",
        message: "Too many requests right now.",
        httpStatus: status,
        retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
      };
    }
    if (status === 401 || status === 403) {
      return {
        kind: "unauthorized",
        message: "Authorization error.",
        httpStatus: status,
        debug: "API key may be invalid or expired",
      };
    }
    if (status === 400) {
      return {
        kind: "bad_request",
        message: "Couldn't analyze this image.",
        httpStatus: status,
        debug: errMessage || "Bad request",
      };
    }
    if (status >= 500) {
      return {
        kind: "server_error",
        message: "Server error. Please try again.",
        httpStatus: status,
        debug: `HTTP ${status}`,
      };
    }
    if (status >= 400) {
      return {
        kind: "api_error",
        message: "Couldn't analyze this image.",
        httpStatus: status,
        debug: `HTTP ${status}: ${errMessage}`,
      };
    }
  }

  // JSON parse errors
  if (errMessage.includes("JSON") || errMessage.includes("parse") || errMessage.includes("Unexpected token")) {
    return {
      kind: "parse_error",
      message: "Couldn't understand the analysis.",
      debug: errMessage,
    };
  }

  // Fallback to unknown
  return {
    kind: "unknown",
    message: "Something went wrong.",
    debug: errMessage || undefined,
  };
}

// ============================================
// NON-FASHION ITEM DETECTION (FALLBACK)
// ============================================

/**
 * Keywords indicating the image is NOT a fashion item.
 * Used as fallback when AI response is missing isFashionItem or when
 * the model "guesses" fashion for an ambiguous image.
 */
const NON_FASHION_KEYWORDS = [
  // Kitchenware
  "mug", "cup", "glass", "plate", "bowl", "bottle", "jar", "pot", "pan",
  // Electronics
  "phone", "iphone", "android", "laptop", "keyboard", "mouse", "monitor", "screen",
  "tv", "television", "remote", "camera", "tablet", "computer", "charger", "cable",
  // Food & drinks
  "food", "coffee", "tea", "drink", "meal", "snack", "fruit", "vegetable",
  // Plants & nature
  "plant", "flower", "tree", "leaf", "garden",
  // Animals
  "pet", "dog", "cat", "bird", "fish", "animal",
  // Furniture
  "chair", "table", "sofa", "couch", "bed", "desk", "lamp", "shelf",
  // Vehicles
  "car", "bike", "bicycle", "motorcycle", "vehicle",
  // Other non-wearables
  "book", "magazine", "paper", "toy", "game", "tool", "box", "package",
];

/**
 * Fallback check for non-fashion items based on descriptive label.
 * Use ONLY when AI response is missing isFashionItem (not as override).
 * 
 * Uses whole-word matching to avoid false positives:
 * - "cat" won't match "catherine" or "catalog"
 * - "mug" won't match "smuggle"
 * 
 * @param label - The descriptive label from AI analysis
 * @returns true if likely a fashion item, false if clearly not
 */
export function fallbackIsFashionItem(label?: string): boolean {
  if (!label) return true; // Be permissive if we truly don't know
  
  const lowerLabel = label.toLowerCase();
  
  // Use whole-word matching with word boundaries
  // This prevents "cat" from matching "catalog" or "catherine"
  return !NON_FASHION_KEYWORDS.some(keyword => {
    // Create regex for whole word match
    const wordBoundaryRegex = new RegExp(`\\b${keyword}\\b`, 'i');
    return wordBoundaryRegex.test(lowerLabel);
  });
}

// ============================================
// IMAGE OPTIMIZATION CONSTANTS
// ============================================

/**
 * Max image dimension for OpenAI Vision API.
 * GPT-4 Vision handles 768px excellently for clothing analysis.
 * Reducing from typical 3000-4000px camera output saves:
 * - 30-50% faster base64 conversion
 * - 20-40% faster API response (smaller payload)
 * 
 * Note: 768px is the sweet spot - large enough for detail, small enough for speed.
 */
const MAX_IMAGE_DIMENSION = 768;

/**
 * JPEG compression quality for optimized images.
 * 0.75 provides good quality with excellent compression for API use.
 * Visual quality is still great - compression artifacts only visible at zoom.
 */
const IMAGE_COMPRESSION_QUALITY = 0.75;

// ============================================
// IMAGE OPTIMIZATION
// ============================================

/**
 * Optimize image for API submission.
 * Resizes large images to MAX_IMAGE_DIMENSION and compresses to JPEG.
 * 
 * Performance improvement: ~20-40% faster base64, ~10-30% faster API
 * Quality impact: Negligible - GPT-4 Vision works great at 1024px
 * 
 * @param imageUri - Original image URI
 * @returns Optimized image URI (or original if already small/on web)
 */
async function optimizeImageForApi(imageUri: string): Promise<string> {
  // Skip optimization for data URLs (already processed)
  if (imageUri.startsWith("data:")) {
    return imageUri;
  }

  // Skip optimization on web (ImageManipulator has limited web support)
  if (Platform.OS === "web") {
    return imageUri;
  }

  try {
    const startTime = Date.now();
    
    // Resize and compress the image
    // Using width constraint - height will scale proportionally
    const result = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: MAX_IMAGE_DIMENSION } }],
      { 
        compress: IMAGE_COMPRESSION_QUALITY, 
        format: ImageManipulator.SaveFormat.JPEG 
      }
    );
    
    const duration = Date.now() - startTime;
    console.log(`[Perf] Image optimized: ${result.width}x${result.height}, quality=${IMAGE_COMPRESSION_QUALITY}, time=${duration}ms`);
    
    return result.uri;
  } catch (error) {
    // If optimization fails, fall back to original image
    console.warn("[Perf] Image optimization failed, using original:", error);
    return imageUri;
  }
}

/**
 * Convert image URI to base64 data URL (handles both native and web)
 */
async function getImageDataUrl(imageUri: string): Promise<string> {
  // If it's already a data URL, return as-is
  if (imageUri.startsWith("data:")) {
    return imageUri;
  }

  if (Platform.OS === "web") {
    // On web, fetch the image and convert to base64
    try {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const mimeType = blob.type || "image/jpeg";

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.log("Error converting image to base64 on web, using fallback");
      throw error;
    }
  } else {
    // On native, use FileSystem
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    // After optimization, images are always JPEG
    return `data:image/jpeg;base64,${base64}`;
  }
}

export interface ClothingAnalysisResult {
  category: Category;
  descriptiveLabel: string;
  colors: ColorInfo[];
  styleTags: StyleVibe[];
  styleNotes: string[];
  // Item signals for decision tree
  itemSignals: ItemSignalsResult;
  // Context quality
  contextSufficient: boolean;
  // Confidence engine signals (enhanced analysis)
  confidenceSignals?: ConfidenceSignals;
  /** False if image is not wearable fashion (mug, electronics, food, etc.) */
  isFashionItem: boolean;
}

// Unified item signals structure from AI
export interface ItemSignalsResult {
  // For tops
  silhouetteVolume?: SilhouetteVolume;
  lengthCategory?: LengthCategory;
  layeringFriendly?: boolean;
  // For bottoms
  legShape?: LegShape;
  rise?: Rise;
  balanceRequirement?: StylingRisk;
  // For skirts
  skirtVolume?: "straight" | "flowy";
  // For dresses
  dressSilhouette?: SilhouetteVolume | "structured";
  // For outerwear
  structure?: StructureLevel;
  bulk?: BulkLevel;
  layeringDependency?: StylingRisk;
  // For shoes
  styleVersatility?: VersatilityLevel;
  statementLevel?: StatementLevel;
  // Styling risk assessment (AI-determined)
  stylingRisk: StylingRisk;
}

/**
 * Optional context for telemetry
 */
export interface AnalysisContext {
  scan_session_id?: string;
  user_id?: string;
  image_source?: 'camera' | 'gallery' | 'unknown';
  image_width?: number;
  image_height?: number;
}

/**
 * Parameters for analyzeClothingImage
 */
export interface AnalyzeParams {
  imageUri: string;
  timeoutMs?: number;
  signal?: AbortSignal; // External abort signal for cancellation
  ctx?: AnalysisContext;
}

/**
 * Analyze a clothing item image using OpenAI GPT-5.1 Vision API.
 *
 * Returns a Result union type - either success with data or failure with error.
 * NO FALLBACK DATA - failures are explicit errors that callers must handle.
 *
 * Results are cached by image hash for deterministic results.
 * Same image bytes → same analysis (until prompt/model version changes).
 *
 * @param params - Image URI, optional timeout, abort signal, and telemetry context
 * @returns AnalyzeResult - { ok: true, data } or { ok: false, error }
 */
export async function analyzeClothingImage(
  params: AnalyzeParams | string,
  ctx?: AnalysisContext
): Promise<AnalyzeResult> {
  // Support both old signature (string) and new signature (params object)
  const normalizedParams: AnalyzeParams = typeof params === "string"
    ? { imageUri: params, ctx }
    : params;
  
  const { imageUri, timeoutMs = 30000, signal: externalSignal } = normalizedParams;
  const telemetryCtx = normalizedParams.ctx ?? ctx;
  const startTime = Date.now();
  console.log("analyzeClothingImage called, API key exists:", !!OPENAI_API_KEY);

  // ============================================
  // DEV: SIMULATE TIMEOUT FOR TESTING
  // Set to true to test timeout error UI
  // ============================================
  const SIMULATE_TIMEOUT = false;
  if (SIMULATE_TIMEOUT) {
    console.log("[DEV] Simulating timeout after 2 seconds...");
    await new Promise(resolve => setTimeout(resolve, 2000));
    return {
      ok: false,
      error: { kind: "timeout", message: "It's taking longer than usual. Try again in a moment." },
    };
  }
  // ============================================

  // ============================================
  // ABORT/TIMEOUT HANDLING (deterministic, no string guessing)
  // ============================================
  // We use a single internal controller and cascade external aborts into it.
  // This gives us deterministic classification:
  //   - Timeout: didTimeout=true + controller.abort() → "timeout" error
  //   - User cancel: externalSignal aborts → controller.abort() → "cancelled" error
  //
  // The fetch uses controller.signal, so we check controller.signal.aborted in catch.
  // This is equivalent to merging signals but simpler.
  // ============================================
  const controller = new AbortController();
  let didTimeout = false;
  
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  
  // Link external abort signal if provided (user cancellation via navigation/unmount)
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      return {
        ok: false,
        error: { kind: "cancelled", message: "Cancelled.", debug: "External signal already aborted" },
      };
    }
    externalSignal.addEventListener("abort", () => controller.abort());
  }

  // Helper to log telemetry
  const logTelemetry = (result: ClothingAnalysisResult, cacheHit: boolean, cacheKeyPrefix?: string, fallbackUsed?: boolean) => {
    const event = createAnalysisTelemetryEvent({
      scanSessionId: telemetryCtx?.scan_session_id,
      userId: telemetryCtx?.user_id,
      imageWidth: telemetryCtx?.image_width ?? 0,
      imageHeight: telemetryCtx?.image_height ?? 0,
      imageSource: telemetryCtx?.image_source ?? 'unknown',
      analysisSuccess: true,
      analysisDurationMs: Date.now() - startTime,
      contextSufficient: result.contextSufficient,
      detectedCategory: result.category,
      cacheHit,
      cacheKeyPrefix,
      styleTagsCount: result.styleTags?.length ?? 0,
      colorsCount: result.colors?.length ?? 0,
      // Non-fashion detection telemetry
      isFashionItem: result.isFashionItem,
      isNonFashionFallbackUsed: fallbackUsed,
      descriptiveLabel: result.isFashionItem === false ? result.descriptiveLabel : undefined,
    });
    logAnalysisTelemetry(event);
    updateLocalStats({ ...event, timestamp: new Date().toISOString() });
  };

  // Helper to log failure telemetry
  const logFailureTelemetry = (error: AnalyzeError) => {
    const event = createAnalysisTelemetryEvent({
      scanSessionId: telemetryCtx?.scan_session_id,
      userId: telemetryCtx?.user_id,
      imageWidth: telemetryCtx?.image_width ?? 0,
      imageHeight: telemetryCtx?.image_height ?? 0,
      imageSource: telemetryCtx?.image_source ?? 'unknown',
      analysisSuccess: false,
      analysisDurationMs: Date.now() - startTime,
      contextSufficient: false,
      detectedCategory: undefined,
      cacheHit: false,
      styleTagsCount: 0,
      colorsCount: 0,
    });
    logAnalysisTelemetry(event);
    updateLocalStats({ ...event, timestamp: new Date().toISOString() });
    
    // Log error details in dev
    if (__DEV__) {
      console.log("[AnalysisTelemetry] Analysis failed:", error.kind, error.debug);
    }
  };

  if (!OPENAI_API_KEY) {
    console.log("OpenAI API key not configured");
    clearTimeout(timeoutId);
    const error: AnalyzeError = {
      kind: "unauthorized",
      message: "API not configured.",
      debug: "OPENAI_API_KEY is missing",
    };
    logFailureTelemetry(error);
    return { ok: false, error };
  }

  try {
    // ============================================
    // PHASE 1 OPTIMIZATION: Image compression
    // Resize large images to 1024px for faster processing
    // ============================================
    console.log("[Perf] Starting image optimization...");
    const optimizeStart = Date.now();
    const optimizedUri = await optimizeImageForApi(imageUri);
    console.log(`[Perf] Image optimization: ${Date.now() - optimizeStart}ms`);

    // ============================================
    // Convert to base64 (now working with smaller image)
    // ============================================
    console.log("[Perf] Converting to base64...");
    const base64Start = Date.now();
    const dataUrl = await getImageDataUrl(optimizedUri);
    console.log(`[Perf] Base64 conversion: ${Date.now() - base64Start}ms, size: ${Math.round(dataUrl.length / 1024)}KB`);

    // ============================================
    // CACHE CHECK: Same bytes → same analysis
    // Hash computation uses expo-crypto which runs on native thread
    // ============================================
    const hashStart = Date.now();
    let imageSha256: string;
    let cacheKey: string;
    
    try {
      imageSha256 = await sha256Hex(dataUrl);
      cacheKey = generateCacheKey(imageSha256);
      console.log(`[Perf] Hash computation: ${Date.now() - hashStart}ms, hash: ${imageSha256.slice(0, 8)}`);
    } catch (hashError) {
      console.log(`[Perf] Hash failed after ${Date.now() - hashStart}ms, skipping cache:`, hashError);
      // Continue without caching if hash fails
      imageSha256 = '';
      cacheKey = '';
    }

    // Try to get from cache first (only if we have a valid key)
    if (cacheKey) {
      const cacheStart = Date.now();
      const cachedResult = await getCachedAnalysis(cacheKey);
      if (cachedResult) {
        logCacheTelemetry(true, imageSha256, telemetryCtx?.scan_session_id);
        console.log(`[Perf] Cache HIT in ${Date.now() - cacheStart}ms, total: ${Date.now() - startTime}ms`);
        // Log telemetry for cache hit
        logTelemetry(cachedResult, true, imageSha256.slice(0, 8));
        clearTimeout(timeoutId);
        return { ok: true, data: cachedResult, cacheHit: true };
      }
      logCacheTelemetry(false, imageSha256, telemetryCtx?.scan_session_id);
      console.log(`[Perf] Cache miss (lookup: ${Date.now() - cacheStart}ms), calling OpenAI API...`);
    } else {
      console.log("[Perf] Skipping cache (no hash), calling OpenAI API directly");
    }

    const prompt = `Analyze this image and respond ONLY with a valid JSON object (no markdown, no explanation).

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

IMPORTANT: styleTags must NEVER be empty. Always include at least one tag. If truly uncertain, include the single most likely tag.

contextSufficient: Set to false if photo is blurry, item is partially visible, or item type is ambiguous.

confidenceSignals:
- color_profile.is_neutral: true for black, white, gray, beige, tan, cream, navy (desaturated blues)
- color_profile.dominant_hue: 0=red, 30=orange, 60=yellow, 120=green, 180=cyan, 240=blue, 300=magenta
- color_profile.saturation: low (muted/gray), med (moderate), high (vibrant/bold)
- color_profile.value: low (dark), med (medium), high (light/bright)
- style_family: minimal (clean/simple), classic (timeless/refined), street (urban/casual-cool), athleisure (sport-influenced), romantic (soft/feminine), edgy (bold/unconventional), boho (relaxed/artistic), preppy (polished/traditional), formal (business/black-tie)
- formality_level: 1=athleisure/loungewear, 2=casual everyday, 3=smart casual, 4=business, 5=formal/black-tie
- texture_type: smooth (silk/satin), textured (knit/tweed), soft (cotton jersey/cashmere), structured (denim/canvas), mixed (multiple)

itemSignals (include ONLY the fields relevant to the category):

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

stylingRisk guidelines:
- "low": Easy to style, versatile, works with most outfits
- "medium": Requires some thought, works with right pieces
- "high": Statement piece, extreme volume/length, requires deliberate styling

Respond with ONLY the JSON object.`;

    // ============================================
    // OPENAI API CALL (main latency bottleneck)
    // ============================================
    const apiStart = Date.now();
    console.log("[Perf] Calling OpenAI API...");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.1",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        max_completion_tokens: 1000,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[Perf] OpenAI API error after ${Date.now() - apiStart}ms (status: ${response.status}):`, errorText);
      clearTimeout(timeoutId);
      const error = classifyAnalyzeError(new Error(errorText), response);
      logFailureTelemetry(error);
      return { ok: false, error };
    }

    const data = await response.json();
    const apiDuration = Date.now() - apiStart;
    console.log(`[Perf] OpenAI API response: ${apiDuration}ms`);

    // Extract the text response from OpenAI format
    const responseText = data.choices?.[0]?.message?.content ?? "";

    if (!responseText) {
      console.log("No text response from OpenAI, data:", JSON.stringify(data));
      clearTimeout(timeoutId);
      const error: AnalyzeError = {
        kind: "parse_error",
        message: "No response from analysis.",
        debug: "Empty response text from OpenAI",
      };
      logFailureTelemetry(error);
      return { ok: false, error };
    }

    if (__DEV__) {
      console.log("[Debug] OpenAI analysis text:", responseText.slice(0, 200) + "...");
    }

    // Parse the JSON response
    // Clean up the response in case it has markdown code blocks
    let cleanedResponse = responseText.trim();
    if (cleanedResponse.startsWith("```json")) {
      cleanedResponse = cleanedResponse.slice(7);
    }
    if (cleanedResponse.startsWith("```")) {
      cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith("```")) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }
    cleanedResponse = cleanedResponse.trim();

    let analysis: ClothingAnalysisResult;
    try {
      analysis = JSON.parse(cleanedResponse) as ClothingAnalysisResult;
    } catch (parseError) {
      console.log("Failed to parse OpenAI response:", cleanedResponse.slice(0, 200));
      clearTimeout(timeoutId);
      const error: AnalyzeError = {
        kind: "parse_error",
        message: "Couldn't understand the analysis.",
        debug: `JSON parse failed: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      };
      logFailureTelemetry(error);
      return { ok: false, error };
    }

    // Validate and normalize the response
    const { analysis: validatedAnalysis, nonFashionFallbackUsed } = validateAnalysis(analysis);

    // ============================================
    // CACHE SET: Store successful analysis
    // ============================================
    // Only cache if we have a valid key
    if (cacheKey) {
      // Don't await - fire and forget (won't block return)
      setCachedAnalysis({
        analysisKey: cacheKey,
        imageSha256,
        model: ANALYSIS_MODEL,
        promptVersion: PROMPT_VERSION,
        analysis: validatedAnalysis,
      }).catch((err) => {
        // Log but don't fail - caching is optional
        console.log("Failed to cache analysis:", err);
      });
    }

    // Log telemetry for cache miss (API call made)
    logTelemetry(validatedAnalysis, false, imageSha256?.slice(0, 8), nonFashionFallbackUsed);

    // Performance summary
    const totalDuration = Date.now() - startTime;
    console.log(`[Perf] ✅ Analysis complete: ${totalDuration}ms total (category: ${validatedAnalysis.category})`);

    clearTimeout(timeoutId);
    return { ok: true, data: validatedAnalysis, cacheHit: false };
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Deterministic abort handling - no string guessing needed
    if (controller.signal.aborted) {
      // Don't log as error - abort is expected when user closes screen
      console.log("[Analysis] Aborted:", didTimeout ? "timeout" : "user cancelled");
      const abortError: AnalyzeError = didTimeout
        ? { kind: "timeout", message: "It's taking longer than usual. Try again in a moment." }
        : { kind: "cancelled", message: "Cancelled.", debug: "Aborted by navigation/unmount" };
      
      // Only log telemetry for timeouts, not user cancellations
      if (didTimeout) {
        logFailureTelemetry(abortError);
      }
      
      return { ok: false, error: abortError };
    }
    
    // Classify non-abort errors (network, HTTP, etc.) - these are real errors
    console.log("[Analysis] Failed:", error);
    const classifiedError = classifyAnalyzeError(error);
    logFailureTelemetry(classifiedError);
    
    return { ok: false, error: classifiedError };
  }
}

interface ValidatedAnalysisResult {
  analysis: ClothingAnalysisResult;
  nonFashionFallbackUsed: boolean; // True if keyword fallback determined non-fashion status
}

/**
 * Validate and normalize the AI analysis response
 */
function validateAnalysis(analysis: ClothingAnalysisResult): ValidatedAnalysisResult {
  const validFashionCategories: Category[] = ["tops", "bottoms", "dresses", "skirts", "outerwear", "shoes", "bags", "accessories"];
  const validStyles: StyleVibe[] = ["casual", "minimal", "office", "street", "feminine", "sporty"];

  // Validate descriptive label first (needed for fallback)
  const descriptiveLabel = analysis.descriptiveLabel || "";

  // ============================================
  // NORMALIZE isFashionItem (with fallback)
  // ============================================
  // 1. Use AI response if boolean
  // 2. Fallback to keyword check ONLY if AI didn't provide isFashionItem
  // 3. Keep isFashionItem and category INDEPENDENT:
  //    - isFashionItem=false → definitely not fashion (mug, phone)
  //    - isFashionItem=true, category=unknown → uncertain (blurry shirt)
  const aiProvidedIsFashion = typeof analysis.isFashionItem === "boolean";
  const isFashionItem = aiProvidedIsFashion
    ? analysis.isFashionItem
    : fallbackIsFashionItem(descriptiveLabel);
  
  // Track if keyword fallback was used to determine non-fashion status
  // This is for telemetry to help tune the keyword list
  const nonFashionFallbackUsed = !aiProvidedIsFashion && isFashionItem === false;

  // ============================================
  // VALIDATE CATEGORY
  // ============================================
  // Note: category="unknown" is valid for fashion items (uncertain/blurry)
  let category: Category;
  if (!isFashionItem) {
    // Non-fashion: force "unknown" category
    category = "unknown";
  } else if (analysis.category === "unknown") {
    // Fashion but uncertain category (blurry photo, ambiguous item)
    category = "unknown";
  } else if (validFashionCategories.includes(analysis.category as Category)) {
    category = analysis.category as Category;
  } else {
    // Invalid category string - default to "unknown" (let user pick)
    category = "unknown";
  }

  // Use default label if empty
  const finalLabel = descriptiveLabel || getDefaultLabel(category);

  // ============================================
  // EARLY RETURN FOR NON-FASHION ITEMS
  // ============================================
  if (!isFashionItem) {
    return {
      analysis: {
        category: "unknown",
        descriptiveLabel: finalLabel || "Non-fashion item",
        colors: [],
        styleTags: [],
        styleNotes: [],
        itemSignals: { stylingRisk: "low" },
        contextSufficient: analysis.contextSufficient ?? false,
        isFashionItem: false,
      },
      nonFashionFallbackUsed,
    };
  }

  // Validate colors
  const colors: ColorInfo[] = [];
  if (Array.isArray(analysis.colors)) {
    for (const color of analysis.colors.slice(0, 3)) {
      if (color.hex && color.name) {
        colors.push({
          hex: color.hex.startsWith("#") ? color.hex : `#${color.hex}`,
          name: color.name,
        });
      }
    }
  }
  if (colors.length === 0) {
    colors.push({ hex: "#000000", name: "Black" });
  }

  // Validate style notes first (needed for fallback inference)
  const styleNotes: string[] = [];
  if (Array.isArray(analysis.styleNotes)) {
    for (const note of analysis.styleNotes.slice(0, 3)) {
      if (typeof note === "string" && note.length > 0) {
        styleNotes.push(note);
      }
    }
  }
  if (styleNotes.length === 0) {
    styleNotes.push("Classic style");
  }

  // Validate style tags from AI
  const rawStyleTags: StyleVibe[] = [];
  if (Array.isArray(analysis.styleTags)) {
    for (const tag of analysis.styleTags) {
      if (validStyles.includes(tag as StyleVibe)) {
        rawStyleTags.push(tag as StyleVibe);
      }
    }
  }

  // Use fallback inference if no valid tags
  // This ensures styleTags is never empty when we have styleNotes
  const { styleTags, styleFamily, fallbackUsed } = normalizeStyleTags(rawStyleTags, styleNotes);

  // Log instrumentation for tracking
  if (fallbackUsed) {
    console.log('[StyleInference] Fallback used:', {
      originalTags: analysis.styleTags,
      inferredTags: styleTags,
      inferredFamily: styleFamily,
      styleNotes,
    });
  }

  // Validate item signals
  const itemSignals = validateItemSignals(analysis.itemSignals, category);

  // Validate context sufficiency
  const contextSufficient = analysis.contextSufficient !== false;

  // Validate confidence signals - pass inferred styleFamily if fallback was used
  const confidenceSignals = validateConfidenceSignals(
    analysis.confidenceSignals,
    colors,
    styleNotes,
    fallbackUsed ? styleFamily : undefined
  );

  return {
    analysis: {
      category,
      descriptiveLabel: finalLabel,
      colors,
      styleTags,
      styleNotes,
      itemSignals,
      contextSufficient,
      confidenceSignals,
      isFashionItem: true,
    },
    nonFashionFallbackUsed: false,
  };
}

/**
 * Validate and normalize item signals from AI response
 */
function validateItemSignals(
  signals: Partial<ItemSignalsResult> | undefined,
  category: Category
): ItemSignalsResult {
  const validStylingRisk: StylingRisk[] = ["low", "medium", "high"];

  // Default styling risk based on category
  const defaultRisk: StylingRisk =
    category === "accessories" || category === "bags" ? "low" :
    category === "shoes" ? "low" :
    "medium";

  if (!signals) {
    return getDefaultSignalsForCategory(category);
  }

  // Validate styling risk
  const stylingRisk = validStylingRisk.includes(signals.stylingRisk as StylingRisk)
    ? signals.stylingRisk as StylingRisk
    : defaultRisk;

  return {
    ...signals,
    stylingRisk,
  };
}

/**
 * Validate and normalize confidence signals from AI response
 */
function validateConfidenceSignals(
  signals: Partial<ConfidenceSignals> | undefined,
  colors: ColorInfo[],
  styleNotes: string[],
  inferredStyleFamily?: StyleFamily
): ConfidenceSignals {
  const validStyleFamilies: StyleFamily[] = [
    'minimal', 'classic', 'street', 'athleisure', 'romantic',
    'edgy', 'boho', 'preppy', 'formal', 'unknown'
  ];
  const validFormalityLevels: FormalityLevel[] = [1, 2, 3, 4, 5];
  const validTextureTypes: TextureType[] = [
    'smooth', 'textured', 'soft', 'structured', 'mixed', 'unknown'
  ];
  const validSaturation: Array<'low' | 'med' | 'high'> = ['low', 'med', 'high'];
  const validValue: Array<'low' | 'med' | 'high'> = ['low', 'med', 'high'];

  // Default color profile from hex colors
  const defaultColorProfile = inferColorProfileFromHex(colors);

  if (!signals) {
    return {
      color_profile: defaultColorProfile,
      style_family: inferredStyleFamily ?? 'unknown',
      formality_level: 2,
      texture_type: 'unknown',
    };
  }

  // Validate color profile
  let colorProfile = defaultColorProfile;
  if (signals.color_profile) {
    const cp = signals.color_profile;
    colorProfile = {
      is_neutral: typeof cp.is_neutral === 'boolean' ? cp.is_neutral : defaultColorProfile.is_neutral,
      dominant_hue: cp.is_neutral ? undefined : (typeof cp.dominant_hue === 'number' ? Math.round(cp.dominant_hue) % 360 : defaultColorProfile.dominant_hue),
      saturation: validSaturation.includes(cp.saturation as 'low' | 'med' | 'high') ? cp.saturation as 'low' | 'med' | 'high' : defaultColorProfile.saturation,
      value: validValue.includes(cp.value as 'low' | 'med' | 'high') ? cp.value as 'low' | 'med' | 'high' : defaultColorProfile.value,
    };
  }

  // Validate style family - use inferred if AI didn't provide valid one
  let styleFamily: StyleFamily;
  if (validStyleFamilies.includes(signals.style_family as StyleFamily) && signals.style_family !== 'unknown') {
    styleFamily = signals.style_family as StyleFamily;
  } else if (inferredStyleFamily && inferredStyleFamily !== 'unknown') {
    styleFamily = inferredStyleFamily;
  } else {
    styleFamily = inferStyleFamilyFromNotes(styleNotes);
  }

  // Validate formality level
  const formalityLevel = validFormalityLevels.includes(signals.formality_level as FormalityLevel)
    ? signals.formality_level as FormalityLevel
    : 2;

  // Validate texture type
  const textureType = validTextureTypes.includes(signals.texture_type as TextureType)
    ? signals.texture_type as TextureType
    : 'unknown';

  return {
    color_profile: colorProfile,
    style_family: styleFamily,
    formality_level: formalityLevel,
    texture_type: textureType,
  };
}

/**
 * Infer color profile from hex color
 */
function inferColorProfileFromHex(colors: ColorInfo[]): ConfidenceSignals['color_profile'] {
  if (!colors || colors.length === 0) {
    return { is_neutral: true, saturation: 'med', value: 'med' };
  }

  const hex = colors[0].hex;
  const name = colors[0].name.toLowerCase();

  // Check known neutrals by name
  const neutralNames = ['black', 'white', 'gray', 'grey', 'beige', 'tan', 'cream', 'charcoal', 'ivory', 'silver'];
  const isNeutralByName = neutralNames.some(n => name.includes(n));

  // Parse hex to RGB
  let r = 0, g = 0, b = 0;
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length === 6) {
    r = parseInt(cleanHex.slice(0, 2), 16) / 255;
    g = parseInt(cleanHex.slice(2, 4), 16) / 255;
    b = parseInt(cleanHex.slice(4, 6), 16) / 255;
  }

  // Convert to HSV
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  // Determine if neutral by saturation
  const isNeutral = isNeutralByName || s < 0.15;

  // Map to levels
  const satLevel: 'low' | 'med' | 'high' = s < 0.33 ? 'low' : s < 0.66 ? 'med' : 'high';
  const valLevel: 'low' | 'med' | 'high' = v < 0.33 ? 'low' : v < 0.66 ? 'med' : 'high';

  return {
    is_neutral: isNeutral,
    dominant_hue: isNeutral ? undefined : Math.round(h),
    saturation: satLevel,
    value: valLevel,
  };
}

/**
 * Infer style family from style notes
 */
function inferStyleFamilyFromNotes(styleNotes: string[]): StyleFamily {
  const notesLower = styleNotes.join(' ').toLowerCase();

  if (notesLower.includes('minimal') || notesLower.includes('clean') || notesLower.includes('simple')) return 'minimal';
  if (notesLower.includes('classic') || notesLower.includes('timeless')) return 'classic';
  if (notesLower.includes('street') || notesLower.includes('urban')) return 'street';
  if (notesLower.includes('athletic') || notesLower.includes('sporty') || notesLower.includes('sport')) return 'athleisure';
  if (notesLower.includes('romantic') || notesLower.includes('feminine') || notesLower.includes('soft')) return 'romantic';
  if (notesLower.includes('edgy') || notesLower.includes('bold') || notesLower.includes('punk')) return 'edgy';
  if (notesLower.includes('boho') || notesLower.includes('bohemian')) return 'boho';
  if (notesLower.includes('preppy') || notesLower.includes('collegiate')) return 'preppy';
  if (notesLower.includes('formal') || notesLower.includes('elegant') || notesLower.includes('dressy')) return 'formal';

  return 'unknown';
}

/**
 * Get default signals for a category
 */
function getDefaultSignalsForCategory(category: Category): ItemSignalsResult {
  switch (category) {
    case "tops":
      return {
        silhouetteVolume: "relaxed",
        lengthCategory: "mid",
        layeringFriendly: true,
        stylingRisk: "medium",
      };
    case "bottoms":
      return {
        legShape: "straight",
        rise: "mid",
        balanceRequirement: "medium",
        stylingRisk: "medium",
      };
    case "skirts":
      return {
        lengthCategory: "midi",
        skirtVolume: "straight",
        stylingRisk: "medium",
      };
    case "dresses":
      return {
        dressSilhouette: "relaxed",
        lengthCategory: "mid",
        stylingRisk: "medium",
      };
    case "outerwear":
      return {
        structure: "soft",
        bulk: "medium",
        layeringDependency: "medium",
        stylingRisk: "medium",
      };
    case "shoes":
      return {
        styleVersatility: "medium",
        statementLevel: "neutral",
        stylingRisk: "low",
      };
    case "bags":
    case "accessories":
    default:
      return {
        styleVersatility: "medium",
        stylingRisk: "low",
      };
  }
}

/**
 * Get default label for a category
 */
function getDefaultLabel(category: Category): string {
  const labels: Record<Category, string> = {
    tops: "Relaxed top",
    bottoms: "Classic trousers",
    outerwear: "Structured jacket",
    shoes: "Everyday sneakers",
    bags: "Crossbody bag",
    accessories: "Minimal accessory",
    dresses: "Classic dress",
    skirts: "Versatile skirt",
    unknown: "Non-fashion item",
  };
  return labels[category];
}

// NOTE: getFallbackAnalysis has been removed.
// The analyzeClothingImage function now returns AnalyzeResult with explicit errors.
// Callers must handle the { ok: false, error } case appropriately.
