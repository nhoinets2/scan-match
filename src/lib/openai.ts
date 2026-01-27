// AI API integration for clothing image analysis
// Now routes through Supabase Edge Function for security

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
import { supabase } from "./supabase";

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

// Edge Function URL - constructed from Supabase URL
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const ANALYZE_IMAGE_URL = SUPABASE_URL 
  ? `${SUPABASE_URL}/functions/v1/analyze-image`
  : "";

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
  | "quota_exceeded"  // User has exceeded their quota
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
  | { ok: true; data: ClothingAnalysisResult; cacheHit: boolean; quotaInfo?: QuotaInfo }
  | { ok: false; error: AnalyzeError; quotaInfo?: QuotaInfo };

/**
 * Quota information returned from the server
 */
export interface QuotaInfo {
  monthlyUsed: number;
  monthlyLimit: number;
  monthlyRemaining: number;
}

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
  
  // Network/fetch errors - focused on common React Native patterns
  const isNetworkError =
    errMessage.includes("Network request failed") ||
    errMessage.includes("The Internet connection appears to be offline") ||
    errMessage.includes("The network connection was lost") ||
    errMessage.includes("A data connection is not currently allowed") ||
    errMessage.includes("The request timed out") ||
    errMessage.includes("ENOTFOUND") ||
    errMessage.includes("ECONNRESET") ||
    errMessage.includes("ECONNREFUSED") ||
    errMessage.includes("EHOSTUNREACH") ||
    errMessage.includes("Unable to resolve host") ||
    errMessage.includes("NSURLErrorDomain") ||
    errMessage.includes("Could not connect") ||
    errMessage.includes("kCFErrorDomainCFNetwork");

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
        debug: "Auth token may be invalid or expired",
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

const NON_FASHION_KEYWORDS = [
  "mug", "cup", "glass", "plate", "bowl", "bottle", "jar", "pot", "pan",
  "phone", "iphone", "android", "laptop", "keyboard", "mouse", "monitor", "screen",
  "tv", "television", "remote", "camera", "tablet", "computer", "charger", "cable",
  "food", "coffee", "tea", "drink", "meal", "snack", "fruit", "vegetable",
  "plant", "flower", "tree", "leaf", "garden",
  "pet", "dog", "cat", "bird", "fish", "animal",
  "chair", "table", "sofa", "couch", "bed", "desk", "lamp", "shelf",
  "car", "bike", "bicycle", "motorcycle", "vehicle",
  "book", "magazine", "paper", "toy", "game", "tool", "box", "package",
];

export function fallbackIsFashionItem(label?: string): boolean {
  if (!label) return true;
  const lowerLabel = label.toLowerCase();
  return !NON_FASHION_KEYWORDS.some(keyword => {
    const wordBoundaryRegex = new RegExp(`\\b${keyword}\\b`, 'i');
    return wordBoundaryRegex.test(lowerLabel);
  });
}

// ============================================
// IMAGE OPTIMIZATION CONSTANTS
// ============================================

const MAX_IMAGE_DIMENSION = 768;
const IMAGE_COMPRESSION_QUALITY = 0.75;

// ============================================
// IMAGE OPTIMIZATION
// ============================================

async function optimizeImageForApi(imageUri: string): Promise<string> {
  if (imageUri.startsWith("data:")) {
    return imageUri;
  }

  if (Platform.OS === "web") {
    return imageUri;
  }

  try {
    const startTime = Date.now();
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
    console.warn("[Perf] Image optimization failed, using original:", error);
    return imageUri;
  }
}

