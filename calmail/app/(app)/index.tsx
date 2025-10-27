import { SignedIn, SignedOut, useAuth } from "@clerk/clerk-expo";
import { Audio } from "expo-av";
import { Link } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import "../global.css";

import {
  FileSystemUploadType,
  uploadAsync as fileSystemUploadAsync,
} from "expo-file-system/legacy";
import { CommandCard } from "./_components/CommandCard";
import { RecordButton } from "./_components/RecordButton";
import { EmailSummary, VoiceState } from "./_types";

type ActiveCommandStatus =
  | "pending"
  | "needs_confirm"
  | "acting"
  | "sent"
  | "cancelled"
  | "error";

type ActiveCommand = {
  id: string;
  transcript: string;
  intent?: string;
  entities?: Record<string, unknown>;
  confidence?: number;
  status: ActiveCommandStatus;
  source: "voice" | "text";
  nluPayload?: any;
  metaMessage?: string;
  emails?: EmailSummary[];
  speechSummary?: string;
  timestamp: number;
};

/*
 * AUDIO MODE LIFECYCLE:
 *
 * 1. RECORDING MODE (startRecording):
 *    - iOS: Uses PlayAndRecord category (allows mic capture)
 *    - Android: Recording enabled, speaker output
 *    - Audio may be quiet during this phase
 *
 * 2. PLAYBACK MODE (before TTS speech):
 *    - iOS: Switches to Playback category (routes to LOUDSPEAKER)
 *    - Android: Uses main speaker (NOT earpiece)
 *    - TTS audio plays loud and clear
 *
 * 3. This prevents the "phone call" sound issue where audio routes to earpiece
 */

const VOICE_STATE_UI: Record<
  VoiceState,
  {
    label: string;
    description: string;
  }
> = {
  idle: {
    label: "Ready",
    description: "Tap the mic or type to tell CalMail what to do.",
  },
  listening: {
    label: "Listening",
    description: "Speak naturally. Tap stop when you're done.",
  },
  thinking: {
    label: "Working",
    description: "Processing your request…",
  },
  acting: {
    label: "Executing",
    description: "Carrying out the command you approved.",
  },
  done: {
    label: "Done",
    description: "Review the draft below or start another command.",
  },
  error: {
    label: "Issue",
    description: "Something went wrong. Edit the draft or try again.",
  },
};

