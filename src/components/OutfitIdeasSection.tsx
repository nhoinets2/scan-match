/**
 * Outfit Ideas Section
 *
 * Displays CE-driven outfit combos as a secondary "what to wear" layer.
 * Shows complete outfit combinations ranked by tier floor + score.
 * 
 * Layout: Fixed slot order (TOP → BOTTOM → SHOES or DRESS → SHOES)
 * with "Scanned" badge on anchor item and "Needs tweak" on MEDIUM items.
 */

import React, { useState, useRef } from "react";
import { View, Text, Pressable, ScrollView, Modal, Dimensions } from "react-native";
import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Plus, Check, Info } from "lucide-react-native";
import * as Haptics from "expo-haptics";

import type { WardrobeItem, Category } from "@/lib/types";
import type { AssembledCombo, OutfitSlot, SlotCandidate } from "@/lib/combo-assembler";
import { spacing, borderRadius, colors, cards, shadows, typography } from "@/lib/design-tokens";

// ============================================
// TYPES
// ============================================

interface OutfitIdeasSectionProps {
  /** CE-assembled combos */
  combos: AssembledCombo[];

  /** Whether combos can be formed */
  canFormCombos: boolean;

  /** Message about missing slots */
  missingMessage: string | null;

  /** Custom section title (defaults to "Outfits you can wear now") */
  sectionTitle?: string;

  /** Wardrobe items for displaying thumbnails */
  wardrobeItems: WardrobeItem[];

  /** Scanned item image URI */
  scannedItemImageUri?: string;

  /** Scanned item category (to determine which slot is the anchor) */
  scannedCategory?: Category;

  /** Callback when user taps "Add to wardrobe" for missing category */
  onAddToWardrobe?: () => void;

  /** Callback when user taps a combo to see details */
  onComboPress?: (combo: AssembledCombo) => void;

  /** Callback when thumbnail is pressed for full-size view */
  onThumbPress?: (imageUri: string) => void;

  /**
   * When true, only show core items (TOP/BOTTOM/SHOES or DRESS/SHOES).
   * Used for Wear now tab to hide outerwear from outfit cards.
   */
  coreOnly?: boolean;

  /**
   * When true, show "Needs tweak" badge on MEDIUM tier items.
   * Used for Worth trying tab to highlight weak links.
   */
  showMediumBadge?: boolean;

  /**
   * ID of currently selected combo (for Worth trying tab).
   * Adds subtle visual indicator to connect outfit → tips.
   */
  selectedComboId?: string | null;

  /**
   * When true, show info icon next to section title.
   * Used for Worth trying tab to explain "Needs tweak" badge.
   */
  showInfoIcon?: boolean;
}

// ============================================
// CONSTANTS
// ============================================

/** Map category to outfit slot */
const CATEGORY_TO_SLOT: Record<Category, OutfitSlot | null> = {
  tops: 'TOP',
  bottoms: 'BOTTOM',
  shoes: 'SHOES',
  outerwear: 'OUTERWEAR',
  dresses: 'DRESS',
  skirts: 'BOTTOM',
  bags: null,
  accessories: null,
};

/** Standard track slot order */
const STANDARD_SLOT_ORDER: OutfitSlot[] = ['TOP', 'BOTTOM', 'SHOES'];

/** Dress track slot order */
const DRESS_SLOT_ORDER: OutfitSlot[] = ['DRESS', 'SHOES'];

/** Tile size */
const TILE_SIZE = 80;

/** Gap between tiles */
const TILE_GAP = 10;

// ============================================
// TILE COMPONENT
// ============================================

interface OutfitTileProps {
  imageUri?: string;
  slot: OutfitSlot;
  isScanned: boolean;
  isMedium: boolean;
  showMediumBadge: boolean;
  onPress?: () => void;
}

