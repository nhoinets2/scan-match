/**
 * PersonalizedSuggestionsCard Component
 *
 * Displays AI-generated personalized suggestions for matches.
 * - why_it_works: 2 bullets explaining the match quality
 * - to_elevate: 2 bullets suggesting items to consider adding
 *
 * CRITICAL BEHAVIORS:
 * - Mentions rendered SEPARATELY (not string replacement)
 * - Fail-open: if suggestions null, renders nothing
 * - Robust fallback for empty/messy item labels
 */

import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { colors, typography, spacing, borderRadius, cards } from "@/lib/design-tokens";
import type {
  PersonalizedSuggestions,
  SuggestionBullet,
  ElevateBullet,
  WardrobeItem,
  Category,
} from "@/lib/types";

export interface PersonalizedSuggestionsCardProps {
  suggestions: PersonalizedSuggestions | null;
  isLoading: boolean;
  wardrobeItemsById: Map<string, WardrobeItem>;
  isSoloMode?: boolean;
  mode?: "paired" | "solo" | "near";
}

/**
 * Get display label for a wardrobe item with robust fallbacks.
 * Priority: AI-detected label > Brand + category > Category alone
 * 
 * Handles edge cases:
 * - Empty/whitespace labels
 * - Too-long labels (> 40 chars)
 * - Labels with no letters (e.g., "!!!" or "123")
 */
function getItemDisplayLabel(item: WardrobeItem): string {
  // 1. Try detected label (AI-generated)
  const detected = item.detectedLabel?.trim();
  if (detected && detected.length >= 3 && detected.length <= 40) {
    // Basic sanity check: has at least 2 letters (not just symbols/numbers)
    if (/[a-zA-Z]{2,}/.test(detected)) {
      return detected.toLowerCase();
    }
  }

  // 2. Try brand + category (if user provided brand)
  if (item.brand?.trim()) {
    return `${item.brand.trim()} ${item.category}`.toLowerCase();
  }

  // 3. Fallback to category
  return item.category;
}

/**
 * Format item list for display: "navy blazer, white sneakers"
 */
function formatItemList(items: WardrobeItem[]): string {
  return items.map((item) => getItemDisplayLabel(item)).join(", ");
}

/**
 * Capitalize the first letter of a string.
 * Used to ensure bullet points start with uppercase.
 */
