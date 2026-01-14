import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ChevronLeft, ChevronRight, Shirt, Palette, Ruler, Trash2, ShoppingBag } from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { spacing, typography, colors, borderRadius, cards, button } from "@/lib/design-tokens";
import { useAuth } from "@/lib/auth-context";
import { FavoriteStoresModal } from "@/components/FavoriteStoresModal";
import { ButtonPrimary } from "@/components/ButtonPrimary";
import { useStorePreference, useUpdateStorePreference, getStoreLabel } from "@/lib/store-preferences";
import { trackStorePrefDismissed, trackStorePrefSaved } from "@/lib/analytics";
import { usePreferences } from "@/lib/database";

// Settings row component - matches Profile page
function SettingsRow({
  icon,
  title,
  subtitle,
  preview,
  onPress,
  showChevron = true,
  textColor,
  showSeparator = true,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  preview?: string;
  onPress: () => void;
  showChevron?: boolean;
  textColor?: string;
  showSeparator?: boolean;
}) {
  const [pressed, setPressed] = React.useState(false);

  return (
    <>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 56,
        paddingVertical: spacing.sm + spacing.xs / 2,
        paddingHorizontal: spacing.md,
          backgroundColor: pressed ? cards.states.pressedBg : "transparent",
          borderRadius: borderRadius.pill,
        }}
      >
        <View
        style={{
          width: spacing.xl - 4,
          height: spacing.xl - 4,
          borderRadius: borderRadius.image,
            backgroundColor: colors.surface.icon,
            alignItems: "center",
            justifyContent: "center",
            marginRight: spacing.md,
          }}
        >
          {icon}
        </View>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text
            style={{
              ...typography.ui.bodyMedium,
              color: textColor || colors.text.primary,
            }}
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              style={{
                ...typography.ui.caption,
                color: colors.text.secondary,
                marginTop: spacing.xs / 2 + 1,
              }}
            >
              {subtitle}
            </Text>
          )}
          {preview && (
            <Text
              style={{
                ...typography.ui.label,
                color: colors.text.tertiary,
                marginTop: spacing.xs / 2 + 1,
              }}
            >
              {preview}
            </Text>
          )}
        </View>
        {showChevron && <ChevronRight size={18} color={colors.text.tertiary} />}
      </Pressable>
      {showSeparator && (
        <View
          style={{
            height: 0.5,
            backgroundColor: colors.border.hairline,
            marginLeft: spacing.md + 36 + spacing.md,
            marginRight: spacing.md,
          }}
        />
      )}
    </>
  );
}

