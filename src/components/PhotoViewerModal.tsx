/**
 * PhotoViewerModal
 *
 * Simple full-screen photo viewer modal.
 * Tap to view, tap to close.
 */

import React from "react";
import { Modal, Pressable, View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { borderRadius } from "@/lib/design-tokens";

interface PhotoViewerModalProps {
  visible: boolean;
  imageUri: string | null;
  onClose: () => void;
}

export function PhotoViewerModal({
  visible,
  imageUri,
  onClose,
}: PhotoViewerModalProps) {
  const insets = useSafeAreaInsets();
  
  // Keep track of the last valid imageUri to show during close animation
  const [displayUri, setDisplayUri] = React.useState<string | null>(null);
  
  React.useEffect(() => {
    if (imageUri) {
      setDisplayUri(imageUri);
    }
    // Don't clear displayUri when imageUri becomes null - let the animation complete
  }, [imageUri]);
  
  // Clear displayUri after modal is fully closed
  React.useEffect(() => {
    if (!visible) {
      const timeout = setTimeout(() => {
        setDisplayUri(null);
      }, 300); // Wait for fade animation to complete
      return () => clearTimeout(timeout);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Backdrop - tap to close */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        {/* Close button */}
        <Animated.View
          entering={FadeIn.delay(100)}
          exiting={FadeOut}
          style={[styles.closeButton, { top: insets.top + 16 }]}
        >
          <Pressable
            onPress={onClose}
            style={styles.closeButtonInner}
            hitSlop={16}
          >
            <X size={24} color="#fff" strokeWidth={2} />
          </Pressable>
        </Animated.View>

        {/* Image - use displayUri to maintain image during close animation */}
        {displayUri && (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: displayUri }}
              style={styles.image}
              contentFit="contain"
              transition={200}
            />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButton: {
    position: "absolute",
    right: 16,
    zIndex: 10,
  },
  closeButtonInner: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.pill,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  imageContainer: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  image: {
    width: "100%",
    height: "80%",
  },
});
