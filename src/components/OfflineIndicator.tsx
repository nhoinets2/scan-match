/**
 * Global Offline Indicator
 *
 * Displays a subtle banner at the top of the screen when the device
 * is offline. Uses NetInfo to monitor connection status.
 */

import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { colors, button } from "@/lib/design-tokens";
import Animated, {
  FadeInUp,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WifiOff } from "lucide-react-native";

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);
  const insets = useSafeAreaInsets();
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    // Subscribe to network state updates
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const offline = state.isConnected === false;
      setIsOffline(offline);
    });

    // Check initial state
    NetInfo.fetch().then((state) => {
      setIsOffline(state.isConnected === false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Subtle pulse animation for the icon
  useEffect(() => {
    if (isOffline) {
      pulseOpacity.value = withRepeat(
        withTiming(0.5, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      pulseOpacity.value = 1;
    }
  }, [isOffline, pulseOpacity]);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  if (!isOffline) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeInUp.duration(300)}
      exiting={FadeOutUp.duration(200)}
      style={[
        styles.container,
        {
          paddingTop: insets.top > 0 ? insets.top + 4 : 12,
        },
      ]}
    >
      <View style={styles.content}>
        <Animated.View style={iconStyle}>
          <WifiOff size={14} color={colors.text.inverse} strokeWidth={2} />
        </Animated.View>
        <Text style={styles.text}>No internet connection</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: button.primary.backgroundColor,
    zIndex: 9999,
    paddingBottom: 10,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  text: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: colors.text.inverse,
  },
});

export default OfflineIndicator;

