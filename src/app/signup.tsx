import { Redirect } from "expo-router";

// AuthFlow in login.tsx handles all auth screens (landing, login, signup, forgot, checkEmail)
// This redirect ensures any navigation to /signup goes to the unified auth flow
export default function SignUpScreen() {
  return <Redirect href="/login" />;
}
