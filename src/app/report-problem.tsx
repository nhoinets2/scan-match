import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Switch,
  Linking,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  ChevronDown,
  Check,
  Send,
  Camera,
  Zap,
  ShoppingBag,
  Shirt,
  User,
  HelpCircle,
  Copy,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import * as Device from "expo-device";
import * as Network from "expo-network";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import * as MailComposer from "expo-mail-composer";

import { useAuth } from "@/lib/auth-context";
import { colors, spacing, button, borderRadius, typography } from "@/lib/design-tokens";
import { getBreadcrumbsString, getScanContext, formatScanContext } from "@/lib/breadcrumbs";
import { getSessionId } from "@/lib/inspiration/tipsheetTelemetry";

// Problem categories
const PROBLEM_CATEGORIES = [
  { id: "scanning", label: "Scanning issues", icon: Camera },
  { id: "results", label: "Match results", icon: Zap },
  { id: "wardrobe", label: "Wardrobe management", icon: Shirt },
  { id: "account", label: "Account & settings", icon: User },
  { id: "performance", label: "App performance", icon: ShoppingBag },
  { id: "other", label: "Other", icon: HelpCircle },
];

// Generate a short report ID
function generateReportId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `RPT-${timestamp}-${random}`.toUpperCase();
}

function CategorySelector({
  selectedCategory,
  onSelect,
}: {
  selectedCategory: string | null;
  onSelect: (categoryId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const selectedItem = PROBLEM_CATEGORIES.find((c) => c.id === selectedCategory);

  return (
    <View>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setIsExpanded(!isExpanded);
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.bg.elevated,
          borderWidth: 1.5,
          borderColor: colors.border.subtle,
          borderRadius: borderRadius.card,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 6,
        }}
      >
        {selectedItem ? (
          <>
            <selectedItem.icon size={20} color={colors.text.secondary} style={{ marginRight: spacing.sm }} />
            <Text
              style={{
                flex: 1,
                ...typography.ui.bodyMedium,
                color: colors.text.primary,
              }}
            >
              {selectedItem.label}
            </Text>
          </>
        ) : (
          <Text
            style={{
              flex: 1,
              ...typography.ui.body,
              color: colors.text.tertiary,
            }}
          >
            Select a category
          </Text>
        )}
        <ChevronDown
          size={20}
          color={colors.text.tertiary}
          style={{ transform: [{ rotate: isExpanded ? "180deg" : "0deg" }] }}
        />
      </Pressable>

      {isExpanded && (
        <View
          style={{
            marginTop: spacing.xs,
            backgroundColor: colors.bg.elevated,
            borderWidth: 1.5,
            borderColor: colors.border.subtle,
            borderRadius: borderRadius.card,
            overflow: "hidden",
          }}
        >
          {PROBLEM_CATEGORIES.map((category, index) => (
            <Pressable
              key={category.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(category.id);
                setIsExpanded(false);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm + 6,
                borderTopWidth: index > 0 ? 1 : 0,
                borderTopColor: colors.border.subtle,
                backgroundColor: selectedCategory === category.id ? colors.accent.terracottaLight : "transparent",
              }}
            >
              <category.icon size={20} color={colors.text.secondary} style={{ marginRight: spacing.sm }} />
              <Text
                style={{
                  flex: 1,
                  ...typography.ui.bodyMedium,
                  color: colors.text.primary,
                }}
              >
                {category.label}
              </Text>
              {selectedCategory === category.id && (
                <Check size={18} color={colors.accent.terracotta} />
              )}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export default function ReportProblemScreen() {
  const { user } = useAuth();
  const currentPath = usePathname();
  
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [loading, setLoading] = useState(false);
  const [networkState, setNetworkState] = useState<string>("Unknown");
  const [copied, setCopied] = useState(false);

  // Generate report ID once per screen mount
  const reportId = useMemo(() => generateReportId(), []);

  const canSubmit = category && description.trim().length > 0;

  // Get network state on mount
  useEffect(() => {
    const getNetworkState = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        if (!state.isConnected) {
          setNetworkState("Offline");
        } else if (state.type === Network.NetworkStateType.WIFI) {
          setNetworkState("WiFi");
        } else if (state.type === Network.NetworkStateType.CELLULAR) {
          setNetworkState("Cellular");
        } else {
          setNetworkState("Connected");
        }
      } catch {
        setNetworkState("Unknown");
      }
    };
    getNetworkState();
  }, []);

  // Check if this is a scan-related report
  const isScanRelated = category === "scanning" || category === "results";
  const scanContext = getScanContext();

  // Gather diagnostic information
  const getDiagnostics = () => {
    const now = new Date();
    const appVersion = Constants.expoConfig?.version || "Unknown";
    const buildNumber = Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode || "Unknown";
    const deviceModel = Device.modelName || "Unknown";
    const osVersion = Device.osVersion || "Unknown";
    const osName = Device.osName || "Unknown";
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || "Unknown";
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown";
    const userId = user?.id || "Not signed in";
    const sessionId = getSessionId();
    const breadcrumbs = getBreadcrumbsString(10);

    return {
      reportId,
      // Timestamps
      localTime: now.toLocaleString("en-US", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }),
      utcTime: now.toISOString(),
      // App info
      appVersion,
      buildNumber,
      env: __DEV__ ? "dev" : "prod",
      // Device info
      deviceModel,
      osName,
      osVersion,
      locale,
      timezone,
      // Session info
      userId,
      sessionId,
      currentScreen: currentPath,
      // Context
      networkState,
      breadcrumbs,
    };
  };

  const buildDiagnosticsBlock = () => {
    const d = getDiagnostics();
    
    // Pad labels for alignment (monospace-friendly)
    const pad = (label: string, width = 18) => label.padEnd(width, " ");
    
    let block = `--- DIAGNOSTICS ---
${pad("Report ID:")}${d.reportId}
${pad("Timestamp (local):")}${d.localTime}
${pad("Timestamp (UTC):")}${d.utcTime}
${pad("App:")}Scan & Match ${d.appVersion} (${d.buildNumber})  Env: ${d.env}
${pad("Device:")}${d.deviceModel}
${pad("OS:")}${d.osName} ${d.osVersion}
${pad("Locale:")}${d.locale}
${pad("Timezone:")}${d.timezone}
${pad("Network:")}${d.networkState}
${pad("User ID:")}${d.userId}
${pad("Session ID:")}${d.sessionId}
${pad("Screen:")}${d.currentScreen}
${pad("Last actions:")}${d.breadcrumbs}`;

    // Add scan context for scan-related reports
    if (isScanRelated && scanContext) {
      block += `\n\n--- SCAN CONTEXT ---
${formatScanContext()}`;
    }

    block += `\n--- END DIAGNOSTICS ---`;

    return block;
  };

  const buildEmailBody = (forMailto = false) => {
    const categoryLabel = PROBLEM_CATEGORIES.find((c) => c.id === category)?.label || "Unknown";
    const d = getDiagnostics();

    let body = `Hi Support team,

What happened:
${description}
`;

    if (expectedOutcome.trim()) {
      body += `
What I expected:
${expectedOutcome}
`;
    }

    if (!forMailto) {
      body += `
Attachments:
Please attach any screenshots that might help (especially the results screen if relevant).
`;
    }

    if (includeDiagnostics) {
      body += `

${buildDiagnosticsBlock()}
`;
    }

    body += `
Thank you!`;

    return body;
  };

  const buildEmailSubject = () => {
    const categoryLabel = PROBLEM_CATEGORIES.find((c) => c.id === category)?.label || "Issue";
    const appVersion = Constants.expoConfig?.version || "?";
    const buildNumber = Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode || "?";
    const screenName = currentPath.replace(/^\//g, "").replace(/-/g, " ") || "home";
    
    return `[Scan & Match v${appVersion}(${buildNumber})] ${categoryLabel} — ${screenName} — Problem Report`;
  };

  const handleCopyReport = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    const subject = buildEmailSubject();
    const body = buildEmailBody(true);
    const fullReport = `Subject: ${subject}\n\n${body}`;
    
    await Clipboard.setStringAsync(fullReport);
    setCopied(true);
    
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendReport = async () => {
    if (!canSubmit) return;

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const isAvailable = await MailComposer.isAvailableAsync();

      if (isAvailable) {
        await MailComposer.composeAsync({
          recipients: ["snaptomatch@gmail.com"],
          subject: buildEmailSubject(),
          body: buildEmailBody(),
        });
        
        router.back();
      } else {
        // Show options: copy report or try mailto
        Alert.alert(
          "Email not available",
          "Your device doesn't have email set up. Would you like to copy the report to send manually?",
          [
            {
              text: "Copy report",
              onPress: handleCopyReport,
            },
            {
              text: "Try anyway",
              onPress: async () => {
                // Fallback to mailto with shortened body
                const subject = encodeURIComponent(buildEmailSubject());
                const shortBody = encodeURIComponent(
                  `What happened:\n${description}\n\nReport ID: ${reportId}\n\nPlease copy full diagnostics from the app if needed.`
                );
                const mailtoUrl = `mailto:snaptomatch@gmail.com?subject=${subject}&body=${shortBody}`;
                
                const canOpen = await Linking.canOpenURL(mailtoUrl);
                if (canOpen) {
                  await Linking.openURL(mailtoUrl);
                }
              },
            },
            { text: "Cancel", style: "cancel" },
          ]
        );
      }
    } catch (error) {
      console.error("Error sending report:", error);
      Alert.alert(
        "Error",
        "Unable to open email. Would you like to copy the report instead?",
        [
          { text: "Copy report", onPress: handleCopyReport },
          { text: "Cancel", style: "cancel" },
        ]
      );
    } finally {
      setLoading(false);
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
            paddingBottom: spacing.md,
          }}
        >
          <Text style={{ ...typography.display.screenTitle, color: colors.text.primary, letterSpacing: 0.3 }}>
            Report a problem
          </Text>
        </View>

        {/* Separator line */}
        <View style={{ marginHorizontal: spacing.lg, height: 0.5, backgroundColor: colors.border.hairline }} />

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
            paddingBottom: spacing.xl * 2,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Category Selection */}
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <Text
              style={{
                ...typography.ui.label,
                color: colors.text.secondary,
                marginBottom: spacing.sm,
              }}
            >
              Category
            </Text>
            <CategorySelector
              selectedCategory={category}
              onSelect={setCategory}
            />
          </Animated.View>

          {/* Description */}
          <Animated.View entering={FadeInDown.delay(200).springify()} style={{ marginTop: spacing.lg }}>
            <Text
              style={{
                ...typography.ui.label,
                color: colors.text.secondary,
                marginBottom: spacing.sm,
              }}
            >
              What happened?
            </Text>
            <View
              style={{
                backgroundColor: colors.bg.elevated,
                borderWidth: 1.5,
                borderColor: colors.border.subtle,
                borderRadius: borderRadius.card,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              }}
            >
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Describe the issue you experienced..."
                placeholderTextColor={colors.text.tertiary}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                style={{
                  ...typography.ui.body,
                  color: colors.text.primary,
                  minHeight: 100,
                }}
              />
            </View>
          </Animated.View>

          {/* Expected Outcome (Optional) */}
          <Animated.View entering={FadeInDown.delay(300).springify()} style={{ marginTop: spacing.lg }}>
            <Text
              style={{
                ...typography.ui.label,
                color: colors.text.secondary,
                marginBottom: spacing.sm,
              }}
            >
              What did you expect to happen? (optional)
            </Text>
            <View
              style={{
                backgroundColor: colors.bg.elevated,
                borderWidth: 1.5,
                borderColor: colors.border.subtle,
                borderRadius: borderRadius.card,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              }}
            >
              <TextInput
                value={expectedOutcome}
                onChangeText={setExpectedOutcome}
                placeholder="What should have happened instead..."
                placeholderTextColor={colors.text.tertiary}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
                style={{
                  ...typography.ui.body,
                  color: colors.text.primary,
                  minHeight: 60,
                }}
              />
            </View>
          </Animated.View>

          {/* Include Diagnostics Toggle */}
          <Animated.View entering={FadeInDown.delay(400).springify()} style={{ marginTop: spacing.lg }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: colors.bg.elevated,
                borderWidth: 1.5,
                borderColor: colors.border.subtle,
                borderRadius: borderRadius.card,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm + 6,
              }}
            >
              <View style={{ flex: 1, marginRight: spacing.md }}>
                <Text
                  style={{
                    ...typography.ui.bodyMedium,
                    color: colors.text.primary,
                    marginBottom: spacing.xs / 2 + 1,
                  }}
                >
                  Include diagnostics
                </Text>
                <Text
                  style={{
                    ...typography.ui.label,
                    color: colors.text.secondary,
                  }}
                >
                  App/device info and anonymous IDs. No photos included.
                </Text>
              </View>
              <Switch
                value={includeDiagnostics}
                onValueChange={(value) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setIncludeDiagnostics(value);
                }}
                trackColor={{ false: colors.border.subtle, true: colors.accent.terracotta }}
                thumbColor={colors.text.inverse}
              />
            </View>
          </Animated.View>

          {/* Tips */}
          <Animated.View entering={FadeInDown.delay(500).springify()} style={{ marginTop: spacing.md }}>
            <Text
              style={{
                ...typography.ui.label,
                color: colors.text.tertiary,
                textAlign: "center",
              }}
            >
              If you can, include a screenshot of the results screen.{"\n"}
              You can attach images in the email composer.
            </Text>
          </Animated.View>

          {/* Report ID (for reference) */}
          <Animated.View entering={FadeInDown.delay(600).springify()} style={{ marginTop: spacing.lg }}>
            <Text
              style={{
                ...typography.ui.caption,
                color: colors.text.tertiary,
                textAlign: "center",
              }}
            >
              Report ID: {reportId}
            </Text>
          </Animated.View>
        </ScrollView>

        {/* Bottom Buttons */}
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.xl,
            paddingTop: spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.border.subtle,
            backgroundColor: colors.bg.primary,
            gap: spacing.sm,
          }}
        >
          {/* Primary: Send Report */}
          <Pressable
            onPress={handleSendReport}
            disabled={!canSubmit || loading}
            style={({ pressed }) => ({
              opacity: pressed && canSubmit ? 0.9 : 1,
            })}
          >
            <View
              style={{
                height: button.height.primary,
                borderRadius: button.radius,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: canSubmit && !loading 
                  ? button.primary.backgroundColor 
                  : button.primary.backgroundColorDisabled,
                gap: spacing.sm,
              }}
            >
              <Send size={20} color={colors.text.inverse} />
              <Text style={{ ...typography.button.primary, color: colors.text.inverse }}>
                {loading ? "Opening email..." : "Send report"}
              </Text>
            </View>
          </Pressable>

          {/* Secondary: Copy Report */}
          <Pressable
            onPress={handleCopyReport}
            disabled={!canSubmit}
            style={({ pressed }) => ({
              opacity: pressed && canSubmit ? 0.9 : 1,
            })}
          >
            <View
              style={{
                height: button.height.secondary,
                borderRadius: button.radius,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.bg.elevated,
                borderWidth: 1.5,
                borderColor: colors.border.subtle,
                opacity: canSubmit ? 1 : 0.5,
                gap: spacing.sm,
              }}
            >
              <Copy size={20} color={copied ? colors.accent.terracotta : colors.text.primary} />
              <Text
                style={{
                  ...typography.button.primary,
                  color: copied ? colors.accent.terracotta : colors.text.primary,
                }}
              >
                {copied ? "Copied!" : "Copy report"}
              </Text>
            </View>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
