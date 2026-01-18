import React from "react";
import { router } from "expo-router";

import AuthFlow from "@/components/AuthFlow";
import { useAuth } from "@/lib/auth-context";

export default function LoginScreen() {
  const { 
    signIn, 
    signUp, 
    signInWithOAuth, 
    signInWithGoogle,
    resetPassword, 
    signOut, 
    user, 
    isAppleAuthAvailable,
    isGoogleLoading,
    isAppleLoading,
    googleError,
    appleError,
  } = useAuth();

  const handleEmailSignIn = async (email: string, password: string) => {
    const { error } = await signIn(email, password);
    if (error) throw error;
    // Navigation is handled by AuthGuard after successful sign in
  };

  const handleEmailSignUp = async (email: string, password: string) => {
    const { error } = await signUp(email, password);
    if (error) throw error;
    // Don't navigate - AuthFlow will show "check email" screen
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    const { error } = await signInWithOAuth(provider);
    if (error) throw error;
    // Navigation is handled by AuthGuard after successful sign in
  };

  const handleGoogleSignIn = () => {
    console.log("[Login] handleGoogleSignIn triggered");
    signInWithGoogle();
    // Navigation is handled by AuthGuard after successful sign in
  };

  const handleResetPassword = async (email: string) => {
    const { error } = await resetPassword(email);
    if (error) throw error;
    // Don't navigate - AuthFlow will show "check email" screen
  };

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <AuthFlow
      onEmailSignIn={handleEmailSignIn}
      onEmailSignUp={handleEmailSignUp}
      onOAuth={handleOAuth}
      onGoogleSignIn={handleGoogleSignIn}
      onResetPassword={handleResetPassword}
      onLogout={handleLogout}
      isAuthed={!!user}
      isAppleAuthAvailable={isAppleAuthAvailable}
      isGoogleLoading={isGoogleLoading}
      isAppleLoading={isAppleLoading}
      googleError={googleError}
      appleError={appleError}
    />
  );
}
