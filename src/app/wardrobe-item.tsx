import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOut } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  X,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
} from "lucide-react-native";

import { useWardrobe, useRemoveWardrobeItem, useUpdateWardrobeItem } from "@/lib/database";
import { colors, typography, spacing, components, borderRadius, cards, shadows, button } from "@/lib/design-tokens";
import { getTextStyle } from "@/lib/typography-helpers";
import {
  CATEGORIES,
  Category,
  StyleVibe,
  STYLE_VIBES,
  WardrobeItem,
  ColorInfo,
  COLOR_PALETTE,
} from "@/lib/types";
import { cn } from "@/lib/cn";
import { ButtonPrimary } from "@/components/ButtonPrimary";
import { ButtonSecondary } from "@/components/ButtonSecondary";
import { ButtonSecondaryOutline } from "@/components/ButtonSecondaryOutline";
import { ButtonTertiary } from "@/components/ButtonTertiary";
import { PhotoViewerModal } from "@/components/PhotoViewerModal";
import { capitalizeFirst, capitalizeItems } from "@/lib/text-utils";

// Get category label from category id
function getCategoryLabel(categoryId: string): string {
  const category = CATEGORIES.find((c) => c.id === categoryId);
  return category?.label || categoryId;
}

// Find hex color from color name (case-insensitive)
function findColorHexByName(name: string): string | null {
  const normalizedName = name.trim().toLowerCase();
  const found = COLOR_PALETTE.find(
    (c) => c.name.toLowerCase() === normalizedName
  );
  return found?.hex ?? null;
}

// Calculate if a color is light or dark for text contrast
function isLightColor(hex: string): boolean {
  // Remove # if present
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  // Calculate relative luminance (WCAG formula)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // If luminance is greater than 0.5, it's a light color
  return luminance > 0.5;
}

// Adjust color saturation to fit design (reduce saturation by ~15-20%)
function adjustColorSaturation(hex: string): string {
  // Remove # if present
  const cleanHex = hex.replace("#", "");
  let r = parseInt(cleanHex.substring(0, 2), 16);
  let g = parseInt(cleanHex.substring(2, 4), 16);
  let b = parseInt(cleanHex.substring(4, 6), 16);
  
  // Convert RGB to HSL
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  // Reduce saturation by 18% to fit design
  s = Math.max(0, Math.min(1, s * 0.82));
  
  // Convert HSL back to RGB
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  let p = 2 * l - q;
  
  r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
  g = Math.round(hue2rgb(p, q, h) * 255);
  b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
  
  return `#${[r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("")}`;
}