function capitalizeFirst(text: string): string {
  if (!text || text.length === 0) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Renders a why_it_works bullet with safe mention handling.
 * 
 * IMPORTANT: Don't do string replacement on bullet.text!
 * Instead, render text as-is, then append owned item references separately.
 * 
 * Example output:
 *   "The structured silhouette balances the relaxed fit nicely"
 *   (with your navy blazer, white sneakers)
 */
function WhyItWorksBullet({
  bullet,
  wardrobeItemsById,
}: {
  bullet: SuggestionBullet;
  wardrobeItemsById: Map<string, WardrobeItem>;
}) {
  // Resolve mentions to item labels
  const mentionedItems = bullet.mentions
    .map((id) => wardrobeItemsById.get(id))
    .filter(Boolean) as WardrobeItem[];

  return (
    <View style={{ flexDirection: "row", marginBottom: spacing.sm + 2 }}>
      {/* Bullet dot */}
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 2.5,
          backgroundColor: colors.accent.terracotta,
          marginTop: 7,
          marginRight: spacing.sm + 2,
          flexShrink: 0,
        }}
      />

      {/* Content */}
      <View style={{ flex: 1 }}>
        {/* Main text (model writes this without item names) */}
        <Text
          style={{
            ...typography.ui.bodyMedium,
            color: colors.text.primary,
          }}
        >
          {capitalizeFirst(bullet.text)}
        </Text>

        {/* Owned item references (rendered separately, not string-replaced) */}
        {mentionedItems.length > 0 && (
          <Text
            style={{
              ...typography.ui.caption,
              color: colors.text.secondary,
              marginTop: spacing.xs / 2,
            }}
          >
            (with your {formatItemList(mentionedItems)})
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * Renders a to_elevate bullet.
 * Branches on recommend.type:
 * - consider_adding: "Consider adding: {attributes} {category}" (paired/solo modes)
 * - styling_tip: Just the tip text (near mode)
 */
function ToElevateBullet({ bullet }: { bullet: ElevateBullet }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: spacing.sm + 2 }}>
      {/* Bullet dot */}
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 2.5,
          backgroundColor: colors.accent.terracotta,
          marginTop: 7,
          marginRight: spacing.sm + 2,
          flexShrink: 0,
        }}
      />

      {/* Content */}
      <View style={{ flex: 1 }}>
        {bullet.recommend.type === "consider_adding" ? (
          <>
            <Text
              style={{
                ...typography.ui.bodyMedium,
                color: colors.text.primary,
              }}
            >
              Consider adding: {bullet.recommend.attributes.length > 0 ? bullet.recommend.attributes.join(", ") + " " : ""}
              {bullet.recommend.category}
            </Text>
            <Text
              style={{
                ...typography.ui.caption,
                color: colors.text.secondary,
                marginTop: spacing.xs / 2,
              }}
            >
              {capitalizeFirst(bullet.text)}
            </Text>
          </>
        ) : (
          // styling_tip type - render tip directly as primary text
          <>
            <Text
              style={{
                ...typography.ui.bodyMedium,
                color: colors.text.primary,
              }}
            >
              {capitalizeFirst(bullet.recommend.tip)}
            </Text>
            {bullet.text && (
              <Text
                style={{
                  ...typography.ui.caption,
                  color: colors.text.secondary,
                  marginTop: spacing.xs / 2,
                }}
              >
                {capitalizeFirst(bullet.text)}
              </Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}

/**
 * Loading skeleton for suggestions card.
 * Minimal, non-intrusive loading state.
 */
function SuggestionsSkeleton() {
  return (
    <View
      style={{
        ...cards.standard,
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.md,
        alignItems: "center",
      }}
    >
      <ActivityIndicator size="small" color={colors.accent.terracotta} />
      <Text
        style={{
          ...typography.ui.caption,
          color: colors.text.secondary,
          marginTop: spacing.sm,
        }}
      >
        Personalizing...
      </Text>
    </View>
  );
}

/**
 * Main PersonalizedSuggestionsCard component.
 * 
 * Fail-open behavior: if suggestions null/error, renders nothing (no broken card).
 */
export function PersonalizedSuggestionsCard({
  suggestions,
  isLoading,
  wardrobeItemsById,
  isSoloMode = false,
  mode,
}: PersonalizedSuggestionsCardProps) {
  // Loading state (only show if actively loading)
  if (isLoading) {
    return <SuggestionsSkeleton />;
  }

  // Fail-open: show nothing if suggestions not available
  if (!suggestions) {
    return null;
  }

  // Derive effective mode (use mode prop if provided, otherwise fallback to isSoloMode)
  const effectiveMode = mode ?? (isSoloMode ? "solo" : "paired");

  // Section titles change based on mode
  const whyItWorksTitle =
    effectiveMode === "near"
      ? "Why it's close"
      : effectiveMode === "solo"
      ? "How to style it"
      : "Why it works";

  const toElevateTitle =
    effectiveMode === "near"
      ? "How to upgrade"
      : effectiveMode === "solo"
      ? "What to add first"
      : "To elevate";

  return (
    <View
      style={{
        ...cards.standard,
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.md,
      }}
    >
      {/* Why it works / How to style it section */}
      <Text
        style={{
          ...typography.ui.cardTitle,
          color: colors.text.primary,
          marginBottom: spacing.sm + 4,
        }}
      >
        {whyItWorksTitle}
      </Text>

      {suggestions.why_it_works.map((bullet, i) => (
        <WhyItWorksBullet
          key={i}
          bullet={bullet}
          wardrobeItemsById={wardrobeItemsById}
        />
      ))}

      {/* To elevate / What to add first section */}
      <Text
        style={{
          ...typography.ui.cardTitle,
          color: colors.text.primary,
          marginTop: spacing.md,
          marginBottom: spacing.sm + 4,
        }}
      >
        {toElevateTitle}
      </Text>

      {suggestions.to_elevate.map((bullet, i) => (
        <ToElevateBullet key={i} bullet={bullet} />
      ))}
    </View>
  );
}
