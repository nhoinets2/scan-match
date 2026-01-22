import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  ChevronDown,
  ChevronUp,
  Sparkles,
  Camera,
  Shirt,
  BarChart3,
  Bookmark,
  Settings,
  Mail,
  Crown,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { colors, spacing, borderRadius, typography, button } from "@/lib/design-tokens";

interface HelpTopic {
  id: string;
  question: string;
  answer: string;
}

interface HelpSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  topics: HelpTopic[];
}

const HELP_SECTIONS: HelpSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: <Sparkles size={20} color={colors.text.secondary} />,
    topics: [
      {
        id: "how-it-works",
        question: "How does Scan & Match work?",
        answer:
          "Scan & Match helps you make better shopping decisions by matching items you find in stores to your existing wardrobe. Simply scan an item with your camera, and we'll show you how well it works with clothes you already own.",
      },
      {
        id: "setup-preferences",
        question: "How do I set up my style preferences?",
        answer:
          "When you first sign up, you'll go through a quick onboarding to select your style vibe (casual, minimal, office, etc.), preferred wardrobe colors, and fit preference. You can update these anytime from Profile > Your preferences.",
      },
      {
        id: "first-items",
        question: "How many wardrobe items should I add?",
        answer:
          "We recommend starting with 10-20 key pieces that represent your everyday style. Focus on basics like your favorite jeans, go-to tops, and frequently worn shoes. The more items you add, the more accurate your matches will be.",
      },
    ],
  },
  {
    id: "scanning",
    title: "Scanning Items",
    icon: <Camera size={20} color={colors.text.secondary} />,
    topics: [
      {
        id: "how-to-scan",
        question: "How do I scan an item?",
        answer:
          "Tap 'Scan & Match' on the home screen to open the camera. Point your camera at the clothing item and tap the capture button. You can also upload a photo from your gallery by tapping the image icon in the bottom left. The app will guide you with helpful tips while scanning.\n\nNote: A scan credit is used when you capture or select a photo and the AI analysis begins. Once analysis starts, the credit is consumed even if you navigate away before seeing results.",
      },
      {
        id: "scan-tips",
        question: "Tips for better scan results",
        answer:
          "For best results:\n\n• Lay flat or hang up the item for best visibility\n• Use good lighting - natural light works best to see colors accurately\n• Include the full item in frame - make sure nothing is cut off\n• Use plain backgrounds - avoid busy patterns or cluttered surfaces\n• Hold the camera steady when capturing\n\nThe camera screen shows rotating tips to help guide you through each scan.",
      },
      {
        id: "scan-issues",
        question: "Why isn't my scan working?",
        answer:
          "If scanning isn't working:\n\n• Check camera permissions - Go to Settings and ensure Scan & Match has camera access\n• Improve lighting - Move to a brighter area or use natural light\n• Try a plain background - Hang the item or lay it on a solid-colored surface\n• Clean your camera lens\n• Use the gallery option - Tap the image icon to upload a photo instead of using live camera",
      },
    ],
  },
  {
    id: "wardrobe",
    title: "Your Wardrobe",
    icon: <Shirt size={20} color={colors.text.secondary} />,
    topics: [
      {
        id: "add-items",
        question: "How do I add items to my wardrobe?",
        answer:
          "Tap 'Build Wardrobe' on the home screen to scan and add items. Take a photo or choose from your gallery. The app will automatically detect the category and colors, but you can adjust these manually before saving.\n\nNote: A wardrobe add credit is used when you capture or select a photo and the AI analysis begins – not when you save the item. Once analysis starts, the credit is consumed even if you navigate away or the app closes.",
      },
      {
        id: "edit-items",
        question: "How do I edit or remove wardrobe items?",
        answer:
          "Go to the Wardrobe tab and tap on any item to view its details. From there, you can edit the category, colors, style tags, and brand. To remove an item, long-press on it in the grid to show the delete confirmation, then tap 'Remove'.",
      },
      {
        id: "categories",
        question: "What categories are available?",
        answer:
          "Scan & Match supports 8 categories: Tops, Bottoms, Skirts, Dresses, Outerwear, Shoes, Bags, and Accessories. Categorizing your items correctly helps improve match accuracy.",
      },
      {
        id: "cloud-sync",
        question: "How does wardrobe syncing work?",
        answer:
          "Uploads happen while Scan & Match is open. If needed, we'll finish syncing next time you open it. Your wardrobe items are saved locally first for instant access, then synced to the cloud in the background so they're available on all your devices.",
      },
      {
        id: "sync-status",
        question: "What do the sync status badges mean?",
        answer:
          "You may see small badges on your wardrobe items indicating sync status:\n\n• \"Syncing\" – The item is saved locally and uploading to the cloud. This happens automatically in the background.\n\n• \"Retry\" – The upload failed after multiple attempts. Tap the badge to try again. This can happen with poor network connection.\n\n• \"Retrying…\" – A retry is in progress.\n\nOnce synced, the badge disappears and your item is safely backed up to the cloud.",
      },
      {
        id: "sync-failed",
        question: "What if syncing fails?",
        answer:
          "If you see a red \"Retry\" badge on an item, the upload failed - usually due to network issues. Simply tap the badge to retry. Your item is still safely saved on your device and will work normally for matching. Syncing only affects whether the item appears on other devices logged into your account.",
      },
    ],
  },
  {
    id: "results",
    title: "Match Results",
    icon: <BarChart3 size={20} color={colors.text.secondary} />,
    topics: [
      {
        id: "matches-section",
        question: "What is the 'Matches from your wardrobe' section?",
        answer:
          "This section shows specific items from your wardrobe that pair well with the scanned item. Tap on any match to see why it works and get styling suggestions.",
      },
      {
        id: "close-matches-section",
        question: "What is the 'Close matches from your wardrobe' section?",
        answer:
          "Close matches are items from your wardrobe that could work with the scanned item with some thoughtful styling. They might not be perfect matches, but they're worth considering if you're willing to put a bit more effort into the outfit. These appear in the 'Worth trying' tab.",
      },
      {
        id: "need-tweaks-badge",
        question: "What does the 'Need tweaks' badge mean?",
        answer:
          "The 'Need tweaks' badge appears on matches that could work but might need some extra styling attention - like adding a layer, adjusting proportions, or choosing the right accessories. These matches have potential but aren't quite effortless pairings.",
      },
      {
        id: "optional-add-ons",
        question: "What are 'Optional add-ons'?",
        answer:
          "Optional add-ons are items like outerwear, bags, and accessories that can enhance your outfit but aren't required for it to work. These pieces add a finishing touch or extra layer when needed, but the core outfit stands on its own without them.",
      },
      {
        id: "outfit-sections",
        question: "How are the Outfits sections built?",
        answer:
          "The Outfits sections on both 'Wear now' and 'Worth trying' tabs show complete outfit combinations built from your wardrobe items that work with the scanned item. Scan & Match analyzes your wardrobe and automatically creates outfit pairings based on color harmony, style compatibility, and how well pieces work together. Each outfit shows the essential items plus any optional add-ons that enhance the look.",
      },
      {
        id: "suggestions",
        question: "What are the styling suggestions?",
        answer:
          "When we can't find perfect matches, we provide styling suggestions - tips on how you might make the item work, or what types of pieces would complement it. These help you understand the item's styling potential.",
      },
    ],
  },
  {
    id: "saved",
    title: "Saved Scans",
    icon: <Bookmark size={20} color={colors.text.secondary} />,
    topics: [
      {
        id: "save-item",
        question: "How do I save a scan for later?",
        answer:
          "After scanning an item, tap the bookmark icon at the top right of the results screen. When saved, the bookmark will fill in with a checkmark. This saves the scan to your Saved tab so you can revisit it when making a purchase decision.",
      },
      {
        id: "view-saved",
        question: "Where can I find my saved scans?",
        answer:
          "Go to the Saved tab (bookmark icon) in the bottom navigation. Here you'll see all scans you've saved, organized by when you scanned them. Tap any scan to see its full match results again.",
      },
      {
        id: "remove-saved",
        question: "How do I remove a saved scan?",
        answer:
          "Long-press on any scan in the Saved tab to show the delete confirmation. Tap 'Remove' to delete it. You can also unsave a scan by tapping the filled bookmark icon at the top of the results screen.",
      },
      {
        id: "auto-cleanup",
        question: "What happens to unsaved scans?",
        answer:
          "To keep your scan history manageable, Scan & Match automatically cleans up unsaved scans in two ways: 1) We keep only your 20 most recent unsaved scans - older ones are removed when you add new scans. 2) Unsaved scans older than 14 days are automatically deleted. Saved scans are never automatically removed and don't count toward the 20-scan limit.",
      },
      {
        id: "all-scans-limits",
        question: "What are the limits on the All scans page?",
        answer:
          "The All scans page shows both your saved scans (unlimited, never auto-deleted) and up to 20 unsaved scans. Once you have 20 unsaved scans, adding a new scan will automatically remove your oldest unsaved scan. To keep a scan permanently, tap the bookmark icon on the results screen.",
      },
      {
        id: "saved-scan-sync",
        question: "How does syncing work for saved scans?",
        answer:
          "When you save a scan, the image is stored locally on your device for instant access. In the background, we upload it to the cloud so it's available on all your devices. Syncing happens while the app is open. If needed, we'll finish syncing next time you open Scan & Match.",
      },
      {
        id: "saved-scan-badges",
        question: "What do the badges on my saved scans mean?",
        answer:
          "You may see small badges on your saved scans indicating sync status:\n\n• \"Syncing\" – The scan is saved locally and uploading to the cloud.\n\n• \"Retry\" – The upload failed after multiple attempts. Tap the badge to try again.\n\n• \"Retrying…\" – A retry is in progress.\n\nOnce synced, the badge disappears and your scan is backed up to the cloud.",
      },
    ],
  },
  {
    id: "subscription",
    title: "Subscription & Billing",
    icon: <Crown size={20} color={colors.text.secondary} />,
    topics: [
      {
        id: "plans",
        question: "What subscription plans are available?",
        answer:
          "Scan & Match offers two Pro plans: Monthly ($5.99/month) and Annual ($39.99/year, save 44%). The free plan includes 15 wardrobe adds and 10 in-store scans. Pro members get unlimited access to all features with no restrictions.",
      },
      {
        id: "how-credits-work",
        question: "How do scan and wardrobe add credits work?",
        answer:
          "On the free plan, you have 10 scan credits and 15 wardrobe add credits. Credits are consumed the moment you capture or select a photo – when our AI starts analyzing the image.\n\nImportant: Once analysis begins, the credit is used regardless of what happens next. This includes:\n• Navigating away or closing the app mid-analysis\n• Network issues interrupting the process\n• Choosing not to save the result\n\nThis is because the AI analysis runs immediately when you take the photo, and that's what costs us to provide. Think of it like taking a professional photo – even if you don't keep the photo, the photographer still took the shot.\n\nPro members have unlimited scans and adds with no credit limits.",
      },
      {
        id: "see-remaining-credits",
        question: "Where can I see my remaining credits?",
        answer:
          "You can see your remaining credits on your Profile page, right below your email. It shows how many wardrobe adds and scans you have left (e.g., \"12/15 wardrobe adds • 7/10 scans\"). Tap the ℹ️ icon next to the credits for more information about how they work.",
      },
      {
        id: "credits-across-devices",
        question: "Do my credits sync across devices?",
        answer:
          "Yes! Your credits are tied to your account, not your device. If you log in on a different phone or tablet, you'll see the same remaining credits. This also means you can't get extra free credits by reinstalling the app or using a different device.",
      },
      {
        id: "credit-not-restored",
        question: "Why wasn't my credit restored when I deleted an item or cancelled?",
        answer:
          "Credits are consumed the moment the AI analysis begins – when you capture or select a photo. Since the analysis runs immediately (which is what costs us to provide), credits can't be restored if you:\n\n• Delete the item later\n• Navigate away during analysis\n• Close the app mid-scan\n• Choose not to save the result\n\nTo avoid accidentally using credits, make sure you're ready to complete the scan before capturing your photo.",
      },
      {
        id: "get-more-credits",
        question: "Can I get more free credits?",
        answer:
          "Free credits are a one-time allowance to try the app. Once you've used them, you'll need to upgrade to Pro for unlimited scans and wardrobe adds. Pro membership also includes all future features at no extra cost.",
      },
      {
        id: "free-trial",
        question: "Is there a free trial?",
        answer:
          "Yes! The annual plan includes a 7-day free trial. You can explore all Pro features risk-free. Cancel anytime during the trial period and you won't be charged.",
      },
      {
        id: "cancel-subscription",
        question: "How do I cancel my subscription?",
        answer:
          "To cancel your subscription:\n\niOS: Settings → [Your Name] → Subscriptions → Scan & Match → Cancel Subscription\n\nAndroid: Google Play Store → Menu → Subscriptions → Scan & Match → Cancel Subscription\n\nYour subscription will remain active until the end of the current billing period.",
      },
      {
        id: "refund-policy",
        question: "What is your refund policy?",
        answer:
          "We offer full refunds if you cancel within 24 hours of your initial purchase. After 24 hours, no refunds are available. To request a refund within the 24-hour window, cancel your subscription and contact us at snaptomatch@gmail.com with your purchase details. We'll process your refund within 3-5 business days.",
      },
      {
        id: "billing-cycle",
        question: "When will I be charged?",
        answer:
          "For monthly subscriptions, you'll be charged on the same day each month. For annual subscriptions, you'll be charged once per year on your subscription anniversary. If you're on a free trial, you won't be charged until the trial period ends unless you cancel before then.",
      },
      {
        id: "change-plan",
        question: "Can I change my plan?",
        answer:
          "Yes! To switch between monthly and annual plans, cancel your current subscription and subscribe to the new plan. Your current subscription will remain active until the end of the billing period, then the new plan will take effect.",
      },
    ],
  },
  {
    id: "account",
    title: "Account & Settings",
    icon: <Settings size={20} color={colors.text.secondary} />,
    topics: [
      {
        id: "update-preferences",
        question: "How do I update my style preferences?",
        answer:
          "Go to Profile > Your preferences. Here you can update your style vibes, wardrobe color palette, and fit preference. Changes take effect immediately and may affect future match results.",
      },
      {
        id: "store-preferences",
        question: "What are store preferences?",
        answer:
          "Store preferences let you select your favorite stores (up to 5) where you like to shop. You can manage your selections from Profile > Your preferences > Store preferences, or directly from the results screen on both tabs. In future updates, we'll use these preferences to show you personalized shopping suggestions from your preferred stores based on your match results.",
      },
      {
        id: "change-password",
        question: "How do I change my password?",
        answer:
          "Go to Profile > Change password. Enter your current password and then your new password twice to confirm. Your new password must be at least 8 characters long.",
      },
      {
        id: "delete-account",
        question: "How do I delete my account?",
        answer:
          "Go to Profile > Your preferences > Delete account. This will permanently delete your account and all associated data including your wardrobe items, preferences, and scan history. This action cannot be undone.",
      },
    ],
  },
];

