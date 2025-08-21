import { useAuth } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";
import "./global.css";

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();

  // Show loading state while Clerk is initializing
  if (!isLoaded) {
    return null;
  }
  console.log("Auth state - isSignedIn:", isSignedIn, "isLoaded:", isLoaded);

  // Redirect based on authentication state
  if (isSignedIn) {
    console.log("User is signed in, redirecting to app");
    return <Redirect href="/(app)" />;
  } else {
    console.log("User is not signed in, redirecting to sign-in");
    return <Redirect href="/(auth)/sign-in" />;
  }
}