async function getImageDataUrl(imageUri: string): Promise<string> {
  if (imageUri.startsWith("data:")) {
    return imageUri;
  }

  if (Platform.OS === "web") {
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
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:image/jpeg;base64,${base64}`;
  }
}

import type { StyleSignalsV1 } from './trust-filter/types';

export interface ClothingAnalysisResult {
  category: Category;
  descriptiveLabel: string;
  colors: ColorInfo[];
  styleTags: StyleVibe[];
  styleNotes: string[];
  itemSignals: ItemSignalsResult;
  contextSufficient: boolean;
  confidenceSignals?: ConfidenceSignals;
  isFashionItem: boolean;
  /** Style signals for Trust Filter (combined in single API call) */
  styleSignals?: StyleSignalsV1;
}

export interface ItemSignalsResult {
  silhouetteVolume?: SilhouetteVolume;
  lengthCategory?: LengthCategory;
  layeringFriendly?: boolean;
  legShape?: LegShape;
  rise?: Rise;
  balanceRequirement?: StylingRisk;
  skirtVolume?: "straight" | "flowy";
  dressSilhouette?: SilhouetteVolume | "structured";
  structure?: StructureLevel;
  bulk?: BulkLevel;
  layeringDependency?: StylingRisk;
  styleVersatility?: VersatilityLevel;
  statementLevel?: StatementLevel;
  stylingRisk: StylingRisk;
}

export interface AnalysisContext {
  scan_session_id?: string;
  user_id?: string;
  image_source?: 'camera' | 'gallery' | 'unknown';
  image_width?: number;
  image_height?: number;
}

export interface AnalyzeParams {
  imageUri: string;
  idempotencyKey: string; // Now required - must be generated before calling
  operationType?: 'scan' | 'wardrobe_add'; // Which quota pool to use (default: scan)
  skipCache?: boolean; // Skip cache lookup for new images (default: false)
  timeoutMs?: number;
  signal?: AbortSignal;
  ctx?: AnalysisContext;
}

/**
 * Analyze a clothing item image using server-side OpenAI Vision API.
 * 
 * SECURITY: This function now calls a Supabase Edge Function instead of
 * OpenAI directly. The OpenAI API key is stored securely on the server.
 * 
 * QUOTA: The Edge Function handles quota consumption atomically before
 * making the OpenAI call. If quota is exceeded, returns quota_exceeded error.
 *
 * @param params - Image URI, idempotency key, optional timeout and abort signal
 * @returns AnalyzeResult - { ok: true, data } or { ok: false, error }
 */
export async function analyzeClothingImage(
  params: AnalyzeParams | string,
  ctx?: AnalysisContext
): Promise<AnalyzeResult> {
  // Support both old signature (string) and new signature (params object)
  const normalizedParams: AnalyzeParams = typeof params === "string"
    ? { imageUri: params, idempotencyKey: `legacy_${Date.now()}`, ctx }
    : params;
  
  const { 
    imageUri, 
    idempotencyKey, 
    operationType = 'scan',
    skipCache = false,
    timeoutMs = 45000, 
    signal: externalSignal 
  } = normalizedParams;
  const telemetryCtx = normalizedParams.ctx ?? ctx;
  const startTime = Date.now();
  
  console.log(`[analyzeClothingImage] Starting ${operationType} analysis via Edge Function`);

  // Check if Edge Function URL is configured
  if (!ANALYZE_IMAGE_URL) {
    console.error("[analyzeClothingImage] Edge Function URL not configured");
    return {
      ok: false,
      error: {
        kind: "server_error",
        message: "Analysis service not configured.",
        debug: "SUPABASE_URL not set",
      },
    };
  }

  // Abort/timeout handling
  const controller = new AbortController();
  let didTimeout = false;
  
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  
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
  const logTelemetry = (
    result: ClothingAnalysisResult, 
    cacheHit: boolean, 
    cacheKeyPrefix?: string, 
    fallbackUsed?: boolean,
    styleSignalsFallbackReason?: 'none' | 'missing' | 'invalid' | 'truncated'
  ) => {
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
      isFashionItem: result.isFashionItem,
      isNonFashionFallbackUsed: fallbackUsed,
      descriptiveLabel: result.isFashionItem === false ? result.descriptiveLabel : undefined,
      // Style signals (combined analysis)
      inlineStyleSignalsPresent: !!result.styleSignals,
      styleSignalsFallbackReason: styleSignalsFallbackReason ?? (result.styleSignals ? 'none' : 'missing'),
    });
    logAnalysisTelemetry(event);
    updateLocalStats({ ...event, timestamp: new Date().toISOString() });
  };

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
    
    if (__DEV__) {
      console.log("[AnalysisTelemetry] Analysis failed:", error.kind, error.debug);
    }
  };

  try {
    // Optimize image
    console.log("[Perf] Starting image optimization...");
    const optimizeStart = Date.now();
    const optimizedUri = await optimizeImageForApi(imageUri);
    console.log(`[Perf] Image optimization: ${Date.now() - optimizeStart}ms`);

    // Convert to base64
    console.log("[Perf] Converting to base64...");
    const base64Start = Date.now();
    const dataUrl = await getImageDataUrl(optimizedUri);
    console.log(`[Perf] Base64 conversion: ${Date.now() - base64Start}ms, size: ${Math.round(dataUrl.length / 1024)}KB`);

    // Check local cache first (skip if requested - e.g., for wardrobe adds with new photos)
    let imageSha256 = '';
    let cacheKey = '';
    
    if (!skipCache) {
      const hashStart = Date.now();
      try {
        imageSha256 = await sha256Hex(dataUrl);
        cacheKey = generateCacheKey(imageSha256);
        console.log(`[Perf] Hash computation: ${Date.now() - hashStart}ms, hash: ${imageSha256.slice(0, 8)}`);
      } catch (hashError) {
        console.log(`[Perf] Hash failed, skipping cache:`, hashError);
      }

      // Try local cache
      if (cacheKey) {
        const cacheStart = Date.now();
        const cachedResult = await getCachedAnalysis(cacheKey);
        if (cachedResult) {
          logCacheTelemetry(true, imageSha256, telemetryCtx?.scan_session_id);
          console.log(`[Perf] Cache HIT in ${Date.now() - cacheStart}ms, total: ${Date.now() - startTime}ms`);
          
          // CRITICAL: Still consume quota on cache hits!
          // Without this, users can scan unlimited times if images are cached.
          console.log(`[Perf] Cache hit - consuming quota via RPC...`);
          const quotaStart = Date.now();
          const quotaFunction = operationType === 'wardrobe_add' 
            ? 'consume_wardrobe_add_credit' 
            : 'consume_scan_credit';
          
          const { data: quotaData, error: quotaError } = await supabase.rpc(
            quotaFunction,
            { p_idempotency_key: idempotencyKey }
          );
          
          console.log(`[Perf] Quota RPC: ${Date.now() - quotaStart}ms`);
          
          if (quotaError) {
            console.error('[analyzeClothingImage] Quota check failed on cache hit:', quotaError);
            clearTimeout(timeoutId);
            const error: AnalyzeError = {
              kind: "api_error",
              message: "Failed to check quota.",
              debug: quotaError.message,
            };
            logFailureTelemetry(error);
            return { ok: false, error };
          }
          
          const quotaResult = quotaData?.[0];
          console.log(`[analyzeClothingImage] Cache hit quota result:`, quotaResult);
          
          if (!quotaResult?.allowed) {
            clearTimeout(timeoutId);
            const reason = quotaResult?.reason || "quota_exceeded";
            const isMonthly = reason === "monthly_quota_exceeded";
            const quotaType = operationType === 'wardrobe_add' ? 'wardrobe add' : 'scan';
            const error: AnalyzeError = {
              kind: "quota_exceeded",
              message: isMonthly 
                ? `You've reached your monthly ${quotaType} limit. Resets next month.`
                : `You've used all your free ${quotaType}s. Upgrade to Pro for more.`,
            };
            logFailureTelemetry(error);
            return { 
              ok: false, 
              error,
              quotaInfo: {
                monthlyUsed: quotaResult?.monthly_used ?? 0,
                monthlyLimit: quotaResult?.monthly_limit ?? 0,
                monthlyRemaining: quotaResult?.monthly_remaining ?? 0,
              },
            };
          }
          
          // For cache hits, report style signals based on what's in the cached result
          const cacheStyleSignalsFallbackReason = cachedResult.styleSignals ? 'none' : 'missing';
          logTelemetry(cachedResult, true, imageSha256.slice(0, 8), false, cacheStyleSignalsFallbackReason);
          clearTimeout(timeoutId);
          return { 
            ok: true, 
            data: cachedResult, 
            cacheHit: true,
            quotaInfo: {
              monthlyUsed: quotaResult?.monthly_used ?? 0,
              monthlyLimit: quotaResult?.monthly_limit ?? 0,
              monthlyRemaining: quotaResult?.monthly_remaining ?? 0,
            },
          };
        }
        logCacheTelemetry(false, imageSha256, telemetryCtx?.scan_session_id);
        console.log(`[Perf] Cache miss (lookup: ${Date.now() - cacheStart}ms)`);
      }
    } else {
      console.log(`[Perf] Cache lookup skipped (skipCache=true)`);
    }

    // Get auth token for Edge Function
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      clearTimeout(timeoutId);
      const error: AnalyzeError = {
        kind: "unauthorized",
        message: "Please sign in to scan items.",
        debug: "No active session",
      };
      logFailureTelemetry(error);
      return { ok: false, error };
    }

    // Call Edge Function
    console.log(`[Perf] Calling analyze-image Edge Function (${operationType})...`);
    const apiStart = Date.now();
    
    const response = await fetch(ANALYZE_IMAGE_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        imageDataUrl: dataUrl,
        idempotencyKey,
        operationType,
      }),
      signal: controller.signal,
    });

    const apiDuration = Date.now() - apiStart;
    console.log(`[Perf] Edge Function response: ${apiDuration}ms, status: ${response.status}`);

    const responseData = await response.json();

    // Handle quota exceeded
    if (responseData.error?.kind === "quota_exceeded") {
      clearTimeout(timeoutId);
      const error: AnalyzeError = {
        kind: "quota_exceeded",
        message: responseData.error.message || "You've reached your scan limit.",
        httpStatus: response.status,
      };
      logFailureTelemetry(error);
      return { ok: false, error, quotaInfo: responseData.quotaInfo };
    }

    // Handle other errors
    if (!responseData.ok || !response.ok) {
      clearTimeout(timeoutId);
      const error: AnalyzeError = {
        kind: (responseData.error?.kind as AnalyzeErrorKind) || "api_error",
        message: responseData.error?.message || "Analysis failed.",
        httpStatus: response.status,
        retryAfterSeconds: responseData.error?.retryAfterSeconds,
        debug: JSON.stringify(responseData.error),
      };
      logFailureTelemetry(error);
      return { ok: false, error, quotaInfo: responseData.quotaInfo };
    }

    // Parse and validate the analysis
    const analysis = responseData.data;
    const { analysis: validatedAnalysis, nonFashionFallbackUsed, styleSignalsFallbackReason } = validateAnalysis(analysis);

    // Cache the result locally
    if (cacheKey) {
      setCachedAnalysis({
        analysisKey: cacheKey,
        imageSha256,
        model: ANALYSIS_MODEL,
        promptVersion: PROMPT_VERSION,
        analysis: validatedAnalysis,
      }).catch((err) => {
        console.log("Failed to cache analysis:", err);
      });
    }

    logTelemetry(validatedAnalysis, false, imageSha256?.slice(0, 8), nonFashionFallbackUsed, styleSignalsFallbackReason);

    const totalDuration = Date.now() - startTime;
    console.log(`[Perf] ✅ Analysis complete: ${totalDuration}ms total (category: ${validatedAnalysis.category})`);

    clearTimeout(timeoutId);
    return { 
      ok: true, 
      data: validatedAnalysis, 
      cacheHit: false,
      quotaInfo: responseData.quotaInfo,
    };

  } catch (error) {
    clearTimeout(timeoutId);
    
    // Deterministic abort handling
    if (controller.signal.aborted) {
      console.log("[Analysis] Aborted:", didTimeout ? "timeout" : "user cancelled");
      const abortError: AnalyzeError = didTimeout
        ? { kind: "timeout", message: "It's taking longer than usual. Try again in a moment." }
        : { kind: "cancelled", message: "Cancelled.", debug: "Aborted by navigation/unmount" };
      
      if (didTimeout) {
        logFailureTelemetry(abortError);
      }
      
      return { ok: false, error: abortError };
    }
    
    console.log("[Analysis] Failed:", error);
    const classifiedError = classifyAnalyzeError(error);
    logFailureTelemetry(classifiedError);
    
    return { ok: false, error: classifiedError };
  }
}

