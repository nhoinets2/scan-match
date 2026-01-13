/**
 * Subscription Sync - Syncs RevenueCat subscription status to Supabase
 *
 * This module provides functions to:
 * - Sync subscription status from RevenueCat to database
 * - Check subscription status from database
 * - Handle subscription changes
 */

import { supabase } from "./supabase";
import { getCustomerInfo, isRevenueCatEnabled } from "./revenuecatClient";

export interface UserSubscription {
  id: string;
  user_id: string;
  is_pro: boolean;
  subscription_type: "monthly" | "annual" | null;
  revenuecat_customer_id: string | null;
  expires_at: string | null;
  will_renew: boolean;
  show_winback_offer: boolean;
  winback_offer_shown_at: string | null;
  winback_offer_accepted: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Get subscription status from database
 */
export async function getSubscriptionFromDb(
  userId: string
): Promise<UserSubscription | null> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) {
    // PGRST116 = no rows found, which is expected for new users
    if (error.code !== "PGRST116") {
      console.log("[Subscription] Error fetching from DB:", error.message);
    }
    return null;
  }

  return data as UserSubscription;
}

/**
 * Sync subscription status from RevenueCat to database
 * Call this after successful purchases or on app launch
 */
export async function syncSubscriptionToDb(userId: string): Promise<boolean> {
  if (!isRevenueCatEnabled()) {
    console.log("[Subscription] RevenueCat not enabled, skipping sync");
    return false;
  }

  try {
    const customerInfoResult = await getCustomerInfo();

    if (!customerInfoResult.ok) {
      console.log("[Subscription] Failed to get customer info:", customerInfoResult.reason);
      return false;
    }

    const customerInfo = customerInfoResult.data;
    const activeEntitlements = customerInfo.entitlements.active;
    const proEntitlement = activeEntitlements?.["pro"];

    // Determine subscription details
    const isPro = !!proEntitlement;
    const expiresAt = proEntitlement?.expirationDate || null;
    const willRenew = proEntitlement?.willRenew ?? true;
    
    // Try to determine subscription type from product identifier
    let subscriptionType: "monthly" | "annual" | null = null;
    if (proEntitlement?.productIdentifier) {
      const productId = proEntitlement.productIdentifier.toLowerCase();
      if (productId.includes("annual") || productId.includes("yearly")) {
        subscriptionType = "annual";
      } else if (productId.includes("monthly")) {
        subscriptionType = "monthly";
      }
    }

    // Upsert subscription record
    const { error } = await supabase
      .from("user_subscriptions")
      .upsert(
        {
          user_id: userId,
          is_pro: isPro,
          subscription_type: subscriptionType,
          revenuecat_customer_id: customerInfo.originalAppUserId,
          expires_at: expiresAt,
          will_renew: willRenew,
          // Note: show_winback_offer is managed by webhook
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) {
      console.log("[Subscription] Error syncing to DB:", error.message);
      return false;
    }

    console.log("[Subscription] Synced to DB - isPro:", isPro, "type:", subscriptionType);
    return true;
  } catch (error) {
    console.log("[Subscription] Sync error:", error);
    return false;
  }
}

/**
 * Update subscription status in database (manual override)
 * Useful for admin granting Pro access
 */
export async function updateSubscriptionInDb(
  userId: string,
  isPro: boolean,
  subscriptionType?: "monthly" | "annual" | null
): Promise<boolean> {
  const { error } = await supabase
    .from("user_subscriptions")
    .upsert(
      {
        user_id: userId,
        is_pro: isPro,
        subscription_type: subscriptionType || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.log("[Subscription] Error updating DB:", error.message);
    return false;
  }

  return true;
}

/**
 * Check if user is Pro from database
 * Falls back to false if no record exists
 * 
 * Validates expires_at to ensure subscription hasn't expired
 * (protects against stale data when used as fallback)
 */
export async function isProFromDb(userId: string): Promise<boolean> {
  const subscription = await getSubscriptionFromDb(userId);
  
  if (!subscription?.is_pro) {
    return false;
  }

  // If no expiration date, trust is_pro flag (could be manual override/lifetime)
  if (!subscription.expires_at) {
    return true;
  }

  // Check if subscription has expired
  const expiresAt = new Date(subscription.expires_at);
  const now = new Date();
  
  if (expiresAt < now) {
    console.log("[Subscription] DB subscription expired:", subscription.expires_at);
    return false;
  }

  return true;
}

/**
 * Check if user should see winback offer
 * Returns true if user cancelled but still has active access
 */
export async function shouldShowWinbackOffer(userId: string): Promise<boolean> {
  const subscription = await getSubscriptionFromDb(userId);
  
  if (!subscription) {
    return false;
  }

  return subscription.show_winback_offer === true;
}

/**
 * Mark winback offer as shown
 * Call this when displaying the winback popup
 */
export async function markWinbackOfferShown(userId: string): Promise<boolean> {
  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      show_winback_offer: false, // Don't show again
      winback_offer_shown_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) {
    console.log("[Subscription] Error marking winback shown:", error.message);
    return false;
  }

  return true;
}

/**
 * Mark winback offer as accepted
 * Call this when user accepts the retention offer
 */
export async function markWinbackOfferAccepted(userId: string): Promise<boolean> {
  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      winback_offer_accepted: true,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) {
    console.log("[Subscription] Error marking winback accepted:", error.message);
    return false;
  }

  return true;
}