// Category picker for edit mode
function CategoryPicker({
  selected,
  onSelect,
}: {
  selected: Category;
  onSelect: (cat: Category) => void;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(100)} style={{ marginBottom: spacing.lg }}>
      <Text
        style={{
          ...typography.ui.sectionTitle,
          color: colors.text.primary,
          marginBottom: spacing.md,
        }}
      >
        Category
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat.id}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(cat.id);
            }}
            style={{
              paddingHorizontal: spacing.md + spacing.xs / 2,
              paddingVertical: spacing.sm + spacing.xs / 2,
              borderRadius: borderRadius.image,
              backgroundColor: selected === cat.id ? colors.accent.terracottaLight : "transparent",
              borderWidth: 0.5,
              borderColor: selected === cat.id ? colors.accent.terracottaLight : colors.border.subtle,
              marginRight: spacing.sm,
              marginBottom: spacing.sm,
            }}
          >
            <Text
              style={{
                ...typography.ui.label,
                color: selected === cat.id ? colors.text.primary : colors.text.secondary,
              }}
            >
              {cat.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

export default function WardrobeItemScreen() {
  const insets = useSafeAreaInsets();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const { data: wardrobe = [] } = useWardrobe();
  const updateWardrobeItemMutation = useUpdateWardrobeItem();
  const removeWardrobeItemMutation = useRemoveWardrobeItem();
  const scrollViewRef = useRef<ScrollView>(null);
  const detailsY = useRef<number>(0); // scroll target for optional details

  const item = useMemo(() => {
    return wardrobe.find((w: WardrobeItem) => w.id === itemId) ?? null;
  }, [itemId, wardrobe]);

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editCategory, setEditCategory] = useState<Category>(
    item?.category ?? "tops"
  );
  const [editStyleTags, setEditStyleTags] = useState<StyleVibe[]>(
    item?.userStyleTags ?? []
  );
  const [editBrand, setEditBrand] = useState(item?.brand ?? "");
  const [isEditingColors, setIsEditingColors] = useState(false);
  const [colorInputText, setColorInputText] = useState(""); // Raw text input for colors
  const [editedColors, setEditedColors] = useState<ColorInfo[]>(item?.colors ?? []);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

  // Sync colors when item changes
  useEffect(() => {
    if (item?.colors) {
      setEditedColors(item.colors);
    }
  }, [item?.colors]);

  // Modal states
  const [photoViewerUri, setPhotoViewerUri] = useState<string | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  // Track if changes were made
  const hasChanges = useMemo(() => {
    if (!item) return false;
    const colorsChanged = JSON.stringify(editedColors) !== JSON.stringify(item.colors ?? []);
    return (
      editCategory !== item.category ||
      JSON.stringify(editStyleTags) !== JSON.stringify(item.userStyleTags ?? []) ||
      editBrand !== (item.brand ?? "") ||
      colorsChanged
    );
  }, [item, editCategory, editStyleTags, editBrand, editedColors]);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isEditMode && hasChanges) {
      Alert.alert(
        "Discard changes?",
        "You have unsaved changes.",
        [
          { text: "Keep editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => router.back(),
          },
        ]
      );
    } else {
      router.back();
    }
  };

  const handleEnterEditMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (item) {
      setEditCategory(item.category);
      setEditStyleTags(item.userStyleTags ?? []);
      setEditBrand(item.brand ?? "");
      setEditedColors(item.colors ?? []);
      setColorInputText(item.colors?.map(c => c.name).join(", ") ?? "");
      setIsEditMode(true);
    }
  };

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (hasChanges) {
      Alert.alert(
        "Discard changes?",
        "You have unsaved changes.",
        [
          { text: "Keep editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              setIsEditMode(false);
              setIsDetailsExpanded(false);
            },
          },
        ]
      );
    } else {
      setIsEditMode(false);
      setIsDetailsExpanded(false);
    }
  };

  const handleSave = () => {
    if (!item) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateWardrobeItemMutation.mutate({
      id: item.id,
      updates: {
        category: editCategory,
        userStyleTags: editStyleTags.length > 0 ? editStyleTags : undefined,
        brand: editBrand || undefined,
        colors: editedColors.length > 0 ? editedColors : undefined,
      },
    });
    setIsEditMode(false);
    setIsDetailsExpanded(false);
  };

  const toggleStyleTag = (tag: StyleVibe) => {
    setEditStyleTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Show delete confirmation modal
  const handleDeleteRequest = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowDeleteConfirmation(true);
  };

  // Confirm delete action
  const handleConfirmDelete = () => {
    if (!item) return;
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    removeWardrobeItemMutation.mutate({ id: item.id, imageUri: item.imageUri });
    setShowDeleteConfirmation(false);
    
    // Navigate back to wardrobe list
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push("/(tabs)/wardrobe");
    }
  };

  // Cancel delete action
  const handleCancelDelete = () => {
    setShowDeleteConfirmation(false);
  };


  const handleStartEditColors = () => {
    console.log("[WardrobeItem] handleStartEditColors called");
    // Initialize text input with existing color names joined by comma
    const text = editedColors.length > 0
      ? editedColors.map(c => c.name).join(", ")
      : "";
    setColorInputText(text);
    setIsEditingColors(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveColors = () => {
    if (!isEditingColors) return; // Guard against multiple calls

    // First exit edit mode
    setIsEditingColors(false);

    // Split by comma and filter out empty names
    const validNames = colorInputText
      .split(",")
      .map((name: string) => name.trim())
      .filter((name: string) => name.length > 0);

    if (validNames.length === 0) {
      // Clear colors if no valid names
      setEditedColors([]);
      return;
    }

    // Create new color objects with hex lookup
    const newColors: ColorInfo[] = validNames.map((name: string) => {
      const hex = findColorHexByName(name);
      
      // If found in palette, use that
      if (hex) {
        return { name, hex };
      }
      
      // If same color name as original (from item), preserve its hex
      const fromItem = item?.colors?.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (fromItem) {
        return { name, hex: fromItem.hex };
      }
      
      // For new/unknown colors, default to grey
      return { name, hex: "#808080" };
    });

    setEditedColors(newColors);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary, alignItems: "center", justifyContent: "center" }}>
        <Text
          style={getTextStyle("body", colors.text.secondary)}
        >
          Item not found
        </Text>
        <ButtonTertiary
          label="Go Back"
          onPress={handleClose}
          style={{ marginTop: spacing.md }}
        />
      </View>
    );
  }

  const categoryLabel = getCategoryLabel(item.category);
  const displayStyleTags = isEditMode ? editStyleTags : (item.userStyleTags ?? []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop: insets.top + spacing.md,
            paddingBottom: spacing.md,
            backgroundColor: colors.bg.primary,
          }}
        >
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Pressable
                onPress={handleClose}
                style={{
                  width: spacing.xxl,
                  height: spacing.xxl,
                  borderRadius: borderRadius.pill,
                  backgroundColor: "rgba(255,255,255,0.1)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={20} color={colors.text.primary} strokeWidth={1.5} />
              </Pressable>
              <View style={{ alignItems: "center", flex: 1, marginHorizontal: spacing.md }}>
                <Text
                  style={{
                    ...typography.display.screenTitle,
                    color: colors.text.primary,
                  }}
                  numberOfLines={1}
                >
                  {isEditMode 
                    ? "Edit details" 
                    : item?.detectedLabel 
                      ? capitalizeFirst(item.detectedLabel)
                      : "Wardrobe item"}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handleDeleteRequest();
                }}
                style={{
                  width: spacing.xxl,
                  height: spacing.xxl,
                  borderRadius: borderRadius.pill,
                  backgroundColor: "rgba(255,255,255,0.1)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Trash2 size={20} color={colors.text.primary} strokeWidth={1.5} />
              </Pressable>
            </View>
          </Animated.View>
          {/* Separator line */}
          <View style={{ height: 1, backgroundColor: colors.border.hairline }} />
        </View>

        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + 100,
            paddingHorizontal: spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {/* Item Summary Card */}
          <Animated.View
            entering={FadeInDown.delay(150)}
            style={{
              marginBottom: spacing.lg,
              // V3: cards.standard = border-first, no shadow
              backgroundColor: cards.standard.backgroundColor,
              borderWidth: cards.standard.borderWidth,
              borderColor: cards.standard.borderColor,
              borderRadius: cards.standard.borderRadius,
              overflow: "hidden",
            }}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setIsSummaryExpanded(!isSummaryExpanded);
              }}
              accessibilityLabel={isSummaryExpanded ? "Collapse item details" : "Expand item details"}
            >
              <View
                style={{
                  padding: spacing.md,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                {/* Thumbnail - tappable to open photo viewer */}
                {item.imageUri && (
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setPhotoViewerUri(item.imageUri);
                    }}
                  >
                    <Image
                      source={{ uri: item.imageUri }}
                      style={{ width: spacing.xxl + spacing.md - 4, height: spacing.xxl + spacing.md - 4, borderRadius: borderRadius.image }}
                      contentFit="cover"
                    />
                  </Pressable>
                )}
                {/* Title */}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text
                    style={{
                      ...typography._internal.h3,
                      color: colors.text.primary,
                    }}
                  >
                    {capitalizeFirst(item.detectedLabel || categoryLabel)}
                  </Text>
                </View>
                {/* Chevron */}
                {item.styleNotes && item.styleNotes.length > 0 && (
                  <ChevronDown
                    size={20}
                    color={colors.text.secondary}
                    style={{
                      transform: [{ rotate: isSummaryExpanded ? "180deg" : "0deg" }],
                    }}
                  />
                )}
              </View>
              {/* Expanded description */}
              {isSummaryExpanded && item.styleNotes && item.styleNotes.length > 0 && (
                <Animated.View
                  entering={FadeIn.duration(200)}
                  exiting={FadeOut.duration(200)}
                  style={{
                    paddingHorizontal: 16,
                    paddingBottom: 16,
                    borderTopWidth: 1,
                    borderTopColor: colors.border.hairline,
                    marginTop: spacing.md - spacing.xs,
                    paddingTop: spacing.md - spacing.xs,
                  }}
                >
                  <Text
                    style={{
                      ...typography._internal.meta,
                      color: colors.text.secondary,
                    }}
                  >
                    {capitalizeItems(item.styleNotes).join(" · ")}
                  </Text>
                </Animated.View>
              )}
            </Pressable>
          </Animated.View>

          {/* VIEW MODE */}
          {!isEditMode && (
            <View style={{ paddingHorizontal: 0 }}>
              {/* Category - chip style */}
              <Animated.View entering={FadeInDown.delay(100)} style={{ marginBottom: spacing.lg }}>
                <Text
                  style={{
                    ...typography.ui.sectionTitle,
                    color: colors.text.primary,
                    marginBottom: spacing.md,
                  }}
                >
                  Category
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  <View
                    style={{
                      paddingHorizontal: spacing.md + spacing.xs / 2,
                      paddingVertical: spacing.sm + spacing.xs / 2,
                      borderRadius: borderRadius.image,
                      backgroundColor: colors.accent.terracottaLight,
                      borderWidth: 0.5,
                      borderColor: colors.accent.terracottaLight,
                      marginRight: spacing.sm,
                      marginBottom: spacing.sm,
                    }}
                  >
                    <Text
                      style={{
                        ...typography.ui.label,
                        color: colors.text.primary,
                      }}
                    >
                      {categoryLabel}
                    </Text>
                  </View>
                </View>
              </Animated.View>

              {/* Style - read-only pills (hidden if empty) */}
              {displayStyleTags.length > 0 && (
                <View style={{ marginBottom: spacing.md + spacing.xs }}>
                  <Text
                    style={{
                      ...typography.ui.sectionTitle,
                      color: colors.text.primary,
                      marginBottom: spacing.md,
                    }}
                  >
                    Style
                  </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {displayStyleTags.map((tag, i) => {
                    const vibe = STYLE_VIBES.find((v) => v.id === tag);
                    return (
                      <View
                        key={i}
                        style={{
                          paddingHorizontal: spacing.md + spacing.xs / 2,
                          paddingVertical: spacing.sm + spacing.xs / 2,
                          borderRadius: borderRadius.image,
                          backgroundColor: colors.accent.terracottaLight,
                          borderWidth: 0.5,
                          borderColor: colors.accent.terracottaLight,
                          marginRight: spacing.sm,
                          marginBottom: spacing.sm,
                        }}
                      >
                        <Text
                          style={{
                            ...typography.ui.label,
                            color: colors.text.primary,
                          }}
                        >
                          {vibe?.label || tag}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

              {/* Detected colors - read-only swatches (use editedColors for immediate updates) */}
              {editedColors.length > 0 && (
                <View style={{ marginBottom: spacing.md + spacing.xs }}>
                  <Text
                    style={{
                      ...typography.ui.sectionTitle,
                      color: colors.text.primary,
                      marginBottom: spacing.md,
                    }}
                  >
                    Colors
                  </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
                  {editedColors.map((color, i) => {
                    const adjustedColor = adjustColorSaturation(color.hex);
                    return (
                      <View
                        key={i}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          marginBottom: spacing.sm,
                        }}
                      >
                        <View
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: borderRadius.pill,
                            backgroundColor: adjustedColor,
                            marginRight: 8,
                            borderWidth: 0.5,
                            borderColor: "rgba(0,0,0,0.06)",
                          }}
                        />
                        <Text
                          style={{
                            ...typography.ui.body,
                            color: colors.text.primary,
                          }}
                        >
                          {color.name}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

              {/* Brand - plain text (hidden if empty) */}
              {item.brand && (
                <View style={{ marginBottom: spacing.md + spacing.xs }}>
                  <Text
                    style={{
                      ...typography.ui.sectionTitle,
                      color: colors.text.primary,
                      marginBottom: spacing.md,
                    }}
                  >
                    Brand
                  </Text>
                  <Text
                    style={getTextStyle("body", colors.text.primary)}
                  >
                    {item.brand}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* EDIT MODE */}
          {isEditMode && (
            <View style={{ paddingHorizontal: 0 }}>
              {/* Category picker */}
              <CategoryPicker selected={editCategory} onSelect={setEditCategory} />

              {/* Style tags - required, right after Category */}
              <Animated.View entering={FadeInDown.delay(150)} style={{ marginBottom: spacing.md + spacing.xs }}>
                <Text
                  style={{
                    ...typography.ui.sectionTitle,
                    color: colors.text.primary,
                    marginBottom: spacing.md,
                  }}
                >
                  Style
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {STYLE_VIBES.map((vibe) => {
                    const isSelected = editStyleTags.includes(vibe.id);
                    return (
                      <Pressable
                        key={vibe.id}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          toggleStyleTag(vibe.id);
                        }}
                        style={{
                          paddingHorizontal: spacing.md + spacing.xs / 2,
                          paddingVertical: spacing.sm + spacing.xs / 2,
                          borderRadius: borderRadius.image,
                          backgroundColor: isSelected ? colors.accent.terracottaLight : "transparent",
                          borderWidth: 0.5,
                          borderColor: isSelected ? colors.accent.terracottaLight : colors.border.subtle,
                          marginRight: spacing.sm,
                          marginBottom: spacing.sm,
                        }}
                      >
                        <Text
                          style={{
                            ...typography.ui.label,
                            color: isSelected ? colors.text.primary : colors.text.secondary,
                          }}
                        >
                          {vibe.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Animated.View>

              {/* Add details - collapsible */}
              <View
                onLayout={(event) => {
                  detailsY.current = event.nativeEvent.layout.y;
                }}
                style={{
                  backgroundColor: colors.bg.elevated,
                  borderWidth: 1,
                  borderColor: colors.border.subtle,
                  borderRadius: borderRadius.card,
                  overflow: "hidden",
                }}
              >
                <Pressable
                  onPress={() => {
                    const wasExpanded = isDetailsExpanded;
                    setIsDetailsExpanded(!wasExpanded);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

                    // Auto-scroll when expanding
                    if (!wasExpanded && scrollViewRef.current && detailsY.current > 0) {
                      setTimeout(() => {
                        scrollViewRef.current?.scrollTo({
                          y: detailsY.current - 20,
                          animated: true,
                        });
                      }, 100);
                    }
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 14,
                    paddingHorizontal: spacing.md,
                  }}
                >
                  <View style={{ flex: 1, marginRight: spacing.sm }}>
                    <Text
                      style={{
                        ...typography.ui.sectionTitle,
                        color: colors.text.primary,
                      }}
                    >
                      Add details
                    </Text>
                    {!isDetailsExpanded && (() => {
                      const parts: string[] = [];
                      if (editedColors.length > 0) {
                        parts.push(editedColors.map(c => c.name).join(", "));
                      }
                      if (editBrand.trim().length > 0) {
                        parts.push(editBrand.trim());
                      }
                      const summary = parts.join(" • ");
                      return summary.length > 0 ? (
                        <Text
                          style={{
                            ...typography.ui.caption,
                            color: colors.text.tertiary,
                            marginTop: 2,
                          }}
                          numberOfLines={1}
                        >
                          {summary}
                        </Text>
                      ) : null;
                    })()}
                  </View>
                  {isDetailsExpanded ? (
                    <ChevronUp size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                  ) : (
                    <ChevronDown size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                  )}
                </Pressable>

              {isDetailsExpanded && (
                <Animated.View 
                  entering={FadeIn} 
                  style={{ 
                    paddingHorizontal: spacing.md,
                    paddingBottom: spacing.md,
                    borderTopWidth: 0.5,
                    borderTopColor: colors.border.subtle,
                  }}
                >
                  {/* Colors - editable with simple text field */}
                  <View style={{ marginBottom: spacing.lg, marginTop: spacing.md }}>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                      <Text
                        style={{
                          ...typography.ui.sectionTitle,
                          color: colors.text.primary,
                          flex: 1,
                        }}
                      >
                        Colors
                      </Text>
                      {!isEditingColors && editedColors.length > 0 && (
                        <Pressable
                          onPress={handleStartEditColors}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          style={{
                            padding: 8,
                          }}
                        >
                          <Pencil size={15} color={colors.text.tertiary} strokeWidth={1.5} />
                        </Pressable>
                      )}
                    </View>
                    {isEditingColors ? (
                      // Show simple text field when editing (like Brand field)
                      <TextInput
                        value={colorInputText}
                        onChangeText={setColorInputText}
                        onSubmitEditing={handleSaveColors}
                        onBlur={handleSaveColors}
                        placeholder="White, Blue, Navy..."
                        placeholderTextColor={colors.text.tertiary}
                        returnKeyType="done"
                        autoFocus
                        style={{
                          backgroundColor: colors.bg.elevated,
                          borderRadius: components.image.borderRadius,
                          paddingHorizontal: spacing.md,
                          paddingVertical: spacing.sm + spacing.xs,
                          ...typography.ui.body,
                          color: colors.text.primary,
                          borderWidth: 1,
                          borderColor: colors.border.subtle,
                        }}
                      />
                    ) : editedColors.length > 0 ? (
                      // Show swatch + label when not editing and colors exist
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
                        {editedColors.map((color, i) => {
                          const adjustedColor = adjustColorSaturation(color.hex);
                          return (
                            <Pressable
                              key={`chip-${i}`}
                              onPress={handleStartEditColors}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                marginBottom: spacing.sm,
                              }}
                            >
                              <View
                                style={{
                                  width: 14,
                                  height: 14,
                                  borderRadius: borderRadius.pill,
                                  backgroundColor: adjustedColor,
                                  marginRight: 8,
                                  borderWidth: 0.5,
                                  borderColor: "rgba(0,0,0,0.06)",
                                }}
                              />
                              <Text
                                style={{
                                  ...typography.ui.body,
                                  color: colors.text.primary,
                                }}
                              >
                                {color.name}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : (
                      // Show placeholder text field when no colors
                      <Pressable onPress={handleStartEditColors}>
                        <View
                          style={{
                            backgroundColor: colors.bg.elevated,
                            borderRadius: components.image.borderRadius,
                            paddingHorizontal: spacing.md,
                            paddingVertical: spacing.sm + spacing.xs,
                            borderWidth: 1,
                            borderColor: colors.border.subtle,
                          }}
                        >
                          <Text
                            style={getTextStyle("body", colors.text.tertiary)}
                          >
                            White, Blue, Navy...
                          </Text>
                        </View>
                      </Pressable>
                    )}
                  </View>

                  {/* Brand - editable */}
                      <View>
                        <Text
                          style={{
                            ...typography.ui.sectionTitle,
                            color: colors.text.primary,
                            marginBottom: 12,
                          }}
                        >
                          Brand
                        </Text>
                        <TextInput
                          value={editBrand}
                          onChangeText={setEditBrand}
                          placeholder="Zara, H&M..."
                          placeholderTextColor={colors.text.tertiary}
                          style={{
                            backgroundColor: colors.bg.elevated,
                            borderRadius: components.image.borderRadius,
                            paddingHorizontal: spacing.md,
                            paddingVertical: spacing.sm + spacing.xs,
                            ...typography.ui.body,
                            color: colors.text.primary,
                            borderWidth: 1,
                            borderColor: colors.border.subtle,
                          }}
                        />
                      </View>
                    </Animated.View>
                  )}
                </View>
              </View>
            )}
            </ScrollView>

            {/* Bottom action */}
            <View
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: colors.bg.primary,
                paddingHorizontal: spacing.lg,
                paddingBottom: insets.bottom,
                paddingTop: spacing.md,
                borderTopWidth: 1,
                borderTopColor: colors.border.hairline,
                // V3: upward shadow for sticky footer
                ...shadows.md,
              }}
            >
        {isEditMode ? (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <ButtonSecondaryOutline
                label="Cancel"
                onPress={handleCancel}
              />
            </View>
            <View style={{ flex: 1 }}>
              <ButtonPrimary
                label="Save changes"
                onPress={handleSave}
                disabled={editStyleTags.length === 0}
              />
            </View>
          </View>
        ) : (
          <ButtonPrimary
            label="Edit details"
            onPress={handleEnterEditMode}
          />
        )}
            </View>
          </KeyboardAvoidingView>

      {/* Photo viewer modal */}
      <PhotoViewerModal
        visible={!!photoViewerUri}
        imageUri={photoViewerUri}
        onClose={() => setPhotoViewerUri(null)}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteConfirmation}
        transparent
        animationType="fade"
        onRequestClose={handleCancelDelete}
      >
        <Pressable
          onPress={handleCancelDelete}
          style={{
            flex: 1,
            backgroundColor: colors.overlay.dark,
            justifyContent: "center",
            alignItems: "center",
            padding: spacing.lg,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              // V3: cards.elevated for modal dialogs
              backgroundColor: cards.elevated.backgroundColor,
              borderRadius: cards.elevated.borderRadius,
              padding: spacing.lg,
              width: "100%",
              maxWidth: 340,
              ...shadows.lg,
            }}
          >
            {/* Title */}
            <Text
              style={{
                ...typography.ui.cardTitle,
                textAlign: "center",
                marginBottom: spacing.sm,
              }}
            >
              Remove {item?.detectedLabel ? capitalizeFirst(item.detectedLabel) : "item"}?
            </Text>

            {/* Body */}
            <Text
              style={{
                ...typography.ui.body,
                color: colors.text.secondary,
                textAlign: "center",
                marginBottom: spacing.xl,
              }}
            >
              This may affect existing scans and outfit suggestions.
            </Text>

            {/* Buttons */}
            <View style={{ gap: spacing.sm }}>
              {/* Primary destructive */}
              <Pressable
                onPress={handleConfirmDelete}
                style={{
                  backgroundColor: colors.state.destructive,
                  borderRadius: borderRadius.pill,
                  height: 52,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    ...typography.button.primary,
                    color: colors.text.inverse,
                  }}
                >
                  Remove
                </Text>
              </Pressable>

              {/* Secondary cancel */}
              <ButtonSecondary
                label="Cancel"
                onPress={handleCancelDelete}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