interface ValidatedAnalysisResult {
  analysis: ClothingAnalysisResult;
  nonFashionFallbackUsed: boolean;
  styleSignalsFallbackReason: 'none' | 'missing' | 'invalid' | 'truncated';
}

function validateAnalysis(analysis: ClothingAnalysisResult): ValidatedAnalysisResult {
  const validFashionCategories: Category[] = ["tops", "bottoms", "dresses", "skirts", "outerwear", "shoes", "bags", "accessories"];
  const validStyles: StyleVibe[] = ["casual", "minimal", "office", "street", "feminine", "sporty"];

  const descriptiveLabel = analysis.descriptiveLabel || "";

  const aiProvidedIsFashion = typeof analysis.isFashionItem === "boolean";
  const isFashionItem = aiProvidedIsFashion
    ? analysis.isFashionItem
    : fallbackIsFashionItem(descriptiveLabel);
  
  const nonFashionFallbackUsed = !aiProvidedIsFashion && isFashionItem === false;

  let category: Category;
  if (!isFashionItem) {
    category = "unknown";
  } else if (analysis.category === "unknown") {
    category = "unknown";
  } else if (validFashionCategories.includes(analysis.category as Category)) {
    category = analysis.category as Category;
  } else {
    category = "unknown";
  }

  const finalLabel = descriptiveLabel || getDefaultLabel(category);

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
      styleSignalsFallbackReason: 'missing' as const, // Non-fashion items don't have style signals
    };
  }

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

  const rawStyleTags: StyleVibe[] = [];
  if (Array.isArray(analysis.styleTags)) {
    for (const tag of analysis.styleTags) {
      if (validStyles.includes(tag as StyleVibe)) {
        rawStyleTags.push(tag as StyleVibe);
      }
    }
  }

  const { styleTags, styleFamily, fallbackUsed } = normalizeStyleTags(rawStyleTags, styleNotes);

  if (fallbackUsed) {
    console.log('[StyleInference] Fallback used:', {
      originalTags: analysis.styleTags,
      inferredTags: styleTags,
      inferredFamily: styleFamily,
      styleNotes,
    });
  }

  const itemSignals = validateItemSignals(analysis.itemSignals, category);
  const contextSufficient = analysis.contextSufficient !== false;
  const confidenceSignals = validateConfidenceSignals(
    analysis.confidenceSignals,
    colors,
    styleNotes,
    fallbackUsed ? styleFamily : undefined
  );

  // Validate and normalize style signals (if present)
  const styleSignalsResult = validateStyleSignalsWithReason(analysis.styleSignals);

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
      styleSignals: styleSignalsResult.signals,
    },
    nonFashionFallbackUsed: false,
    styleSignalsFallbackReason: styleSignalsResult.fallbackReason,
  };
}