function OutfitTile({
  imageUri,
  slot,
  isScanned,
  isMedium,
  showMediumBadge,
  onPress,
}: OutfitTileProps) {
  return (
    <View style={{ position: "relative" }}>
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          onPress?.();
        }}
        hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
        style={{
          width: TILE_SIZE,
          height: TILE_SIZE,
          borderRadius: borderRadius.image,
          overflow: "hidden",
          backgroundColor: colors.bg.tertiary,
          borderWidth: 1,
          borderColor: colors.border.hairline,
        }}
      >
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={{ 
              width: TILE_SIZE, 
              height: TILE_SIZE,
            }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontSize: 10,
                color: colors.text.tertiary,
                textAlign: "center",
              }}
            >
              {slot}
            </Text>
          </View>
        )}
      </Pressable>

      {/* "Scanned" badge - top-left, minimal */}
      {isScanned && (
        <View
          style={{
            position: "absolute",
            top: 4,
            left: 4,
            backgroundColor: "rgba(255,255,255,0.88)",
            paddingHorizontal: 5,
            paddingVertical: 2,
            borderRadius: borderRadius.pill,
          }}
        >
          <Text
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 9,
              color: colors.text.secondary,
            }}
          >
            Scanned
          </Text>
        </View>
      )}

      {/* "Needs tweak" badge - below tile to avoid covering garment details */}
      {showMediumBadge && isMedium && (
        <View
          style={{
            position: "absolute",
            bottom: -5,
            left: 0,
            right: 0,
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: colors.accent.brass, // Calmer amber
              paddingHorizontal: 5,
              paddingVertical: 2,
              borderRadius: borderRadius.pill,
            }}
          >
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 7,
                color: colors.text.primary,
                letterSpacing: 0.1,
              }}
              numberOfLines={1}
            >
              Needs tweak
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ============================================
// COMBO CARD COMPONENT
// ============================================

interface ComboCardProps {
  combo: AssembledCombo;
  wardrobeItems: WardrobeItem[];
  scannedItemImageUri?: string;
  scannedSlot: OutfitSlot | null;
  index: number;
  onPress?: () => void;
  onThumbPress?: (imageUri: string) => void;
  showMediumBadge?: boolean;
  /** Is this combo currently selected (Worth trying tab) */
  isSelected?: boolean;
}