function TopicItem({ topic, isExpanded, onToggle }: { topic: HelpTopic; isExpanded: boolean; onToggle: () => void }) {
  return (
    <View>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onToggle();
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: spacing.sm + 6,
          paddingHorizontal: spacing.md,
        }}
      >
          <Text
            style={{
              flex: 1,
              ...typography.ui.body,
              color: colors.text.primary,
            }}
          >
            {topic.question}
          </Text>
        {isExpanded ? (
          <ChevronUp size={18} color={colors.text.tertiary} strokeWidth={1.5} />
        ) : (
          <ChevronDown size={18} color={colors.text.tertiary} strokeWidth={1.5} />
        )}
      </Pressable>
      {isExpanded && (
        <View
          style={{
            paddingHorizontal: spacing.md,
            paddingBottom: spacing.sm + 6,
          }}
        >
          <Text
            style={{
              ...typography.ui.body,
              color: colors.text.secondary,
              flexShrink: 1,
            }}
          >
            {topic.answer}
          </Text>
        </View>
      )}
    </View>
  );
}

function SectionCard({ section, index }: { section: HelpSection; index: number }) {
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

  const toggleTopic = (topicId: string) => {
    setExpandedTopics((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(topicId)) {
        newSet.delete(topicId);
      } else {
        newSet.add(topicId);
      }
      return newSet;
    });
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(100 + index * 50).springify()}
      style={{ marginBottom: spacing.md }}
    >
      <View
        style={{
          backgroundColor: colors.bg.elevated,
          borderWidth: 1.5,
          borderColor: colors.border.subtle,
          borderRadius: borderRadius.card,
        }}
      >
        {/* Section Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: spacing.md,
            borderBottomWidth: 0.5,
            borderBottomColor: colors.border.hairline,
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
              marginRight: spacing.sm,
            }}
          >
            {section.icon}
          </View>
          <Text
            style={{
              ...typography.ui.sectionTitle,
              color: colors.text.primary,
            }}
          >
            {section.title}
          </Text>
        </View>

        {/* Topics */}
        {section.topics.map((topic, topicIndex) => (
          <View key={topic.id}>
            {topicIndex > 0 && (
              <View
                style={{
                  height: 0.5,
                  backgroundColor: colors.border.hairline,
                  marginHorizontal: spacing.md,
                }}
              />
            )}
            <TopicItem
              topic={topic}
              isExpanded={expandedTopics.has(topic.id)}
              onToggle={() => toggleTopic(topic.id)}
            />
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

export default function HelpCenterScreen() {
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
            Help Center
          </Text>
        </View>

        {/* Separator line */}
        <View style={{ marginHorizontal: spacing.lg, height: 0.5, backgroundColor: colors.border.hairline }} />

        {/* Content */}
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
            paddingBottom: spacing.xl * 2,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Intro */}
          <Animated.View
            entering={FadeInDown.delay(50).springify()}
            style={{ marginBottom: spacing.lg }}
          >
            <Text
              style={{
                ...typography.ui.body,
                color: colors.text.secondary,
              }}
            >
              Find answers to common questions about using Scan & Match. Tap on any topic to learn more.
            </Text>
          </Animated.View>

          {/* Sections */}
          {HELP_SECTIONS.map((section, index) => (
            <SectionCard key={section.id} section={section} index={index} />
          ))}

          {/* Contact Support */}
          <Animated.View
            entering={FadeInDown.delay(400).springify()}
            style={{
              marginTop: spacing.lg,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                ...typography.ui.body,
                color: colors.text.tertiary,
                textAlign: "center",
                marginBottom: spacing.md,
              }}
            >
              Still need help?
            </Text>
            <Pressable
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const mailtoUrl = "mailto:snaptomatch@gmail.com?subject=Scan & Match Support";
                const canOpen = await Linking.canOpenURL(mailtoUrl);
                if (canOpen) {
                  await Linking.openURL(mailtoUrl);
                }
              }}
              style={({ pressed }) => ({
                opacity: pressed ? 0.7 : 1,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm + 4,
                borderRadius: button.radius,
                backgroundColor: colors.accent.terracottaLight,
                borderWidth: 0.5,
                borderColor: colors.accent.terracottaLight,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
                <Mail size={17} color={colors.accent.terracotta} strokeWidth={1.5} />
                <Text
                  style={{
                    ...typography.ui.bodyMedium,
                    color: colors.accent.terracotta,
                    marginLeft: spacing.sm,
                  }}
                >
                  Contact Support
                </Text>
              </View>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}


