import { useAuth, useSignIn } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function Page() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const [emailAddress, setEmailAddress] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  // Redirect if already signed in
  React.useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/(app)");
    }
  }, [isLoaded, isSignedIn, router]);

  // Handle the submission of the sign-in form
  const onSignInPress = async () => {
    if (!isLoaded || isLoading) return;

    setIsLoading(true);

    // Start the sign-in process using the email and password provided
    try {
      const signInAttempt = await signIn.create({
        identifier: emailAddress,
        password,
      });

      // If sign-in process is complete, set the created session as active
      // and redirect the user
      if (signInAttempt.status === "complete") {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace("/(app)");
      } else {
        // If the status isn't complete, check why. User might need to
        // complete further steps.
        console.error(JSON.stringify(signInAttempt, null, 2));
      }
    } catch (err) {
      // See https://clerk.com/docs/custom-flows/error-handling
      // for more info on error handling
      console.error(JSON.stringify(err, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

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
              <Ionicons name="mail" size={32} color="white" />
            </View>
            <View className="space-y-2">
              <Text className="text-4xl font-bold text-center text-gray-900">
                Welcome back
              </Text>
              <Text className="text-center text-gray-600 text-lg">
                Sign in to your account to continue
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
                    onChangeText={(emailAddress) =>
                      setEmailAddress(emailAddress)
                    }
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
                    placeholder="Enter your password"
                    secureTextEntry={true}
                    onChangeText={(password) => setPassword(password)}
                    className="w-full px-12 py-4 border-2 border-gray-200 rounded-xl text-gray-900 bg-white shadow-sm focus:border-purple-500 focus:border-2"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              onPress={onSignInPress}
              disabled={isLoading}
              className={`w-full py-4 rounded-xl shadow-lg ${
                isLoading
                  ? "bg-gray-400"
                  : "bg-gradient-to-r from-purple-600 to-blue-600"
              }`}
            >
              <View className="flex-row items-center justify-center space-x-2">
                {isLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="log-in-outline" size={20} color="white" />
                )}
                <Text className="text-white text-center font-bold text-lg">
                  {isLoading ? "Signing In..." : "Sign In"}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Sign Up Link */}
            <View className="flex-row justify-center space-x-1 pt-4">
              <Text className="text-gray-600 text-base">
                Don&apos;t have an account?
              </Text>
              <Link
                href="../sign-up"
                className="text-purple-600 font-bold text-base"
              >
                Sign up
              </Link>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
