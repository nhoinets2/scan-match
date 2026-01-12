import React from "react";
import { View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  Footprints,
  Shirt,
  ShoppingBag,
  Sparkles,
  Layers,
  Package,
} from "lucide-react-native";
import { MissingPiece, WardrobeCoverage, Category, CATEGORIES } from "@/lib/types";
import { typography, colors } from "@/lib/design-tokens";

interface MissingPiecesSectionProps {
  missingPieces: MissingPiece[];
  wardrobeCoverage: WardrobeCoverage;
  missingRequiredCategories: boolean;
}

// Get category label from id
function getCategoryLabel(categoryId: string): string {
  const category = CATEGORIES.find((c) => c.id === categoryId);
  return category?.label || categoryId;
}

// Get category icon
function getCategoryIcon(category: Category) {
  const props = { size: 16, color: colors.text.secondary, strokeWidth: 1.75 };
  switch (category) {
    case "shoes":
      return <Footprints {...props} />;
    case "tops":
      return <Shirt {...props} />;
    case "bottoms":
      return <Layers {...props} />;
    case "outerwear":
      return <Package {...props} />;
    case "bags":
      return <ShoppingBag {...props} />;
    case "accessories":
      return <Sparkles {...props} />;
    case "dresses":
      return <Shirt {...props} />;
    case "skirts":
      return <Layers {...props} />;
    default:
      return <Sparkles {...props} />;
  }
}

export function MissingPiecesSection({
  missingPieces,
}: MissingPiecesSectionProps) {
  // Hide section if no missing pieces
  if (missingPieces.length === 0) {
    return null;
  }

  // Sort by isRequired internally (required first), but don't show labels
  // Cap at 3 items total
  const sortedPieces = [...missingPieces]
    .sort((a, b) => {
      // Required items first
      if (a.isRequired && !b.isRequired) return -1;
      if (!a.isRequired && b.isRequired) return 1;
      return 0;
    })
    .slice(0, 3);

  const renderSuggestionCard = (piece: MissingPiece, index: number) => {
    const categoryLabel = getCategoryLabel(piece.category);

    return (
      <View
        key={`${piece.category}-${index}`}
        className="flex-row items-start mb-3 bg-bg-card rounded-xl p-3 border border-text/5"
      >
        {/* Category icon */}
        <View className="mr-3 mt-0.5">{getCategoryIcon(piece.category)}</View>

        {/* Content */}
        <View className="flex-1">
          <Text
            className="text-text mb-0.5"
            style={{ fontFamily: "Inter_600SemiBold", fontSize: typography.sizes.body }}
          >
            {categoryLabel}
          </Text>
          <Text
            className="text-text-muted"
            style={{ fontFamily: "Inter_400Regular", fontSize: typography.sizes.caption, lineHeight: 18 }}
          >
            {piece.description}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Animated.View entering={FadeInDown.delay(350)} className="mx-5 mb-6">
      {/* Section title */}
      <Text
        className="text-text mb-1"
        style={{ fontFamily: "Inter_600SemiBold", fontSize: typography.sizes.body }}
      >
        Helpful additions
      </Text>

      {/* Section subtitle - styling guidance language */}
      <Text
        className="text-text-muted mb-3"
        style={{ fontFamily: "Inter_400Regular", fontSize: typography.sizes.caption }}
      >
        These could help complete the look.
      </Text>

      {/* Suggestion cards - no grouping, no labels */}
      <View>{sortedPieces.map((piece, index) => renderSuggestionCard(piece, index))}</View>
    </Animated.View>
  );
}
