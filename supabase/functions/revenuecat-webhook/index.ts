/**
 * RevenueCat Webhook Handler
 * 
 * This Supabase Edge Function handles webhook events from RevenueCat.
 * It updates the user_subscriptions table when subscription events occur.
 * 
 * Deploy: supabase functions deploy revenuecat-webhook
 * 
 * RevenueCat Dashboard Setup:
 * 1. Go to RevenueCat Dashboard → Project Settings → Integrations → Webhooks
 * 2. Add webhook URL: https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook
 * 3. Copy the webhook authorization header value and set it as REVENUECAT_WEBHOOK_SECRET
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers for preflight requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// RevenueCat event types we care about
type RevenueCatEventType =
  | "INITIAL_PURCHASE"
  | "RENEWAL"
  | "CANCELLATION"
  | "UNCANCELLATION"
  | "NON_RENEWING_PURCHASE"
  | "SUBSCRIPTION_PAUSED"
  | "EXPIRATION"
  | "BILLING_ISSUE"
  | "PRODUCT_CHANGE"
  | "REFUND";

interface RevenueCatWebhookEvent {
  api_version: string;
  event: {
    type: RevenueCatEventType;
    app_user_id: string;
    original_app_user_id: string;
    product_id: string;
    entitlement_ids: string[];
    period_type: "NORMAL" | "TRIAL" | "INTRO";
    purchased_at_ms: number;
    expiration_at_ms: number | null;
    environment: "SANDBOX" | "PRODUCTION";
    store: "APP_STORE" | "PLAY_STORE" | "STRIPE" | "PROMOTIONAL";
    is_family_share: boolean;
    // Additional fields
    price_in_purchased_currency?: number;
    currency?: string;
    cancel_reason?: string;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify webhook authorization
    const authHeader = req.headers.get("Authorization");
    const webhookSecret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");

    if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
      console.error("Unauthorized webhook request");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse the webhook payload
    const payload: RevenueCatWebhookEvent = await req.json();
    const event = payload.event;

    console.log(`[RevenueCat Webhook] Received event: ${event.type} for user: ${event.app_user_id}`);

    // Initialize Supabase client with service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the Supabase user ID (RevenueCat app_user_id should be set to Supabase user.id)
    const userId = event.app_user_id;

    // Skip anonymous IDs (they start with $RCAnonymousID)
    if (userId.startsWith("$RCAnonymousID")) {
      console.log("[RevenueCat Webhook] Skipping anonymous user");
      return new Response(JSON.stringify({ success: true, skipped: "anonymous_user" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine subscription status based on event type
    let isPro = false;
    let subscriptionType: "monthly" | "annual" | null = null;
    let expiresAt: string | null = null;

    // Determine subscription type from product ID
    const productId = event.product_id.toLowerCase();
    if (productId.includes("annual") || productId.includes("yearly")) {
      subscriptionType = "annual";
    } else if (productId.includes("monthly")) {
      subscriptionType = "monthly";
    }

    // Set expiration date if available
    if (event.expiration_at_ms) {
      expiresAt = new Date(event.expiration_at_ms).toISOString();
    }

    // Process event type
    switch (event.type) {
      case "INITIAL_PURCHASE":
      case "RENEWAL":
      case "UNCANCELLATION":
      case "NON_RENEWING_PURCHASE":
        // Active subscription
        isPro = true;
        console.log(`[RevenueCat Webhook] Setting user ${userId} to Pro`);
        break;

      case "EXPIRATION":
      case "REFUND":
        // Subscription ended
        isPro = false;
        console.log(`[RevenueCat Webhook] Removing Pro from user ${userId}`);
        break;

      case "CANCELLATION":
        // User cancelled but still has access until expiration
        // Keep isPro based on expiration date
        isPro = expiresAt ? new Date(expiresAt) > new Date() : false;
        console.log(`[RevenueCat Webhook] User ${userId} cancelled, access until: ${expiresAt}`);
        break;

      case "BILLING_ISSUE":
        // Billing problem, keep current status but log it
        console.log(`[RevenueCat Webhook] Billing issue for user ${userId}`);
        // Return early without updating - let RevenueCat handle grace period
        return new Response(JSON.stringify({ success: true, action: "logged_billing_issue" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      case "SUBSCRIPTION_PAUSED":
        // Subscription paused (Android only)
        isPro = false;
        console.log(`[RevenueCat Webhook] Subscription paused for user ${userId}`);
        break;

      case "PRODUCT_CHANGE":
        // User changed plan (upgrade/downgrade)
        isPro = true;
        console.log(`[RevenueCat Webhook] Plan change for user ${userId} to ${event.product_id}`);
        break;

      default:
        console.log(`[RevenueCat Webhook] Unhandled event type: ${event.type}`);
        return new Response(JSON.stringify({ success: true, action: "ignored" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Upsert subscription record
    const { error } = await supabase
      .from("user_subscriptions")
      .upsert(
        {
          user_id: userId,
          is_pro: isPro,
          subscription_type: subscriptionType,
          revenuecat_customer_id: event.original_app_user_id,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("[RevenueCat Webhook] Database error:", error);
      return new Response(JSON.stringify({ error: "Database update failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[RevenueCat Webhook] Successfully updated user ${userId}: isPro=${isPro}`);

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        is_pro: isPro,
        event_type: event.type,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[RevenueCat Webhook] Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