// Section header component
function SectionHeader({ title }: { title: string }) {
  return (
    <Text
      style={{
        ...typography.ui.label,
        color: colors.text.secondary,
        marginBottom: spacing.sm,
        marginTop: spacing.lg,
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      {title}
    </Text>
  );
}

// Delete account confirmation modal
function DeleteAccountModal({
  visible,
  onCancel,
  onConfirm,
  isDeleting,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable
        onPress={onCancel}
        style={{
          flex: 1,
          backgroundColor: colors.overlay.dark,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: spacing.xl,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.bg.elevated,
            borderRadius: borderRadius.card,
            width: "100%",
            maxWidth: 400,
            padding: spacing.lg,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              ...typography.ui.cardTitle,
              textAlign: "center",
              marginBottom: spacing.md,
            }}
          >
            Delete account
          </Text>
          <Text
            style={{
              ...typography.ui.body,
              textAlign: "center",
              marginBottom: spacing.sm,
            }}
          >
            Deleting your account will permanently remove your profile, preferences, saved scans, and all associated data.
          </Text>
          <Text
            style={{
              ...typography.ui.body,
              textAlign: "center",
              marginBottom: spacing.sm,
            }}
          >
            This action can't be undone.
          </Text>
          <Text
            style={{
              ...typography.ui.body,
              color: colors.text.tertiary,
              textAlign: "center",
              marginBottom: spacing.xl,
            }}
          >
            You can create a new account at any time.
          </Text>
          <View style={{ width: "100%", gap: spacing.sm }}>
            {/* Cancel is primary - encourage keeping account */}
            <ButtonPrimary
              label="Cancel"
              onPress={onCancel}
              disabled={isDeleting}
            />
            {/* Delete is secondary destructive text link */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onConfirm();
              }}
              disabled={isDeleting}
              style={{
                height: button.height.primary,
                alignItems: "center",
                justifyContent: "center",
                opacity: isDeleting ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  ...typography.button.primary,
                  color: colors.state.destructive,
                }}
              >
                {isDeleting ? "Deleting..." : "Delete account"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function PreferencesScreen() {
  const { deleteAccount } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Get user preferences
  const { data: preferences } = usePreferences();
  
  // Store preferences state
  const [showFavoriteStoresModal, setShowFavoriteStoresModal] = useState(false);
  const { data: storePreference } = useStorePreference();
  const updateStorePreference = useUpdateStorePreference();

  // Format style preferences preview
  const getStylePreview = () => {
    if (!preferences?.styleVibes || preferences.styleVibes.length === 0) return undefined;
    const vibes = preferences.styleVibes.map((vibe: string) => 
      vibe.charAt(0).toUpperCase() + vibe.slice(1)
    );
    if (vibes.length === 1) return vibes[0];
    if (vibes.length === 2) return `${vibes[0]} • ${vibes[1]}`;
    return `${vibes[0]} • ${vibes[1]} +${vibes.length - 2}`;
  };

  // Format color preferences preview
  const getColorPreview = () => {
    if (!preferences?.wardrobeColors || preferences.wardrobeColors.length === 0) return undefined;
    
    // Determine which color groups are represented
    const colorGroups = [
      { id: "black", label: "Mostly black", hexes: ["#000000", "#1C1917"] },
      { id: "neutrals", label: "Neutrals", hexes: ["#FFFFFF", "#D6D3D1", "#F5F5DC", "#FFFDD0"] },
      { id: "denim", label: "Denim & blues", hexes: ["#000080", "#4169E1", "#87CEEB"] },
      { id: "earth", label: "Earth tones", hexes: ["#8B4513", "#D2B48C", "#800000"] },
      { id: "warm", label: "Warm brights", hexes: ["#DC143C", "#FFA500", "#FFD700"] },
      { id: "cool", label: "Cool brights", hexes: ["#800080", "#E6E6FA", "#FFB6C1"] },
    ];
    
    const selectedHexes = preferences.wardrobeColors.map((c: any) => c.hex);
    const matchedGroups = colorGroups.filter(group => 
      group.hexes.some(hex => selectedHexes.includes(hex))
    );
    
    if (matchedGroups.length === 0) return undefined;
    if (matchedGroups.length === 1) return matchedGroups[0].label;
    if (matchedGroups.length === 2) return `${matchedGroups[0].label} • ${matchedGroups[1].label}`;
    return `${matchedGroups[0].label} • ${matchedGroups[1].label} +${matchedGroups.length - 2}`;
  };

  // Format fit preference preview
  const getFitPreview = () => {
    if (!preferences?.fitPreference) return undefined;
    return preferences.fitPreference.charAt(0).toUpperCase() + preferences.fitPreference.slice(1);
  };

  // Format store preferences preview
  const getStorePreview = () => {
    if (!storePreference?.favoriteStores || storePreference.favoriteStores.length === 0) return undefined;
    const stores = storePreference.favoriteStores.map(id => getStoreLabel(id));
    if (stores.length === 1) return stores[0];
    if (stores.length === 2) return `${stores[0]} • ${stores[1]}`;
    return `${stores[0]} • ${stores[1]} +${stores.length - 2}`;
  };

  const handleUpdateStyle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/onboarding",
      params: { step: "style", fromPreferences: "true" },
    });
  };

  const handleUpdateColors = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/onboarding",
      params: { step: "colors", fromPreferences: "true" },
    });
  };

  const handleUpdateFit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/onboarding",
      params: { step: "fit_reference", fromPreferences: "true" },
    });
  };

  const handleUpdateStores = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowFavoriteStoresModal(true);
  };

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleDeleteAccount = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    try {
      setIsDeleting(true);
      const { error } = await deleteAccount();
      
      if (error) {
        console.error("Error deleting account:", error);
        // Still close modal and sign out even if there's an error
      }
      
      setShowDeleteModal(false);
      
      // Close the preferences modal first by going back
      // This ensures we exit modal mode before navigating to login
      if (router.canGoBack()) {
        router.back();
        // Wait for modal to close, then navigate to login
        setTimeout(() => {
          router.replace("/login");
        }, 300);
      } else {
        // If we can't go back, navigate directly
        router.replace("/login");
      }
    } catch (error) {
      console.error("Error deleting account:", error);
      setShowDeleteModal(false);
      if (router.canGoBack()) {
        router.back();
        setTimeout(() => {
          router.replace("/login");
        }, 300);
      } else {
        router.replace("/login");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Drag handle for modal feel */}
        <View style={{ alignItems: "center", paddingTop: spacing.sm + 4, paddingBottom: spacing.sm }}>
          <View
            style={{
              width: spacing.xxl,
              height: spacing.xs,
              borderRadius: borderRadius.pill,
              backgroundColor: colors.bg.tertiary,
            }}
          />
        </View>
        
        {/* Header */}
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
          }}
        >
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <Text
              style={{
                ...typography.display.screenTitle,
                letterSpacing: 0.3,
              }}
            >
              Your preferences
            </Text>
          </Animated.View>
          {/* Separator line */}
          <View style={{ marginTop: spacing.md, height: 1, backgroundColor: colors.border.hairline }} />
        </View>

        <View
          style={{
            flex: 1,
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.xl,
          }}
        >
          {/* Preferences Section */}
          <Animated.View entering={FadeInDown.delay(100).duration(400)}>
            <SectionHeader title="Preferences" />
            <SettingsRow
              icon={<Shirt size={18} color={colors.text.secondary} />}
              title="Style preferences"
              preview={getStylePreview()}
              onPress={handleUpdateStyle}
            />
            <SettingsRow
              icon={<Palette size={18} color={colors.text.secondary} />}
              title="Wardrobe colors"
              preview={getColorPreview()}
              onPress={handleUpdateColors}
            />
            <SettingsRow
              icon={<Ruler size={18} color={colors.text.secondary} />}
              title="Fit preferences"
              preview={getFitPreview()}
              onPress={handleUpdateFit}
            />
            <SettingsRow
              icon={<ShoppingBag size={18} color={colors.text.secondary} />}
              title="Store preferences"
              preview={getStorePreview()}
              onPress={handleUpdateStores}
              showSeparator={false}
            />
          </Animated.View>

          {/* Account Actions Section */}
          <Animated.View entering={FadeInDown.delay(200).duration(400)}>
            <SectionHeader title="Account" />
            <SettingsRow
              icon={<Trash2 size={18} color={colors.state.destructive} />}
              title="Delete account"
              onPress={handleDeleteAccount}
              showChevron={false}
              textColor={colors.state.destructive}
              showSeparator={false}
            />
          </Animated.View>
        </View>
      </SafeAreaView>
      <DeleteAccountModal
        visible={showDeleteModal}
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />
      
      {/* Favorite Stores Modal */}
      <FavoriteStoresModal
        visible={showFavoriteStoresModal}
        savedStores={storePreference?.favoriteStores ?? []}
        onClose={() => {
          trackStorePrefDismissed({ method: "x" });
          setShowFavoriteStoresModal(false);
        }}
        onSave={(stores) => {
          updateStorePreference.mutate(stores, {
            onSuccess: () => {
              trackStorePrefSaved({
                storeCount: stores.length,
                stores: stores,
              });
              setShowFavoriteStoresModal(false);
            },
          });
        }}
      />
    </View>
  );
}