function validateItemSignals(
  signals: Partial<ItemSignalsResult> | undefined,
  category: Category
): ItemSignalsResult {
  const validStylingRisk: StylingRisk[] = ["low", "medium", "high"];

  const defaultRisk: StylingRisk =
    category === "accessories" || category === "bags" ? "low" :
    category === "shoes" ? "low" :
    "medium";

  if (!signals) {
    return getDefaultSignalsForCategory(category);
  }

  const stylingRisk = validStylingRisk.includes(signals.stylingRisk as StylingRisk)
    ? signals.stylingRisk as StylingRisk
    : defaultRisk;

  return {
    ...signals,
    stylingRisk,
  };
}

// ============================================
// STYLE SIGNALS VALIDATION
// ============================================

const VALID_ARCHETYPES = [
  'minimalist', 'classic', 'workwear', 'romantic', 'boho', 'western',
  'street', 'sporty', 'edgy', 'glam', 'preppy', 'outdoor_utility', 'unknown', 'none'
];

const VALID_FORMALITY_BANDS = [
  'athleisure', 'casual', 'smart_casual', 'office', 'formal', 'evening', 'unknown'
];

const VALID_STATEMENT_LEVELS = ['low', 'medium', 'high', 'unknown'];
const VALID_SEASON_WEIGHTS = ['light', 'mid', 'heavy', 'unknown'];
const VALID_PATTERN_LEVELS = ['solid', 'subtle', 'bold', 'unknown'];
const VALID_MATERIAL_FAMILIES = [
  'denim', 'knit', 'leather', 'silk_satin', 'cotton', 'wool', 'synthetic_tech', 'other', 'unknown'
];
const VALID_PALETTE_COLORS = [
  'black', 'white', 'cream', 'gray', 'brown', 'tan', 'beige',
  'navy', 'denim_blue', 'blue', 'red', 'pink', 'green', 'olive',
  'yellow', 'orange', 'purple', 'metallic', 'multicolor', 'unknown'
];

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeColors(colors: unknown): string[] {
  if (!Array.isArray(colors)) return ['unknown'];
  const valid = colors
    .filter((c): c is string => typeof c === 'string' && VALID_PALETTE_COLORS.includes(c))
    .slice(0, 4);
  return valid.length > 0 ? valid : ['unknown'];
}

