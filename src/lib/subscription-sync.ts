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
 */
export async function isProFromDb(userId: string): Promise<boolean> {
  const subscription = await getSubscriptionFromDb(userId);
  return subscription?.is_pro ?? false;
}