export default function Index() {
  const { getToken } = useAuth();

  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [perm, requestPerm] = Audio.usePermissions();
  const [inputText, setInputText] = useState("");

  // New state variables for confirmation flow
  const [isLoading, setIsLoading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [nluResult, setNluResult] = useState<any>(null);
  const [lastUploadResponse, setLastUploadResponse] = useState<any>(null);
  const spokenCommandIdRef = useRef<string | null>(null);
  const [currentCommand, setCurrentCommand] = useState<ActiveCommand | null>(
    null
  );
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (listening) {
      setVoiceState("listening");
      setErrorMessage(null);
      return;
    }

    if (isLoading && !currentCommand) {
      setVoiceState("thinking");
      return;
    }

    if (isLoading && currentCommand) {
      setVoiceState("acting");
      return;
    }

    if (currentCommand) {
      setVoiceState(currentCommand.status === "error" ? "error" : "done");
      return;
    }

    if (errorMessage) {
      setVoiceState("error");
      return;
    }

    setVoiceState("idle");
  }, [currentCommand, errorMessage, isLoading, listening]);

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  useEffect(() => {
    if (!currentCommand) {
      spokenCommandIdRef.current = null;
    }
  }, [currentCommand]);

  useEffect(() => {
    if (!currentCommand?.speechSummary) return;
    if (!["sent", "done"].includes(currentCommand.status)) return;
    if (spokenCommandIdRef.current === currentCommand.id) return;
    if (Platform.OS === "web") return;

    const speakWithLoudspeaker = async () => {
      try {
        // PLAYBACK MODE: Switch from recording to playback session
        // This routes audio to the LOUDSPEAKER instead of earpiece
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false, // iOS: Switch to Playback category (not PlayAndRecord)
          playsInSilentModeIOS: true, // iOS: Play even in silent mode
          staysActiveInBackground: false,
          shouldDuckAndroid: true, // Android: Lower other audio
          playThroughEarpieceAndroid: false, // Android: Use SPEAKER, not earpiece
        });

        Speech.stop();
        Speech.speak(currentCommand.speechSummary as any, { rate: 0.95 });
        spokenCommandIdRef.current = currentCommand.id;
      } catch (err) {
        console.warn("Speech playback failed", err);
      }
    };

    speakWithLoudspeaker();
  }, [currentCommand]);

  // Check Google account connection status using the /me endpoint
  // PHASE 1: UNDERSTAND (for text)
  async function handleTextCommand() {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    Speech.stop();
    spokenCommandIdRef.current = null;

    setIsLoading(true);
    let skipFinally = false;
    setTranscript("");
    setErrorMessage(null);
    setNluResult(null);
    setLastUploadResponse(null);

    if (currentCommand && currentCommand.status === "needs_confirm") {
      setCurrentCommand(null);
    }

    const token = await getToken();
    if (!token) {
      setIsLoading(false);
      Alert.alert("Error", "You must be signed in.");
      return;
    }

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

      const payload = result.nluResult ?? result.nlu ?? result;
      const intent = payload?.intent ?? payload?.type;
      const entities =
        (payload?.entities as Record<string, unknown> | undefined) ?? {};
      const confidence =
        typeof payload?.confidence === "number"
          ? payload.confidence
          : typeof payload?.confidenceScore === "number"
            ? payload.confidenceScore
            : undefined;
      const commandId = `text-${Date.now()}`;
      const requiresImmediateExecution = intent === "fetch_email";
      const commandStatus: ActiveCommandStatus = requiresImmediateExecution
        ? "acting"
        : "needs_confirm";

      const nextCommand: ActiveCommand = {
        id: commandId,
        transcript: trimmed,
        intent,
        entities,
        confidence,
        status: commandStatus,
        source: "text",
        nluPayload: payload,
        metaMessage: requiresImmediateExecution
          ? "Fetching emails..."
          : undefined,
        timestamp: Date.now(),
      };

      setCurrentCommand(nextCommand);
      setTranscript(trimmed);
      setNluResult(payload);
      setInputText(""); // Clear the input field

      if (requiresImmediateExecution) {
        skipFinally = true;
        await executeImmediateCommand(commandId, payload);
        return;
      }
    } catch (error: any) {
      console.error("Text command error:", error);
      setErrorMessage(error.message);
      Alert.alert("Error", error.message);
    } finally {
      if (!skipFinally) {
        setIsLoading(false);
      }
    }
  }

  // PHASE 1: UNDERSTAND (for voice)
  async function uploadRecording(uri: string) {
    Speech.stop();
    spokenCommandIdRef.current = null;
    setIsLoading(true);
    setTranscript("");
    setNluResult(null);
    setLastUploadResponse(null);
    setErrorMessage(null);
    const token = await getToken();
    if (!token) return;

    const apiUrl = `${process.env.EXPO_PUBLIC_API_BASE_URL}/transcribe`;
    console.log(`Uploading ${uri} to ${apiUrl}`);

    try {
      const response = await fileSystemUploadAsync(apiUrl, uri, {
        httpMethod: "POST",
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: "audio",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log("Upload response:", response.body);
      const result = JSON.parse(response.body);
      console.log("Parsed result:", result);

      const payload = result.nluResult ?? result.nlu ?? result;
      const resolvedTranscript =
        result.transcript ||
        result.text ||
        transcript ||
        "Voice command processed";
      const resolvedIntent = payload?.intent ?? payload?.type;
      const resolvedEntities =
        (payload?.entities as Record<string, unknown> | undefined) ?? {};
      const resolvedConfidence =
        typeof payload?.confidence === "number"
          ? payload.confidence
          : typeof payload?.confidenceScore === "number"
            ? payload.confidenceScore
            : undefined;
      const commandId = `voice-${Date.now()}`;
      const executionResult = result.executionResult ?? null;
      const emails = executionResult?.emails as EmailSummary[] | undefined;
      const isFetchEmails = resolvedIntent === "fetch_email";
      const speechSummary = isFetchEmails
        ? (executionResult?.speechSummary ??
          executionResult?.message ??
          undefined)
        : undefined;
      const commandStatus: ActiveCommandStatus = isFetchEmails
        ? "sent"
        : "needs_confirm";

      const nextCommand: ActiveCommand = {
        id: commandId,
        transcript: resolvedTranscript,
        intent: resolvedIntent,
        entities: resolvedEntities,
        confidence: resolvedConfidence,
        status: commandStatus,
        source: "voice",
        nluPayload: payload,
        metaMessage: executionResult?.message,
        emails,
        speechSummary,
        timestamp: Date.now(),
      };

      setCurrentCommand(nextCommand);
      setTranscript(resolvedTranscript);
      setNluResult(payload);
      setLastUploadResponse(isFetchEmails ? null : result);
    } catch (error: any) {
      console.error("Upload error:", error);
      setErrorMessage(error.message ?? "Failed to upload audio.");
      Alert.alert("Error", "Failed to upload audio.");
    } finally {
      setIsLoading(false);
    }
  }

  // PHASE 2: CONFIRM & EXECUTE
  async function handleConfirmCommand() {
    if (!currentCommand) return;
    const payload = currentCommand.nluPayload ?? nluResult;
    if (!payload) {
      Alert.alert("Error", "No command to execute yet.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    const token = await getToken();
    if (!token) {
      setIsLoading(false);
      Alert.alert("Error", "You must be signed in.");
      return;
    }

    setCurrentCommand((prev) =>
      prev ? { ...prev, status: "acting" as ActiveCommandStatus } : prev
    );

    try {
      if (lastUploadResponse && lastUploadResponse.executionResult) {
        const executionResult = lastUploadResponse.executionResult;
        const message =
          executionResult.message || "Command executed successfully";
        const isFetchIntent = currentCommand?.intent === "fetch_email";
        const isSendIntent = currentCommand?.intent === "send_email";
        const emails = isFetchIntent
          ? (executionResult?.emails as EmailSummary[] | undefined)
          : undefined;
        const speechSummary = isFetchIntent
          ? (executionResult?.speechSummary ??
            executionResult?.message ??
            message)
          : undefined;

        setCurrentCommand((prev) =>
          prev
            ? {
                ...prev,
                status: "sent",
                metaMessage: message,
                emails,
                speechSummary,
              }
            : prev
        );
        setLastUploadResponse(null);
        if (isSendIntent) {
          Alert.alert("Success", message);
        }
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
            body: JSON.stringify(payload),
          }
        );

        const result = await response.json();
        if (!response.ok)
          throw new Error(result.message || "Failed to execute command");

        const message = result.message || "Command executed successfully";
        const isSendIntent = payload?.intent === "send_email";
        const isFetchIntent = payload?.intent === "fetch_email";
        const emails = isFetchIntent
          ? ((result.emails ?? result.executionResult?.emails) as
              | EmailSummary[]
              | undefined)
          : undefined;
        const speechSummary = isFetchIntent
          ? (result.speechSummary ??
            result.executionResult?.speechSummary ??
            message)
          : undefined;

        setCurrentCommand((prev) =>
          prev
            ? {
                ...prev,
                status: "sent",
                metaMessage: message,
                emails,
                speechSummary,
              }
            : prev
        );

        setLastUploadResponse(null);
        if (isSendIntent) {
          Alert.alert("Success", message);
        }
      }
    } catch (error: any) {
      console.error("Command execution error:", error);
      Alert.alert("Error", error.message);
      setErrorMessage(error.message);
      setCurrentCommand((prev) =>
        prev
          ? {
              ...prev,
              status: "error",
              metaMessage: error.message,
            }
          : prev
      );
    } finally {
      setIsLoading(false);
      setNluResult(null);
      setLastUploadResponse(null);
    }
  }

  async function executeImmediateCommand(commandId: string, payload: any) {
    try {
      const token = await getToken();
      if (!token) {
        Alert.alert("Error", "You must be signed in.");
        setIsLoading(false);
        return;
      }

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_BASE_URL}/command`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Failed to execute command");
      }

      const message = result.message || "Command executed successfully";
      const isSendIntent = payload?.intent === "send_email";
      const isFetchIntent = payload?.intent === "fetch_email";
      const emails = (result.emails ?? result.executionResult?.emails) as
        | EmailSummary[]
        | undefined;
      const speechSummary = isFetchIntent
        ? (result.speechSummary ??
          result.executionResult?.speechSummary ??
          message)
        : undefined;

      setCurrentCommand((prev) =>
        prev && prev.id === commandId
          ? {
              ...prev,
              status: "sent",
              metaMessage: message,
              emails,
              speechSummary,
            }
          : prev
      );
      setLastUploadResponse(null);
      setErrorMessage(null);
      if (isSendIntent) {
        Alert.alert("Success", message);
      }
    } catch (error: any) {
      const message = error?.message || "Failed to execute command.";
      console.error("Immediate command error:", error);
      setErrorMessage(message);
      Alert.alert("Error", message);
      setCurrentCommand((prev) =>
        prev && prev.id === commandId
          ? {
              ...prev,
              status: "error",
              metaMessage: message,
            }
          : prev
      );
    } finally {
      setIsLoading(false);
    }
  }

  // Handlers for the other confirmation buttons
  function handleCancelCommand() {
    Speech.stop();
    spokenCommandIdRef.current = null;
    if (currentCommand) {
      setCurrentCommand(null);
    }
    setNluResult(null);
    setTranscript("");
    setLastUploadResponse(null);
  }

  function handleTryAgain() {
    Speech.stop();
    spokenCommandIdRef.current = null;
    if (currentCommand) {
      setInputText(currentCommand.transcript);
      setCurrentCommand(null);
    }
    setNluResult(null);
    setTranscript("");
    setLastUploadResponse(null);
  }

  async function startRecording() {
    Speech.stop();
    spokenCommandIdRef.current = null;
    if (!perm?.granted) {
      const res = await requestPerm();
      if (!res.granted) {
        return;
      }
    }

    if (currentCommand && currentCommand.status === "needs_confirm") {
      setCurrentCommand(null);
      setNluResult(null);
      setTranscript("");
    }

    // RECORDING MODE: Set up for microphone capture
    // iOS: Uses PlayAndRecord category (may route to earpiece during recording)
    // Android: Ensures recording is enabled
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      playThroughEarpieceAndroid: false, // Android: Don't route to earpiece even while recording
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
    if (uri) {
      // Call the new upload function after stopping
      await uploadRecording(uri);
    }
  }

  const voiceDisplay = VOICE_STATE_UI[voiceState];
  const activeTranscript = currentCommand?.transcript || transcript;

  return (
    <View className="flex-1 bg-gray-50">
      <SignedIn>
        <View className="flex-1">
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingTop: 64, paddingBottom: 220 }}
          >
            <View className="px-6 space-y-10">
              <View className="space-y-3">
                <Text className="text-lg font-semibold text-gray-900 text-center mb-4">
                  {voiceDisplay.description}
                </Text>
                {activeTranscript ? (
                  <View className="px-4 py-3 rounded-2xl bg-gray-100 border border-gray-200">
                    <Text className="text-xs uppercase tracking-wide font-semibold text-gray-500">
                      Latest
                    </Text>
                    <Text className="text-base text-gray-800 mt-1">
                      {activeTranscript}
                    </Text>
                  </View>
                ) : null}
              </View>

              {errorMessage ? (
                <View className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-2xl">
                  <Text className="text-sm font-semibold text-rose-600">
                    {errorMessage}
                  </Text>
                  <Text className="text-xs text-rose-500 mt-1">
                    Edit below or try again with the mic.
                  </Text>
                </View>
              ) : null}

              {currentCommand ? (
                <CommandCard
                  intent={currentCommand.intent}
                  transcript={currentCommand.transcript}
                  status={currentCommand.status}
                  entities={currentCommand.entities}
                  confidence={currentCommand.confidence}
                  source={currentCommand.source}
                  metaMessage={currentCommand.metaMessage}
                  timestamp={currentCommand.timestamp}
                  emails={currentCommand.emails}
                  footer={
                    currentCommand.status === "sent" ? (
                      <View className="flex-row gap-3">
                        <TouchableOpacity
                          onPress={handleTryAgain}
                          className="flex-1 py-3 rounded-xl border border-purple-200 items-center"
                        >
                          <Text className="text-purple-600 font-semibold">
                            Draft again
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={handleCancelCommand}
                          className="flex-1 py-3 rounded-xl border border-gray-200 items-center"
                        >
                          <Text className="text-gray-600 font-semibold">
                            Dismiss
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : currentCommand.intent === "send_email" ? (
                      <View className="flex-row gap-3">
                        <TouchableOpacity
                          onPress={handleConfirmCommand}
                          disabled={isLoading}
                          className={`flex-1 py-3 rounded-xl items-center ${
                            isLoading ? "bg-gray-200" : "bg-purple-600"
                          }`}
                        >
                          <Text className="text-white font-semibold">
                            {isLoading ? "Sending…" : "Send it"}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={handleTryAgain}
                          disabled={isLoading}
                          className="flex-1 py-3 rounded-xl border border-purple-200 items-center"
                        >
                          <Text className="text-purple-600 font-semibold">
                            Edit
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={handleCancelCommand}
                          disabled={isLoading}
                          className="flex-1 py-3 rounded-xl border border-gray-200 items-center"
                        >
                          <Text className="text-gray-600 font-semibold">
                            Cancel
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : currentCommand.status === "acting" ? (
                      <View className="flex-row items-center justify-center gap-2 py-3">
                        <ActivityIndicator size="small" color="#7c3aed" />
                        <Text className="text-sm font-semibold text-purple-600">
                          Fetching emails…
                        </Text>
                      </View>
                    ) : null
                  }
                />
              ) : (
                <View className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm">
                  <Text className="text-sm font-semibold text-gray-800">
                    Type a command
                  </Text>
                  <TextInput
                    placeholder="Send Alex the Friday brunch details"
                    placeholderTextColor="#9ca3af"
                    value={inputText}
                    onChangeText={setInputText}
                    editable={!isLoading}
                    multiline
                    numberOfLines={4}
                    className="mt-4 text-base text-gray-900"
                  />
                  <TouchableOpacity
                    onPress={handleTextCommand}
                    disabled={isLoading || !inputText.trim()}
                    className={`mt-4 py-3 rounded-xl items-center ${
                      isLoading || !inputText.trim()
                        ? "bg-gray-200"
                        : "bg-purple-600"
                    }`}
                  >
                    <Text className="text-white font-semibold">
                      {isLoading ? "Processing…" : "Submit"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>

          <View className="absolute inset-x-0 bottom-10 items-center">
            <RecordButton
              listening={listening}
              isLoading={isLoading}
              onPress={listening ? stopRecording : startRecording}
              onCancelListening={listening ? stopRecording : undefined}
              voiceState={voiceState}
              disabled={isLoading}
            />
          </View>
        </View>
      </SignedIn>

      <SignedOut>
        <View className="flex-1 justify-center items-center px-6 bg-gray-50">
          <View className="space-y-6 w-full max-w-sm">
            <View className="space-y-2">
              <Text className="text-3xl font-bold text-center text-gray-900">
                Welcome to CalMail
              </Text>
              <Text className="text-center text-gray-600">
                Your AI assistant for inbox and calendar.
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
