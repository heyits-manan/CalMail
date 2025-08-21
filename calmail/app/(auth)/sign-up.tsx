import { useAuth, useSignUp } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import * as React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function SignUpScreen() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const [emailAddress, setEmailAddress] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pendingVerification, setPendingVerification] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  // Redirect if already signed in
  React.useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/(app)");
    }
  }, [isLoaded, isSignedIn, router]);

  // Handle submission of sign-up form
  const onSignUpPress = async () => {
    if (!isLoaded || isLoading) return;

    setIsLoading(true);

    // Start sign-up process using email and password provided
    try {
      await signUp.create({
        emailAddress,
        password,
      });

      // Send user an email with verification code
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });

      // Set 'pendingVerification' to true to display second form
      // and capture OTP code
      setPendingVerification(true);
    } catch (err) {
      // See https://clerk.com/docs/custom-flows/error-handling
      // for more info on error handling
      console.error(JSON.stringify(err, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle submission of verification form
  const onVerifyPress = async () => {
    if (!isLoaded || isLoading) return;

    setIsLoading(true);

    try {
      // Use the code the user provided to attempt verification
      const signUpAttempt = await signUp.attemptEmailAddressVerification({
        code,
      });

      // If verification was completed, set the session to active
      // and redirect the user
      if (signUpAttempt.status === "complete") {
        await setActive({ session: signUpAttempt.createdSessionId });
        router.replace("/(app)");
      } else {
        // If the status is not complete, check why. User may need to
        // complete further steps.
        console.error(JSON.stringify(signUpAttempt, null, 2));
      }
    } catch (err) {
      // See https://clerk.com/docs/custom-flows/error-handling
      // for more info on error handling
      console.error(JSON.stringify(err, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

  if (pendingVerification) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 bg-gradient-to-br from-blue-50 via-white to-purple-50"
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 24,
          }}
          showsVerticalScrollIndicator={false}
          className="flex-1"
        >
          <View className="space-y-8">
            {/* Header Section */}
            <View className="space-y-4 items-center">
              <View className="w-20 h-20 bg-gradient-to-br from-green-500 to-blue-600 rounded-2xl items-center justify-center shadow-lg">
                <Ionicons name="shield-checkmark" size={32} color="white" />
              </View>
              <View className="space-y-2">
                <Text className="text-4xl font-bold text-center text-gray-900">
                  Verify your email
                </Text>
                <Text className="text-center text-gray-600 text-lg">
                  Enter the verification code sent to your email
                </Text>
              </View>
            </View>

            {/* Verification Form */}
            <View className="space-y-6">
              <View className="space-y-2">
                <Text className="text-sm font-semibold text-gray-700 ml-1">
                  Verification Code
                </Text>
                <View className="relative">
                  <Ionicons
                    name="key-outline"
                    size={20}
                    color="#6B7280"
                    style={{
                      position: "absolute",
                      left: 16,
                      top: 18,
                      zIndex: 1,
                    }}
                  />
                  <TextInput
                    value={code}
                    placeholder="Enter your verification code"
                    onChangeText={(code) => setCode(code)}
                    className="w-full px-12 py-4 border-2 border-gray-200 rounded-xl text-gray-900 bg-white shadow-sm focus:border-green-500 focus:border-2 text-center text-2xl font-bold tracking-widest"
                    keyboardType="number-pad"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={onVerifyPress}
                disabled={isLoading}
                className={`w-full py-4 rounded-xl shadow-lg ${
                  isLoading
                    ? "bg-gray-400"
                    : "bg-gradient-to-r from-green-600 to-blue-600"
                }`}
              >
                <View className="flex-row items-center justify-center space-x-2">
                  {isLoading ? (
                    <View className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={20}
                      color="white"
                    />
                  )}
                  <Text className="text-white text-center font-bold text-lg">
                    {isLoading ? "Verifying..." : "Verify Email"}
                  </Text>
                </View>
              </TouchableOpacity>

              <View className="text-center">
                <Text className="text-gray-500 text-sm">
                  Didn't receive the code? Check your spam folder or
                </Text>
                <TouchableOpacity className="mt-2">
                  <Text className="text-green-600 font-semibold text-sm">
                    Resend code
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-gradient-to-br from-blue-50 via-white to-purple-50"
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: 24,
        }}
        showsVerticalScrollIndicator={false}
        className="flex-1"
      >
        <View className="space-y-8">
          {/* Header Section */}
          <View className="space-y-4 items-center">
            <View className="w-20 h-20 bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl items-center justify-center shadow-lg">
              <Ionicons name="person-add" size={32} color="white" />
            </View>
            <View className="space-y-2">
              <Text className="text-4xl font-bold text-center text-gray-900">
                Create account
              </Text>
              <Text className="text-center text-gray-600 text-lg">
                Sign up to get started with your journey
              </Text>
            </View>
          </View>

          {/* Form Section */}
          <View className="space-y-6">
            <View className="space-y-4">
              <View className="space-y-2">
                <Text className="text-sm font-semibold text-gray-700 ml-1">
                  Email Address
                </Text>
                <View className="relative">
                  <Ionicons
                    name="mail-outline"
                    size={20}
                    color="#6B7280"
                    style={{
                      position: "absolute",
                      left: 16,
                      top: 18,
                      zIndex: 1,
                    }}
                  />
                  <TextInput
                    autoCapitalize="none"
                    value={emailAddress}
                    placeholder="Enter your email address"
                    onChangeText={(email) => setEmailAddress(email)}
                    className="w-full px-12 py-4 border-2 border-gray-200 rounded-xl text-gray-900 bg-white shadow-sm focus:border-purple-500 focus:border-2"
                    keyboardType="email-address"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>

              <View className="space-y-2">
                <Text className="text-sm font-semibold text-gray-700 ml-1">
                  Password
                </Text>
                <View className="relative">
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color="#6B7280"
                    style={{
                      position: "absolute",
                      left: 16,
                      top: 18,
                      zIndex: 1,
                    }}
                  />
                  <TextInput
                    value={password}
                    placeholder="Create a strong password"
                    secureTextEntry={true}
                    onChangeText={(password) => setPassword(password)}
                    className="w-full px-12 py-4 border-2 border-gray-200 rounded-xl text-gray-900 bg-white shadow-sm focus:border-purple-500 focus:border-2"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <Text className="text-xs text-gray-500 ml-1">
                  Must be at least 8 characters long
                </Text>
              </View>
            </View>

            {/* Create Account Button */}
            <TouchableOpacity
              onPress={onSignUpPress}
              disabled={isLoading}
              className={`w-full py-4 rounded-xl shadow-lg ${
                isLoading
                  ? "bg-gray-400"
                  : "bg-gradient-to-r from-purple-600 to-blue-600"
              }`}
            >
              <View className="flex-row items-center justify-center space-x-2">
                {isLoading ? (
                  <View className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Ionicons name="person-add-outline" size={20} color="white" />
                )}
                <Text className="text-white text-center font-bold text-lg">
                  {isLoading ? "Creating Account..." : "Create Account"}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Terms and Sign In Link */}
            <View className="space-y-4">
              <Text className="text-center text-gray-500 text-xs px-4">
                By creating an account, you agree to our Terms of Service and
                Privacy Policy
              </Text>

              <View className="flex-row justify-center space-x-1">
                <Text className="text-gray-600 text-base">
                  Already have an account?
                </Text>
                <Link
                  href="../sign-in"
                  className="text-purple-600 font-bold text-base"
                >
                  Sign in
                </Link>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
