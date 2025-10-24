import { SignedIn, SignedOut, useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useFocusEffect, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";

import { AccountPanel } from "../(app)/_components/AccountPanel";

WebBrowser.maybeCompleteAuthSession();

type GoogleAccountProfile = {
  emailAddress?: string;
  email?: string;
  user?: {
    email?: string;
  };
  [key: string]: unknown;
};

export default function ConnectedAccounts() {
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [googleAccount, setGoogleAccount] =
    useState<GoogleAccountProfile | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

  const handleGoBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(app)/settings");
    }
  }, [router]);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const fetchGoogleStatus = useCallback(async () => {
    setIsChecking(true);
    setErrorMessage(null);

    const token = await getTokenRef.current();
    if (!token) {
      setGoogleAccount(null);
      setIsChecking(false);
      setErrorMessage("You must be signed in to manage Google access.");
      return;
    }

    if (!baseUrl) {
      setGoogleAccount(null);
      setIsChecking(false);
      setErrorMessage("Missing API base URL. Check your app configuration.");
      return;
    }

    try {
      const apiUrl = `${baseUrl}/me`;
      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache",
        },
      });

      const responseText = await response.text();
      console.log("Google Account Response:", response.status, responseText);

      let data:
        | GoogleAccountProfile
        | { error?: string; message?: string }
        | null = null;

      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.warn("Failed to parse Google account JSON:", parseError);
          data = null;
        }
      }

      if (response.ok && data && typeof data === "object" && !("error" in data)) {
        setGoogleAccount(data as GoogleAccountProfile);
        setErrorMessage(null);
      } else {
        setGoogleAccount(null);

        const fallbackMessage =
          response.status === 404
            ? "No Google account connected yet."
            : "Failed to retrieve Google account status.";

        const detailedMessage =
          (data &&
            typeof data === "object" &&
            "error" in data &&
            typeof data.error === "string" &&
            data.error) ||
          (data &&
            typeof data === "object" &&
            "message" in data &&
            typeof data.message === "string" &&
            data.message) ||
          fallbackMessage;

        setErrorMessage(detailedMessage);
      }
    } catch (error) {
      console.error("Failed to check Google connection:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not check Google connection."
      );
      setGoogleAccount(null);
    } finally {
      setIsChecking(false);
    }
  }, [baseUrl]);

  useFocusEffect(
    useCallback(() => {
      void fetchGoogleStatus();
      return undefined;
    }, [fetchGoogleStatus])
  );

  const handleConnect = useCallback(async () => {
    if (isConnecting) {
      return;
    }

    const tokenGetter = getTokenRef.current;
    const token = tokenGetter ? await tokenGetter() : null;
    if (!token) {
      Alert.alert("Error", "You must be signed in to connect Google.");
      return;
    }

    if (!baseUrl) {
      Alert.alert(
        "Error",
        "Missing API base URL. Check your app configuration."
      );
      return;
    }

    setIsConnecting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${baseUrl}/auth/google/url`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const responseData = await response
        .json()
        .catch(() => ({ message: "Failed to get Google authentication URL." }));

      if (!response.ok) {
        const message =
          (responseData &&
            typeof responseData === "object" &&
            "message" in responseData &&
            typeof responseData.message === "string" &&
            responseData.message) ||
          "Failed to get Google authentication URL.";
        throw new Error(message);
      }

      const { authUrl } = responseData as { authUrl: string };
      const returnUrl = Linking.createURL("/settings/accounts");

      const result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl);

      if (result.type === "success" || result.type === "dismiss") {
        Alert.alert(
          "Connected",
          "Your Google account has been linked successfully."
        );
      } else if (result.type === "cancel") {
        Alert.alert("Cancelled", "Google connection was cancelled.");
      }
    } catch (error) {
      console.error("Google connect error:", error);
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Could not connect Google."
      );
    } finally {
      setIsConnecting(false);
      await fetchGoogleStatus();
    }
  }, [baseUrl, fetchGoogleStatus, isConnecting]);

  const handleDisconnect = useCallback(() => {
    if (isDisconnecting) {
      return;
    }

    if (!baseUrl) {
      Alert.alert(
        "Error",
        "Missing API base URL. Check your app configuration."
      );
      return;
    }

    Alert.alert(
      "Disconnect Google",
      "CalMail will lose access to Gmail and Calendar. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            const tokenGetter = getTokenRef.current;
            const token = tokenGetter ? await tokenGetter() : null;
            if (!token) {
              Alert.alert(
                "Error",
                "You must be signed in to disconnect Google."
              );
              return;
            }

            setIsDisconnecting(true);
            setErrorMessage(null);

            try {
              const response = await fetch(
                `${baseUrl}/auth/google/disconnect`,
                {
                  method: "DELETE",
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                }
              );

              const responseData = await response
                .json()
                .catch(() => ({
                  message: "Failed to disconnect Google account.",
                }));

              if (!response.ok) {
                const message =
                  (responseData &&
                    typeof responseData === "object" &&
                    "message" in responseData &&
                    typeof responseData.message === "string" &&
                    responseData.message) ||
                  "Failed to disconnect Google account.";
                throw new Error(message);
              }

              Alert.alert(
                "Disconnected",
                "Google account access has been revoked."
              );
            } catch (error) {
              console.error("Google disconnect error:", error);
              Alert.alert(
                "Error",
                error instanceof Error
                  ? error.message
                  : "Could not disconnect Google."
              );
            } finally {
              setIsDisconnecting(false);
              await fetchGoogleStatus();
            }
          },
        },
      ]
    );
  }, [baseUrl, fetchGoogleStatus, isDisconnecting]);

  return (
    <View className="flex-1 bg-white">
      <SignedIn>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingTop: 48, paddingBottom: 32 }}
        >
          <View className="px-6 space-y-6">
            <TouchableOpacity
              onPress={handleGoBack}
              className="self-start flex-row items-center px-3 py-1.5 rounded-full border border-gray-200"
            >
              <Ionicons name="chevron-back" size={16} color="#4b5563" />
              <Text className="ml-1.5 text-sm font-semibold text-gray-600">
                Back to Settings
              </Text>
            </TouchableOpacity>

            <View>
              <Text className="text-2xl font-semibold text-gray-900">
                Connected Accounts
              </Text>
              <Text className="text-sm text-gray-600 mt-2">
                Link your Google account so CalMail can send email and manage
                calendar events on your behalf.
              </Text>
            </View>

            {errorMessage ? (
              <View className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-2xl">
                <Text className="text-sm font-semibold text-rose-600">
                  {errorMessage}
                </Text>
                <Text className="text-xs text-rose-500 mt-1">
                  Try refreshing the status or reconnecting your account.
                </Text>
              </View>
            ) : null}

            <AccountPanel
              googleAccount={googleAccount}
              isChecking={isChecking}
              isConnecting={isConnecting}
              isDisconnecting={isDisconnecting}
              onConnect={() => {
                void handleConnect();
              }}
              onRefresh={() => {
                void fetchGoogleStatus();
              }}
              onDisconnect={handleDisconnect}
            />
          </View>
        </ScrollView>
      </SignedIn>

      <SignedOut>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-gray-600">
            Sign in to manage connected accounts.
          </Text>
        </View>
      </SignedOut>
    </View>
  );
}
