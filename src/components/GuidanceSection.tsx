import React from "react";
import { Text, View, Pressable } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { GuidanceRow, GuidanceRowModel } from "@/components/GuidanceRow";
import { ButtonTertiary } from "@/components/ButtonTertiary";
import { spacing, typography, colors } from "@/lib/design-tokens";

export type GuidanceSectionEmptyState = {
  title: string;
  subtitle?: string;
  ctaText?: string;
  onCta?: () => void;
  buttonGlassmorphism?: boolean;
  showChevron?: boolean;
};

export type GuidanceSectionProps = {
  title: string;
  subtitle?: string;
  rows: GuidanceRowModel[];
  emptyState?: GuidanceSectionEmptyState;
  maxRows?: number; // default 3
  rowPadding?: number; // padding between rows, default uses py-1 (4px)
};

export function GuidanceSection({
  title,
  subtitle,
  rows,
  emptyState,
  maxRows = 3,
  rowPadding,
}: GuidanceSectionProps) {
  const visibleRows = (rows ?? []).slice(0, maxRows);
  const hasRows = visibleRows.length > 0;

  // If there's nothing to show and no empty state, hide.
  if (!hasRows && !emptyState) return null;

  return (
    <View className="bg-bg-card/60 rounded-2xl px-4 py-4">
      {/* Header */}
      <View style={{ marginBottom: title ? (subtitle ? spacing.md : spacing.sm) : 0 }}>
        {title ? (
          <Text
            className="text-text"
            style={{ fontFamily: "Inter_600SemiBold", fontSize: 15 }}
          >
            {title}
          </Text>
        ) : null}
        {!!subtitle && (
          <Text
            className="text-text-muted mt-1"
            numberOfLines={1}
            style={{ fontFamily: "Inter_400Regular", fontSize: typography.sizes.meta, lineHeight: 16 }}
          >
            {subtitle}
          </Text>
        )}
      </View>

      {/* Rows or empty state */}
      {hasRows ? (
        <View>
          {visibleRows.map((row, idx) => (
            <View
              key={row.id}
              className={idx === visibleRows.length - 1 ? "" : "border-b border-text/5"}
              style={rowPadding !== undefined ? { 
                paddingTop: rowPadding, 
                paddingBottom: idx === visibleRows.length - 1 ? rowPadding : rowPadding 
              } : { paddingVertical: 4 }}
            >
              <GuidanceRow
                leadingType={row.leadingType}
                leadingIcon={row.leadingIcon}
                leadingThumbUrl={row.leadingThumbUrl}
                title={row.title}
                subtitle={row.subtitle}
                trailingType={row.trailingType}
                trailingThumbUrl={row.trailingThumbUrl}
                trailingPillText={row.trailingPillText}
                trailingChevronColor={row.trailingChevronColor}
                subtitleOpacity={row.subtitleOpacity}
                showSubtitleTooltip={row.showSubtitleTooltip}
                onPress={row.onPress}
                iconGlassmorphism={row.iconGlassmorphism}
              />
            </View>
          ))}
        </View>
      ) : (
        <View style={{ paddingTop: title ? 8 : 0, paddingBottom: 8 }}>
          <Text
            className="text-text"
            style={{ fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, textAlign: "center", opacity: 0.56 }}
          >
            {emptyState?.title}
          </Text>
          {!!emptyState?.subtitle && (
            <Text
              className="text-text-muted mt-1"
              style={{ fontFamily: "Inter_400Regular", fontSize: typography.sizes.meta, lineHeight: 18, textAlign: "center", opacity: 0.7 }}
            >
              {emptyState.subtitle}
            </Text>
          )}

          {!!emptyState?.ctaText && !!emptyState?.onCta && (
            <View style={{ alignSelf: "center", marginTop: spacing.md, flexDirection: "row", alignItems: "center" }}>
              <ButtonTertiary
                label={emptyState.ctaText}
                onPress={emptyState.onCta}
                glassmorphism={emptyState.buttonGlassmorphism ?? true}
                textColor={colors.text.secondary}
              />
              {emptyState.showChevron && (
                <Pressable
                  onPress={emptyState.onCta}
                  style={{ marginLeft: -4, padding: 4 }}
                >
                  <ChevronRight size={20} color={colors.text.secondary} />
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}


