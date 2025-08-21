import { SignedIn, SignedOut, useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { Link } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import "../global.css";

export default function Index() {
  const { user } = useUser();
  const { getToken } = useAuth();

  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [lastUri, setLastUri] = useState<string | null>(null);
  const [perm, requestPerm] = Audio.usePermissions();
  const [inputText, setInputText] = useState("");

  async function handleTextCommand() {
    if (!inputText.trim()) {
      return; // Don't send empty messages
    }

    const token = await getToken();
    if (!token) return;

    try {
      // Step 1: Send the raw text to a new endpoint to get the NLU result
      const nluResponse = await fetch(
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

      const nluResult = await nluResponse.json();
      if (!nluResponse.ok)
        throw new Error(nluResult.error || "Failed to process command");

      setInputText(""); // Clear the input field

      // Step 2: Send the NLU result to the /command endpoint to be executed
      const commandResponse = await fetch(
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

      const commandResult = await commandResponse.json();
      if (!commandResponse.ok)
        throw new Error(commandResult.message || "Failed to execute command");

      // Step 3: Show the final result
      Alert.alert("Success", commandResult.message);
    } catch (error: any) {
      console.error("Text command error:", error);
      Alert.alert("Error", error.message);
    }
  }

  async function onConnectGoogleAccount() {
    const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
    const token = await getToken();
    if (!token) {
      Alert.alert("Error", "You must be signed in.");
      return;
    }

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
      await WebBrowser.openAuthSessionAsync(authUrl, "calmail://");
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Could not connect to Google.");
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

  async function uploadRecording(uri: string) {
    const token = await getToken();
    if (!token) return;

    const apiUrl = `${process.env.EXPO_PUBLIC_API_BASE_URL}/transcribe`;
    console.log(`Uploading ${uri} to ${apiUrl}`);

    try {
      const response = await FileSystem.uploadAsync(apiUrl, uri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "audio", // This name must match the one the backend expects
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log("Upload response:", response.body);
      Alert.alert("Success", "Audio uploaded successfully!");
    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert("Error", "Failed to upload audio.");
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
            <Text className="text-gray-600 mt-2">Voice Assistant</Text>
          </View>

          <View className="pb-8">
            {/* The new text input and send button */}
            <View className="flex-row items-center space-x-2">
              <TextInput
                placeholder="Or type your command..."
                value={inputText}
                onChangeText={setInputText}
                className="flex-1 border-2 border-gray-300 rounded-xl p-4"
              />
              <TouchableOpacity onPress={handleTextCommand}>
                <Ionicons name="send" size={28} color="#6d28d9" />
              </TouchableOpacity>
            </View>
          </View>

          <View className="flex-1 justify-center items-center">
            <View
              className={`h-32 w-32 rounded-full justify-center items-center ${
                listening ? "bg-purple-100" : "bg-gray-100"
              }`}
            >
              <Ionicons
                name={listening ? "stop-circle" : "mic"}
                size={64}
                color="#6d28d9"
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
              className="bg-purple-600 py-4 rounded-xl items-center"
            >
              <Text className="text-white text-lg font-semibold">
                {listening ? "Stop" : "Start"} Listening
              </Text>
            </TouchableOpacity>

            <View className="mt-4">
              <TouchableOpacity
                onPress={onConnectGoogleAccount}
                className="bg-white border-2 border-purple-600 py-4 rounded-xl items-center"
              >
                <Text className="text-purple-600 text-lg font-semibold">
                  Connect Google Account
                </Text>
              </TouchableOpacity>
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
