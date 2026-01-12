import React, { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import {
  Footprints,
  Shirt,
  ShoppingBag,
  Sparkles,
  Layers,
  Package,
} from "lucide-react-native";
import { Category, CATEGORIES } from "@/lib/types";
import { typography, colors } from "@/lib/design-tokens";

export type GuidanceItem = {
  id: string; // stable key
  category: Category;
  suggestion: string; // short example: "chunky loafers"
  priority: "primary" | "optional"; // "primary" (core) or "optional" (extra)
  reason?: string; // optional, very short: "balances the silhouette"
};

export type GuidanceGroupProps = {
  title: string; // e.g. "Helpful additions"
  items: GuidanceItem[];
  maxPrimary?: number; // default 2
  maxOptional?: number; // default 1
  onAddWardrobe?: () => void; // optional CTA
  variant?: "inline" | "card"; // default "card"
};

function getCategoryLabel(categoryId: Category): string {
  return CATEGORIES.find((c) => c.id === categoryId)?.label ?? categoryId;
}

function getCategoryIcon(category: Category) {
  // Keep icons monochrome and subtle; avoid alert/warning language.
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

function shouldShowReason(reason?: string): boolean {
  if (!reason) return false;
  const words = reason.trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 6;
}

export function GuidanceGroup({
  title,
  items,
  maxPrimary = 2,
  maxOptional = 1,
  onAddWardrobe,
  variant = "card",
}: GuidanceGroupProps) {
  const rows = useMemo(() => {
    if (!items || items.length === 0) return [];

    // Stable ordering: keep original relative order within each priority bucket.
    const primary = items.filter((i) => i.priority === "primary");
    const optional = items.filter((i) => i.priority === "optional");

    return [...primary.slice(0, maxPrimary), ...optional.slice(0, maxOptional)].slice(0, 3);
  }, [items, maxPrimary, maxOptional]);

  if (rows.length === 0) return null;

  const containerClassName =
    variant === "card" ? "bg-bg-card rounded-2xl p-4" : "";

  return (
    <View className={containerClassName}>
      {/* Top row: title + optional action */}
      <View className="flex-row items-center justify-between mb-2">
        <Text
          className="text-text"
          style={{ fontFamily: "Inter_600SemiBold", fontSize: typography.sizes.h3 }}
        >
          {title}
        </Text>

        {onAddWardrobe && (
          <Pressable
            onPress={onAddWardrobe}
            className="px-3 py-1.5 rounded-full bg-text/5"
            hitSlop={10}
          >
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: typography.sizes.meta,
                color: colors.accent.terracotta,
              }}
            >
              Add items
            </Text>
          </Pressable>
        )}
      </View>

      {/* Compact rows (max 3) */}
      <View className="mt-1">
        {rows.map((item, idx) => {
          const label = getCategoryLabel(item.category);
          const suggestion = (item.suggestion ?? "").trim().toLowerCase();
          const pillText = item.priority === "primary" ? "Core" : "Extra";
          const pillStyle =
            item.priority === "primary"
              ? { backgroundColor: colors.accent.terracottaLight, color: colors.accent.terracotta }
              : { backgroundColor: colors.state.pressed, color: colors.text.secondary };

          return (
            <View key={item.id} className={idx === rows.length - 1 ? "py-2" : "py-2 border-b border-text/5"}>
              <View className="flex-row items-start justify-between">
                <View className="flex-row items-start flex-1 pr-3">
                  <View className="mt-0.5 mr-2.5">{getCategoryIcon(item.category)}</View>
                  <View className="flex-1">
                    <Text
                      className="text-text"
                      style={{ fontFamily: "Inter_500Medium", fontSize: typography.sizes.body, lineHeight: 20 }}
                    >
                      {label}
                      <Text
                        className="text-text-muted"
                        style={{ fontFamily: "Inter_400Regular" }}
                      >
                        {" "}
                        · {suggestion}
                      </Text>
                    </Text>

                    {shouldShowReason(item.reason) && (
                      <Text
                        className="text-text-muted mt-0.5"
                        style={{ fontFamily: "Inter_400Regular", fontSize: typography.sizes.meta, lineHeight: 16 }}
                      >
                        {item.reason}
                      </Text>
                    )}
                  </View>
                </View>

                <View
                  className="px-2 py-1 rounded-full"
                  style={{ backgroundColor: pillStyle.backgroundColor }}
                >
                  <Text
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 11,
                      color: pillStyle.color,
                    }}
                  >
                    {pillText}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}