/**
 * Result of style signals validation including reason for failure
 */
interface StyleSignalsValidationResult {
  signals: StyleSignalsV1 | undefined;
  fallbackReason: 'none' | 'missing' | 'invalid' | 'truncated';
}

/**
 * Validate and normalize style signals from the combined analysis response.
 * Returns undefined if signals are missing, invalid, or truncated.
 * 
 * Truncation detection: If we have a partial structure (e.g., aesthetic exists
 * but material is missing), this indicates the JSON was truncated due to token limit.
 */
function validateStyleSignalsWithReason(raw: unknown): StyleSignalsValidationResult {
  if (!raw || typeof raw !== 'object') {
    return { signals: undefined, fallbackReason: 'missing' };
  }

  const signals = raw as Partial<StyleSignalsV1>;

  // Check if we have the basic structure
  if (!signals.aesthetic || !signals.formality || !signals.statement) {
    // Check if it looks like truncated JSON (has some fields but not all required ones)
    const hasAnyField = signals.aesthetic || signals.formality || signals.statement || 
                        signals.season || signals.palette || signals.pattern || signals.material;
    return { 
      signals: undefined, 
      fallbackReason: hasAnyField ? 'truncated' : 'missing' 
    };
  }

  // Check for truncation: all main sections should be present for a complete response
  const requiredSections = ['aesthetic', 'formality', 'statement', 'season', 'palette', 'pattern', 'material'];
  const missingSections = requiredSections.filter(section => !(signals as Record<string, unknown>)[section]);
  
  if (missingSections.length > 0) {
    if (__DEV__) {
      console.log('[StyleSignals] Truncated response - missing sections:', missingSections);
    }
    return { signals: undefined, fallbackReason: 'truncated' };
  }

  const normalized: StyleSignalsV1 = {
    version: 1,
    aesthetic: {
      primary: VALID_ARCHETYPES.includes(signals.aesthetic?.primary ?? '') 
        ? signals.aesthetic.primary : 'unknown',
      primary_confidence: clampConfidence(signals.aesthetic?.primary_confidence),
      secondary: VALID_ARCHETYPES.includes(signals.aesthetic?.secondary ?? '')
        ? signals.aesthetic.secondary : 'none',
      secondary_confidence: clampConfidence(signals.aesthetic?.secondary_confidence),
    },
    formality: {
      band: VALID_FORMALITY_BANDS.includes(signals.formality?.band ?? '')
        ? signals.formality.band : 'unknown',
      confidence: clampConfidence(signals.formality?.confidence),
    },
    statement: {
      level: VALID_STATEMENT_LEVELS.includes(signals.statement?.level ?? '')
        ? signals.statement.level : 'unknown',
      confidence: clampConfidence(signals.statement?.confidence),
    },
    season: {
      heaviness: VALID_SEASON_WEIGHTS.includes(signals.season?.heaviness ?? '')
        ? signals.season.heaviness : 'unknown',
      confidence: clampConfidence(signals.season?.confidence),
    },
    palette: {
      colors: normalizeColors(signals.palette?.colors),
      confidence: clampConfidence(signals.palette?.confidence),
    },
    pattern: {
      level: VALID_PATTERN_LEVELS.includes(signals.pattern?.level ?? '')
        ? signals.pattern.level : 'unknown',
      confidence: clampConfidence(signals.pattern?.confidence),
    },
    material: {
      family: VALID_MATERIAL_FAMILIES.includes(signals.material?.family ?? '')
        ? signals.material.family : 'unknown',
      confidence: clampConfidence(signals.material?.confidence),
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

  return { signals: normalized, fallbackReason: 'none' };
}

/**
 * Wrapper for backward compatibility - returns just the signals or undefined
 */
function validateStyleSignals(raw: unknown): StyleSignalsV1 | undefined {
  return validateStyleSignalsWithReason(raw).signals;
}

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

  const defaultColorProfile = inferColorProfileFromHex(colors);

  if (!signals) {
    return {
      color_profile: defaultColorProfile,
      style_family: inferredStyleFamily ?? 'unknown',
      formality_level: 2,
      texture_type: 'unknown',
    };
  }

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

  let styleFamily: StyleFamily;
  if (validStyleFamilies.includes(signals.style_family as StyleFamily) && signals.style_family !== 'unknown') {
    styleFamily = signals.style_family as StyleFamily;
  } else if (inferredStyleFamily && inferredStyleFamily !== 'unknown') {
    styleFamily = inferredStyleFamily;
  } else {
    styleFamily = inferStyleFamilyFromNotes(styleNotes);
  }

  const formalityLevel = validFormalityLevels.includes(signals.formality_level as FormalityLevel)
    ? signals.formality_level as FormalityLevel
    : 2;

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

function inferColorProfileFromHex(colors: ColorInfo[]): ConfidenceSignals['color_profile'] {
  if (!colors || colors.length === 0) {
    return { is_neutral: true, saturation: 'med', value: 'med' };
  }

  const hex = colors[0].hex;
  const name = colors[0].name.toLowerCase();

  const neutralNames = ['black', 'white', 'gray', 'grey', 'beige', 'tan', 'cream', 'charcoal', 'ivory', 'silver'];
  const isNeutralByName = neutralNames.some(n => name.includes(n));

  let r = 0, g = 0, b = 0;
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length === 6) {
    r = parseInt(cleanHex.slice(0, 2), 16) / 255;
    g = parseInt(cleanHex.slice(2, 4), 16) / 255;
    b = parseInt(cleanHex.slice(4, 6), 16) / 255;
  }

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

  const isNeutral = isNeutralByName || s < 0.15;
  const satLevel: 'low' | 'med' | 'high' = s < 0.33 ? 'low' : s < 0.66 ? 'med' : 'high';
  const valLevel: 'low' | 'med' | 'high' = v < 0.33 ? 'low' : v < 0.66 ? 'med' : 'high';

  return {
    is_neutral: isNeutral,
    dominant_hue: isNeutral ? undefined : Math.round(h),
    saturation: satLevel,
    value: valLevel,
  };
}

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
