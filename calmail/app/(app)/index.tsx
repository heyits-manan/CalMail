import { SignedIn, SignedOut, useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { Link } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import {
  Alert,
  AppState,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import "../global.css";

export default function Index() {
  const { user } = useUser();
  const { getToken } = useAuth();

  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [lastUri, setLastUri] = useState<string | null>(null);
  const [perm, requestPerm] = Audio.usePermissions();
  const [inputText, setInputText] = useState("");

  // New state variables for confirmation flow
  const [isLoading, setIsLoading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [nluResult, setNluResult] = useState<any>(null);
  const [lastUploadResponse, setLastUploadResponse] = useState<any>(null);

  // Google account connection status
  const [googleAccount, setGoogleAccount] = useState<any>(null);
  const [isCheckingGoogleStatus, setIsCheckingGoogleStatus] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);

  // Check Google account connection status using the /me endpoint
  async function checkGoogleConnection() {
    const token = await getToken();
    if (!token) {
      setIsCheckingGoogleStatus(false);
      return;
    }

    const apiUrl = `${process.env.EXPO_PUBLIC_API_BASE_URL}/me`;
    try {
      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log("Google connection response status:", response.status);

      if (response.ok) {
        const data = await response.json();
        console.log("Google connection data:", data);
        setGoogleAccount(data);
      } else {
        console.log("Google connection failed with status:", response.status);
        setGoogleAccount(null);
      }
    } catch (error: any) {
      console.error("Error checking Google connection:", error);
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        apiUrl: apiUrl,
      });
      setGoogleAccount(null);
    } finally {
      setIsCheckingGoogleStatus(false);
    }
  }

  // Check Google account status when component mounts and when app comes to foreground
  useEffect(() => {
    // Only run the check if the user is signed in
    if (user) {
      checkGoogleConnection();
    }

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      console.log("App state changed to:", nextAppState);
      if (nextAppState === "active") {
        // App has come to the foreground, refresh Google account status
        if (user) {
          console.log("App became active, refreshing Google connection status");
          // Add a small delay to ensure OAuth callback has been processed
          setTimeout(() => {
            checkGoogleConnection();
          }, 500);
        }
      }
    });

    return () => subscription?.remove();
  }, [user]); // Re-run this effect if the user object changes

  // Additional effect to handle OAuth completion more robustly
  useEffect(() => {
    if (isConnectingGoogle) {
      // When OAuth starts, set up a more aggressive refresh strategy
      const refreshInterval = setInterval(() => {
        if (user) {
          console.log("Periodic refresh during OAuth flow");
          checkGoogleConnection();
        }
      }, 2000); // Check every 2 seconds during OAuth

      // Clean up interval when OAuth completes
      return () => clearInterval(refreshInterval);
    }
  }, [isConnectingGoogle, user]);

  // PHASE 1: UNDERSTAND (for text)
  async function handleTextCommand() {
    if (!inputText.trim()) return;

    setIsLoading(true);
    setTranscript("");
    setNluResult(null);
    setLastUploadResponse(null);
    const token = await getToken();
    if (!token) return;

    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_BASE_URL}/process-text`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ command: inputText }),
        }
      );

      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Failed to process command");

      setTranscript(inputText); // For text, the transcript is just the input text
      setNluResult(result);
      setInputText(""); // Clear the input field
    } catch (error: any) {
      console.error("Text command error:", error);
      Alert.alert("Error", error.message);
    } finally {
      setIsLoading(false);
    }
  }

  // PHASE 1: UNDERSTAND (for voice)
  async function uploadRecording(uri: string) {
    setIsLoading(true);
    setTranscript("");
    setNluResult(null);
    setLastUploadResponse(null);
    const token = await getToken();
    if (!token) return;

    const apiUrl = `${process.env.EXPO_PUBLIC_API_BASE_URL}/transcribe`;
    console.log(`Uploading ${uri} to ${apiUrl}`);

    try {
      const response = await FileSystem.uploadAsync(apiUrl, uri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "audio",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log("Upload response:", response.body);
      const result = JSON.parse(response.body);
      console.log("Parsed result:", result);

      // Store the full response for potential execution result
      setLastUploadResponse(result);

      // Parse the backend response structure
      if (result.success && result.nluResult) {
        // Backend returns: { nluResult: {...}, executionResult: {...}, success: true }
        console.log("Using nluResult structure:", result.nluResult);
        setTranscript(result.transcript || "Voice command processed");
        setNluResult(result.nluResult);
      } else if (result.transcript && result.nlu) {
        // Alternative structure: { transcript: "...", nlu: {...} }
        console.log(
          "Using transcript/nlu structure:",
          result.transcript,
          result.nlu
        );
        setTranscript(result.transcript);
        setNluResult(result.nlu);
      } else {
        // Fallback: treat the whole response as NLU result
        console.log("Using fallback structure:", result);
        setTranscript("Voice command processed");
        setNluResult(result);
      }
    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert("Error", "Failed to upload audio.");
    } finally {
      setIsLoading(false);
    }
  }

  // PHASE 2: CONFIRM & EXECUTE
  async function handleConfirmCommand() {
    if (!nluResult) return;
    setIsLoading(true);
    const token = await getToken();
    if (!token) return;

    try {
      // Check if the command was already executed by the backend
      // (some backends might execute immediately and return results)
      if (lastUploadResponse && lastUploadResponse.executionResult) {
        const executionResult = lastUploadResponse.executionResult;
        Alert.alert(
          "Success",
          executionResult.message || "Command executed successfully"
        );
      } else {
        // Send to command endpoint for execution
        const response = await fetch(
          `${process.env.EXPO_PUBLIC_API_BASE_URL}/command`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(nluResult),
          }
        );

        const result = await response.json();
        if (!response.ok)
          throw new Error(result.message || "Failed to execute command");

        Alert.alert("Success", result.message);
      }
    } catch (error: any) {
      console.error("Command execution error:", error);
      Alert.alert("Error", error.message);
    } finally {
      setIsLoading(false);
      setNluResult(null); // Reset the state
      setTranscript("");
      setLastUploadResponse(null);
    }
  }

  // Handlers for the other confirmation buttons
  function handleCancelCommand() {
    setNluResult(null);
    setTranscript("");
    setLastUploadResponse(null);
  }

  function handleTryAgain() {
    setNluResult(null);
    setTranscript("");
    setLastUploadResponse(null);
    // Focus on text input for manual correction
    setInputText(transcript); // Pre-fill with the transcript so user can edit it
  }

  async function onConnectGoogleAccount() {
    if (isConnectingGoogle) return; // Prevent multiple taps

    const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
    const token = await getToken();
    if (!token) {
      Alert.alert("Error", "You must be signed in.");
      return;
    }

    setIsConnectingGoogle(true);

    try {
      // 1. First, make an authenticated API request to get the Google OAuth URL
      const response = await fetch(`${apiBaseUrl}/auth/google/url`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to get auth URL from server.");
      }

      const { authUrl } = await response.json();

      // 2. NOW, open the browser with the URL you received from the backend
      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        "calmail://"
      );

      // 3. Handle the OAuth result and automatically refresh status
      console.log("OAuth result:", result);

      if (result.type === "success") {
        // OAuth was successful, show success message with Done button
        Alert.alert(
          "Success!",
          "Your Google account has been connected successfully.",
          [
            {
              text: "Done",
              onPress: () => {
                // Automatically refresh the connection status
                checkGoogleConnection();
              },
            },
          ]
        );
      } else if (result.type === "cancel") {
        // User cancelled the OAuth flow
        console.log("OAuth was cancelled by user");
        // Still refresh to check if connection was successful (in case they completed it before cancelling)
        setTimeout(() => {
          checkGoogleConnection();
        }, 1000);
      } else {
        // Some other result type (like "dismiss")
        console.log("OAuth result type:", result.type);
        // Refresh to check if connection was successful
        setTimeout(() => {
          checkGoogleConnection();
        }, 1000);
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Could not connect to Google.");
    } finally {
      setIsConnectingGoogle(false);
    }
  }

  async function startRecording() {
    if (!perm?.granted) {
      const res = await requestPerm();
      if (!res.granted) {
        return;
      }
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const newRecording = new Audio.Recording();
    await newRecording.prepareToRecordAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    await newRecording.startAsync();
    setRecording(newRecording);
    setListening(true);
  }

  async function stopRecording() {
    if (!recording) return;

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();

    setRecording(null);
    setListening(false);
    setLastUri(uri);

    if (uri) {
      // Call the new upload function after stopping
      await uploadRecording(uri);
    }
  }

  return (
    <View className="flex-1 bg-white">
      <SignedIn>
        <View className="flex-1 px-6 pt-12">
          <View className="items-center mb-8">
            <Text className="text-2xl font-semibold text-gray-900">
              Hello {user?.emailAddresses[0].emailAddress}
            </Text>
            <Text className="text-gray-600 mt-2">
              {isLoading
                ? "Processing..."
                : listening
                  ? "Listening..."
                  : "Voice Assistant"}
            </Text>
          </View>

          <View className="pb-8 space-y-4">
            {/* Confirmation View - shown when there's a pending command */}
            {nluResult ? (
              <View className="p-4 border-2 border-purple-200 rounded-xl bg-purple-50">
                <Text className="text-gray-600 text-lg">I understood:</Text>
                <Text className="text-gray-900 font-semibold text-xl my-2">
                  "{transcript}"
                </Text>

                {/* Display the NLU result in a readable format */}
                <View className="mt-3 p-3 bg-white rounded-lg">
                  <Text className="text-gray-700 font-medium">
                    Intent: {nluResult.intent || "Unknown"}
                  </Text>
                  {nluResult.entities &&
                    Object.keys(nluResult.entities).length > 0 && (
                      <Text className="text-gray-600 mt-1">
                        Entities: {JSON.stringify(nluResult.entities, null, 2)}
                      </Text>
                    )}
                  {isLoading && (
                    <View className="mt-2 flex-row items-center">
                      <Ionicons name="hourglass" size={16} color="#6b7280" />
                      <Text className="text-gray-500 ml-2 text-sm">
                        Processing command...
                      </Text>
                    </View>
                  )}

                  {/* Show execution result if already executed by backend */}
                  {lastUploadResponse && lastUploadResponse.executionResult && (
                    <View className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                      <Text className="text-green-700 text-sm font-medium">
                        ✅ {lastUploadResponse.executionResult.message}
                      </Text>
                    </View>
                  )}
                </View>

                <View className="flex-row justify-between mt-4 space-x-2">
                  <TouchableOpacity
                    onPress={handleCancelCommand}
                    disabled={isLoading}
                    className="flex-1 bg-white border-2 border-gray-300 py-3 rounded-xl items-center"
                  >
                    <Text className="text-gray-700 font-semibold">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleTryAgain}
                    disabled={isLoading}
                    className="flex-1 bg-white border-2 border-gray-300 py-3 rounded-xl items-center"
                  >
                    <Text className="text-gray-700 font-semibold">
                      Try Again
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleConfirmCommand}
                    disabled={isLoading}
                    className={`flex-1 py-3 rounded-xl items-center ${
                      lastUploadResponse && lastUploadResponse.executionResult
                        ? "bg-green-600"
                        : "bg-purple-600"
                    }`}
                  >
                    <Text className="text-white font-semibold">
                      {isLoading
                        ? "Executing..."
                        : lastUploadResponse &&
                            lastUploadResponse.executionResult
                          ? "View Result"
                          : "Confirm"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* Input UI - shown when no pending command */
              <>
                <View className="flex-row items-center space-x-2">
                  <TextInput
                    placeholder="Or type your command..."
                    value={inputText}
                    onChangeText={setInputText}
                    className="flex-1 border-2 border-gray-300 rounded-xl p-4"
                    editable={!isLoading}
                  />
                  <TouchableOpacity
                    onPress={handleTextCommand}
                    disabled={isLoading}
                  >
                    <Ionicons name="send" size={28} color="#6d28d9" />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          <View className="flex-1 justify-center items-center">
            <View
              className={`h-32 w-32 rounded-full justify-center items-center ${
                listening
                  ? "bg-purple-100"
                  : isLoading
                    ? "bg-gray-200"
                    : "bg-gray-100"
              }`}
            >
              <Ionicons
                name={
                  listening ? "stop-circle" : isLoading ? "hourglass" : "mic"
                }
                size={64}
                color={isLoading ? "#9ca3af" : "#6d28d9"}
              />
            </View>
          </View>

          <View className="pb-8">
            <TouchableOpacity
              onPress={async () => {
                if (recording) {
                  await stopRecording();
                } else {
                  await startRecording();
                }
              }}
              disabled={isLoading}
              className={`py-4 rounded-xl items-center ${isLoading ? "bg-gray-400" : "bg-purple-600"}`}
            >
              <Text className="text-white text-lg font-semibold">
                {isLoading
                  ? "Processing..."
                  : listening
                    ? "Stop Listening"
                    : "Start Listening"}
              </Text>
            </TouchableOpacity>

            <View className="mt-4">
              {isCheckingGoogleStatus ? (
                <View className="bg-gray-100 py-4 rounded-xl items-center">
                  <Text className="text-gray-600 text-lg font-semibold">
                    Checking Google Account...
                  </Text>
                  <TouchableOpacity
                    onPress={checkGoogleConnection}
                    className="mt-3 bg-gray-200 border border-gray-300 py-2 px-4 rounded-lg"
                  >
                    <Text className="text-gray-700 text-sm font-medium">
                      Refresh
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : googleAccount ? (
                <View className="bg-green-50 border-2 border-green-600 py-4 rounded-xl items-center">
                  <View className="flex-row items-center space-x-2">
                    <Ionicons
                      name="checkmark-circle"
                      size={24}
                      color="#059669"
                    />
                    <Text className="text-green-700 text-lg font-semibold">
                      Google Account Connected
                    </Text>
                  </View>
                  <Text className="text-green-600 text-sm mt-1">
                    Connected as:{" "}
                    {googleAccount.emailAddress ||
                      googleAccount.email ||
                      "Google Account"}
                  </Text>
                  <Text className="text-green-600 text-xs mt-1">
                    You can now use voice commands for emails
                  </Text>
                  <View className="flex-row space-x-2 mt-3">
                    <TouchableOpacity
                      onPress={checkGoogleConnection}
                      disabled={isDisconnecting}
                      className={`flex-1 py-2 px-4 rounded-lg ${
                        isDisconnecting
                          ? "bg-gray-200 border border-gray-300"
                          : "bg-blue-100 border border-blue-300"
                      }`}
                    >
                      <Text
                        className={`text-sm font-medium ${
                          isDisconnecting ? "text-gray-500" : "text-blue-700"
                        }`}
                      >
                        Refresh
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        if (isDisconnecting) return; // Prevent multiple taps

                        try {
                          const token = await getToken();
                          if (!token) {
                            Alert.alert(
                              "Error",
                              "You must be signed in to disconnect"
                            );
                            return;
                          }

                          // Show confirmation dialog
                          Alert.alert(
                            "Disconnect Google Account",
                            "Are you sure you want to disconnect your Google account? This will remove access to your emails and calendar.",
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Disconnect",
                                style: "destructive",
                                onPress: async () => {
                                  setIsDisconnecting(true);
                                  try {
                                    const response = await fetch(
                                      `${process.env.EXPO_PUBLIC_API_BASE_URL}/auth/google/disconnect`,
                                      {
                                        method: "DELETE",
                                        headers: {
                                          Authorization: `Bearer ${token}`,
                                        },
                                      }
                                    );

                                    if (response.ok) {
                                      const result = await response.json();
                                      Alert.alert(
                                        "Success",
                                        result.message ||
                                          "Google account disconnected successfully"
                                      );
                                      // Refresh the connection status
                                      checkGoogleConnection();
                                    } else {
                                      const errorData = await response.json();
                                      throw new Error(
                                        errorData.message ||
                                          "Failed to disconnect Google account"
                                      );
                                    }
                                  } catch (error: any) {
                                    console.error("Disconnect error:", error);
                                    Alert.alert(
                                      "Error",
                                      error.message ||
                                        "Failed to disconnect Google account"
                                    );
                                  } finally {
                                    setIsDisconnecting(false);
                                  }
                                },
                              },
                            ]
                          );
                        } catch (error: any) {
                          console.error("Disconnect error:", error);
                          Alert.alert(
                            "Error",
                            "Failed to disconnect Google account"
                          );
                        }
                      }}
                      disabled={isDisconnecting}
                      className={`flex-1 py-2 px-4 rounded-lg ${
                        isDisconnecting
                          ? "bg-gray-200 border border-gray-300"
                          : "bg-red-100 border border-red-300"
                      }`}
                    >
                      {isDisconnecting ? (
                        <View className="flex-row items-center space-x-2">
                          <Ionicons
                            name="hourglass"
                            size={16}
                            color="#6b7280"
                          />
                          <Text className="text-gray-500 text-sm font-medium">
                            Disconnecting...
                          </Text>
                        </View>
                      ) : (
                        <Text className="text-red-700 text-sm font-medium">
                          Disconnect
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View className="space-y-3">
                  <TouchableOpacity
                    onPress={onConnectGoogleAccount}
                    disabled={isConnectingGoogle}
                    className={`py-4 rounded-xl items-center ${
                      isConnectingGoogle
                        ? "bg-gray-200 border-2 border-gray-400"
                        : "bg-white border-2 border-purple-600"
                    }`}
                  >
                    {isConnectingGoogle ? (
                      <View className="flex-row items-center space-x-2">
                        <Ionicons name="hourglass" size={20} color="#6b7280" />
                        <Text className="text-gray-600 text-lg font-semibold">
                          Connecting...
                        </Text>
                      </View>
                    ) : (
                      <Text className="text-purple-600 text-lg font-semibold">
                        Connect Google Account
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={checkGoogleConnection}
                    disabled={isConnectingGoogle}
                    className={`py-2 rounded-lg items-center ${
                      isConnectingGoogle
                        ? "bg-gray-200 border border-gray-400"
                        : "bg-gray-100 border border-gray-300"
                    }`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        isConnectingGoogle ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      Refresh Status
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {lastUri ? (
              <Text className="mt-4 text-gray-600 text-center">
                Saved recording: {lastUri}
              </Text>
            ) : null}
          </View>
        </View>
      </SignedIn>

      <SignedOut>
        <View className="flex-1 justify-center items-center px-6 bg-white">
          <View className="space-y-6 w-full max-w-sm">
            <View className="space-y-2">
              <Text className="text-3xl font-bold text-center text-gray-900">
                Welcome to CalMail
              </Text>
              <Text className="text-center text-gray-600">
                Your AI-powered voice assistant for email and calendar
                management
              </Text>
            </View>

            <View className="space-y-4">
              <Link href="../sign-in" asChild>
                <TouchableOpacity className="w-full bg-purple-600 py-4 rounded-xl">
                  <Text className="text-white text-center font-semibold text-lg">
                    Sign In
                  </Text>
                </TouchableOpacity>
              </Link>

              <Link href="../sign-up" asChild>
                <TouchableOpacity className="w-full bg-white border-2 border-purple-600 py-4 rounded-xl">
                  <Text className="text-purple-600 text-center font-semibold text-lg">
                    Create Account
                  </Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </View>
      </SignedOut>
    </View>
  );
}