function ComboCard({
  combo,
  wardrobeItems,
  scannedItemImageUri,
  scannedSlot,
  index,
  onPress,
  onThumbPress,
  showMediumBadge = false,
  isSelected = false,
}: ComboCardProps) {
  // Build slot → candidate map
  const slotMap = new Map<OutfitSlot, SlotCandidate>();
  for (const candidate of combo.candidates) {
    slotMap.set(candidate.slot, candidate);
  }

  // Determine track type (dress or standard)
  const isDressTrack = slotMap.has('DRESS') || scannedSlot === 'DRESS';
  const slotOrder = isDressTrack ? DRESS_SLOT_ORDER : STANDARD_SLOT_ORDER;

  // Build tiles data
  const tiles = slotOrder.map((slot) => {
    const candidate = slotMap.get(slot);
    const isScannedSlot = slot === scannedSlot;
    
    // Get image URI
    let imageUri: string | undefined;
    if (isScannedSlot && scannedItemImageUri) {
      imageUri = scannedItemImageUri;
    } else if (candidate) {
      const wardrobeItem = wardrobeItems.find((w) => w.id === candidate.itemId);
      imageUri = wardrobeItem?.imageUri;
    }

    return {
      slot,
      imageUri,
      isScanned: isScannedSlot,
      isMedium: candidate?.tier === 'MEDIUM',
      candidateId: candidate?.itemId,
    };
  });

  // Calculate card width based on tile count
  const cardWidth = tiles.length * TILE_SIZE + (tiles.length - 1) * TILE_GAP + 28; // 28 = horizontal padding

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={{
        // V3: cards.standard = border-first, no shadow
        backgroundColor: cards.standard.backgroundColor,
        borderWidth: isSelected ? 1.5 : cards.standard.borderWidth,
        borderColor: isSelected ? colors.accent.terracotta : cards.standard.borderColor,
        borderRadius: cards.standard.borderRadius,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginRight: 14,
        width: cardWidth,
      }}
    >
      {/* Selected indicator - small checkmark in top-right corner */}
      {isSelected && (
        <View
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 18,
            height: 18,
            borderRadius: borderRadius.pill,
            backgroundColor: colors.accent.terracotta,
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          <Check size={12} color={colors.text.inverse} strokeWidth={2.5} />
        </View>
      )}

      {/* Tiles row */}
      <View
        style={{
          flexDirection: "row",
          gap: TILE_GAP,
          justifyContent: "center",
        }}
      >
        {tiles.map(({ slot, imageUri, isScanned, isMedium }) => (
          <OutfitTile
            key={slot}
            imageUri={imageUri}
            slot={slot}
            isScanned={isScanned}
            isMedium={isMedium}
            showMediumBadge={showMediumBadge}
            onPress={() => {
              if (imageUri && onThumbPress) {
                onThumbPress(imageUri);
              }
            }}
          />
        ))}
      </View>

      {/* Reason text - only shown if exists */}
      {combo.reasons.length > 0 && (
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 11,
            color: colors.text.secondary,
            lineHeight: 14,
            textAlign: "center",
            marginTop: 8,
          }}
          numberOfLines={2}
        >
          {combo.reasons[0]}
        </Text>
      )}
    </Pressable>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function OutfitIdeasSection({
  combos,
  canFormCombos,
  missingMessage,
  sectionTitle = "Outfits you can wear now",
  wardrobeItems,
  scannedItemImageUri,
  scannedCategory,
  onAddToWardrobe,
  onComboPress,
  onThumbPress,
  coreOnly = false,
  showMediumBadge = false,
  selectedComboId = null,
  showInfoIcon = false,
}: OutfitIdeasSectionProps) {
  const [showPopover, setShowPopover] = useState(false);
  const infoIconRef = useRef<View>(null);
  const [iconLayout, setIconLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  // Determine scanned item's slot
  const scannedSlot = scannedCategory ? CATEGORY_TO_SLOT[scannedCategory] : null;

  // Early return: hide if no combos and no valid missing message
  const hasValidMissingMessage = missingMessage && typeof missingMessage === 'string' && missingMessage.trim().length > 0;
  const hasCombos = combos && Array.isArray(combos) && combos.length > 0;
  
  // Debug logging
  if (__DEV__) {
    console.log('[OutfitIdeasSection] Render check:', {
      hasCombos,
      hasValidMissingMessage,
      canFormCombos,
      combosLength: combos?.length ?? 0,
      scannedCategory,
      scannedSlot,
    });
  }
  
  // Hide if no combos and no valid missing message
  if (!hasValidMissingMessage && !hasCombos) {
    if (__DEV__) {
      console.log('[OutfitIdeasSection] Hiding: no combos and no valid missing message');
    }
    return null;
  }

  // Show missing slots CTA (when canFormCombos is false and we have a valid message)
  if (!canFormCombos && hasValidMissingMessage && !hasCombos) {
    return (
      <Animated.View
        entering={FadeInDown.delay(300)}
        style={{ marginBottom: spacing.lg, marginTop: 4 }}
      >
        <Text
          style={{
            fontFamily: "Inter_600SemiBold",
            fontSize: 14,
            color: colors.text.primary,
            marginBottom: 12,
            paddingHorizontal: 4,
          }}
        >
          Outfits you can wear now
        </Text>
        <View
          style={{
            // V3: cards.standard = border-first, no shadow
            backgroundColor: cards.standard.backgroundColor,
            borderWidth: cards.standard.borderWidth,
            borderColor: cards.standard.borderColor,
            borderRadius: cards.standard.borderRadius,
            padding: 16,
          }}
        >
          {missingMessage && missingMessage.trim().length > 0 && (
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 13,
                color: colors.text.secondary,
                marginBottom: 12,
                lineHeight: 18,
              }}
            >
              {missingMessage}
            </Text>
          )}
          {onAddToWardrobe && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onAddToWardrobe();
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                alignSelf: "flex-start",
                backgroundColor: colors.accent.terracottaLight,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: borderRadius.card,
              }}
            >
              <Plus
                size={14}
                color={colors.accent.terracotta}
                style={{ marginRight: 6 }}
              />
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 13,
                  color: colors.accent.terracotta,
                }}
              >
                Add to wardrobe
              </Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    );
  }

  // Show combos - but only if we actually have combos
  if (!hasCombos) {
    if (__DEV__) {
      console.log('[OutfitIdeasSection] Hiding: no combos available to show');
    }
    return null;
  }

  if (__DEV__) {
    console.log('[OutfitIdeasSection] Rendering with', combos.length, 'combos');
  }

  return (
    <Animated.View
      entering={FadeInDown.delay(300)}
      style={{ marginBottom: 14, marginTop: 4 }}
    >
      {/* Section header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 12,
          paddingHorizontal: 4,
          gap: 6,
        }}
      >
        <Text
          style={{
            ...typography.ui.sectionTitle,
            color: colors.text.primary,
          }}
        >
          {sectionTitle}
        </Text>
        {showInfoIcon && combos.length > 0 && (
          <View 
            ref={infoIconRef}
            onLayout={(e) => {
              infoIconRef.current?.measureInWindow((x, y, width, height) => {
                setIconLayout({ x, y, width, height });
              });
            }}
            style={{ position: "relative" }}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (!showPopover && !iconLayout) {
                  // Measure icon position before showing popover
                  infoIconRef.current?.measureInWindow((x, y, width, height) => {
                    setIconLayout({ x, y, width, height });
                    setShowPopover(true);
                  });
                } else {
                  setShowPopover(!showPopover);
                }
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Info
                size={16}
                color={colors.text.secondary}
                strokeWidth={2}
              />
            </Pressable>

            {/* Popover */}
            {showPopover && iconLayout && (
              <Modal
                visible={showPopover}
                transparent
                animationType="fade"
                onRequestClose={() => setShowPopover(false)}
              >
                <Pressable
                  style={{
                    flex: 1,
                    backgroundColor: "rgba(0,0,0,0.3)",
                  }}
                  onPress={() => {
                    setShowPopover(false);
                    setIconLayout(null);
                  }}
                >
                  <View
                    style={{
                      position: "absolute",
                      bottom: Dimensions.get("window").height - iconLayout.y + 6, // Position from bottom so tail touches top of icon
                      left: Math.max(24, Math.min(iconLayout.x + iconLayout.width / 2 - 100, Dimensions.get("window").width - 224)), // Center relative to icon, but keep within screen bounds
                      width: 200,
                    }}
                  >
                    <Pressable onPress={(e) => e.stopPropagation()}>
                      <View
                        style={{
                          // V3: cards.elevated = shadow-only popover
                          backgroundColor: cards.elevated.backgroundColor,
                          borderRadius: cards.elevated.borderRadius,
                          padding: 16,
                          ...shadows.lg,
                        }}
                      >
                        {/* Bubble tail pointing down to icon - calculate offset to align with icon center */}
                        {(() => {
                          const popoverLeft = Math.max(24, Math.min(iconLayout.x + iconLayout.width / 2 - 100, Dimensions.get("window").width - 224));
                          const iconCenterX = iconLayout.x + iconLayout.width / 2;
                          const tailLeft = Math.max(12, Math.min(iconCenterX - popoverLeft - 10, 180)); // Position tail to point at icon center, clamped within popover bounds
                          return (
                            <View
                              style={{
                                position: "absolute",
                                bottom: -10,
                                left: tailLeft,
                                width: 0,
                                height: 0,
                                borderLeftWidth: 10,
                                borderRightWidth: 10,
                                borderTopWidth: 10,
                                borderLeftColor: "transparent",
                                borderRightColor: "transparent",
                                borderTopColor: colors.bg.elevated,
                              }}
                            />
                          );
                        })()}
                        {/* Title */}
                        <Text
                          style={{
                            fontFamily: "Inter_600SemiBold",
                            fontSize: 15,
                            color: colors.text.primary,
                            marginBottom: 8,
                          }}
                        >
                          What does 'Needs tweak' mean?
                        </Text>
                        {/* Body */}
                        <Text
                          style={{
                            fontFamily: "Inter_400Regular",
                            fontSize: 13,
                            color: colors.text.secondary,
                            lineHeight: 18,
                          }}
                        >
                          This piece is a close match, but not a perfect fit with the outfit. Might need a small styling adjustment.
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                </Pressable>
              </Modal>
            )}
          </View>
        )}
      </View>

      {/* Horizontal scroll of combo cards */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToAlignment="start"
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingRight: 24,
          paddingBottom: 10, // Space for shadow + badges below tiles
        }}
        style={{ flexGrow: 0 }}
      >
        {combos.map((combo, index) => (
          <ComboCard
            key={combo.id}
            combo={combo}
            wardrobeItems={wardrobeItems}
            scannedItemImageUri={scannedItemImageUri}
            scannedSlot={scannedSlot}
            index={index}
            onPress={() => onComboPress?.(combo)}
            onThumbPress={onThumbPress}
            showMediumBadge={showMediumBadge}
            isSelected={selectedComboId === combo.id}
          />
        ))}
      </ScrollView>
    </Animated.View>
  );
}
