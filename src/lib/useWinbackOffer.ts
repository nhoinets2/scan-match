/**
 * useWinbackOffer Hook
 * 
 * Detects when user should see the winback retention offer.
 * Shows once when user opens app after cancelling their subscription.
 */

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { shouldShowWinbackOffer } from "@/lib/subscription-sync";

export function useWinbackOffer() {
  const { user } = useAuth();
  const [showWinback, setShowWinback] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkWinbackStatus() {
      if (!user?.id) {
        setIsChecking(false);
        return;
      }

      try {
        const shouldShow = await shouldShowWinbackOffer(user.id);
        
        if (mounted) {
          setShowWinback(shouldShow);
          setIsChecking(false);
        }
      } catch (error) {
        console.error("[Winback Hook] Error checking status:", error);
        if (mounted) {
          setIsChecking(false);
        }
      }
    }

    // Check on mount and when user changes
    checkWinbackStatus();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const hideWinback = () => {
    setShowWinback(false);
  };

  return {
    showWinback,
    hideWinback,
    isChecking,
    userId: user?.id || "",
  };
}

