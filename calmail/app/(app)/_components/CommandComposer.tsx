import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
  ScrollView,
} from "react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CommandComposerProps {
  mode: "voice" | "text";
  onModeChange: (mode: "voice" | "text") => void;
  inputText: string;
  onInputTextChange: (value: string) => void;
  onSubmitText: () => void;
  transcript: string;
  nluResult: any;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onTryAgain: () => void;
  executionResultMessage?: string;
  listening: boolean;
}

export function CommandComposer({
  mode,
  onModeChange,
  inputText,
  onInputTextChange,
  onSubmitText,
  transcript,
  nluResult,
  isLoading,
  onConfirm,
  onCancel,
  onTryAgain,
  executionResultMessage,
  listening,
}: CommandComposerProps) {
  const [showDetails, setShowDetails] = useState(false);
  const isFetchIntent = nluResult?.intent === "fetch_email";
  const summaryTitle = isFetchIntent ? "Inbox request preview" : "Ready to send this?";
  const primaryActionLabel = isFetchIntent
    ? isLoading
      ? "Fetching"
      : "Fetch"
    : isLoading
      ? "Sending"
      : "Send";

  const handleToggleDetails = () => {
    LayoutAnimation.easeInEaseOut();
    setShowDetails((prev) => !prev);
  };

  const renderEntities = () => {
    if (!nluResult?.entities) return null;
    const entries = Object.entries(nluResult.entities as Record<string, unknown>);
    if (!entries.length) return null;

    return (
      <View className="flex-row flex-wrap mt-3 gap-2">
        {entries.map(([key, value]) => (
          <View
            key={key}
            className="px-3 py-2 rounded-full bg-purple-100 border border-purple-200"
          >
            <Text className="text-xs font-semibold text-purple-700">
              {key}: <Text className="font-medium text-purple-800">{String(value)}</Text>
            </Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View className="mb-8">
      <View className="flex-row bg-gray-100 p-1 rounded-full mb-4">
        {["voice", "text"].map((value) => {
          const isActive = mode === value;
          return (
            <TouchableOpacity
              key={value}
              onPress={() => onModeChange(value as "voice" | "text")}
              className={`flex-1 py-3 rounded-full items-center flex-row justify-center space-x-2 ${
                isActive ? "bg-white shadow-sm" : ""
              }`}
            >
              <Ionicons
                name={value === "voice" ? "mic" : "create-outline"}
                size={16}
                color={isActive ? "#7c3aed" : "#6b7280"}
              />
              <Text
                className={`text-sm font-semibold ${
                  isActive ? "text-purple-600" : "text-gray-500"
                }`}
              >
                {value === "voice" ? "Voice" : "Text"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {mode === "text" ? (
        <View className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 shadow-sm">
          <Text className="text-sm font-semibold text-gray-700 mb-2">
            Describe the email you want to send
          </Text>
          <TextInput
            value={inputText}
            onChangeText={onInputTextChange}
            placeholder="E.g. Email Priya confirming Friday brunch at 11"
            multiline
            numberOfLines={4}
            maxLength={500}
            className="w-full text-base leading-6 text-gray-900"
            placeholderTextColor="#9ca3af"
            editable={!isLoading}
          />
          <TouchableOpacity
            onPress={onSubmitText}
            disabled={isLoading || !inputText.trim()}
            className={`mt-4 py-3 rounded-xl items-center ${
              isLoading || !inputText.trim()
                ? "bg-gray-200"
                : "bg-purple-600"
            }`}
          >
            <Text className="text-white text-base font-semibold">
              {isLoading ? "Processing..." : "Generate email"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 shadow-sm">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-sm font-semibold text-gray-700">
                Voice mode
              </Text>
              <Text className="text-xs text-gray-500 mt-1">
                {listening ? "Capturing audio..." : "Tap the microphone to start"}
              </Text>
            </View>
            <View className={`w-10 h-10 rounded-full items-center justify-center ${
              listening ? "bg-purple-100" : "bg-gray-100"
            }`}>
              <Ionicons
                name={listening ? "mic" : "mic-outline"}
                size={18}
                color={listening ? "#7c3aed" : "#6b7280"}
              />
            </View>
          </View>

          <View className="mt-4 px-3 py-3 rounded-xl bg-gray-50 border border-dashed border-gray-200">
            <Text className="text-xs uppercase text-gray-500 font-semibold tracking-wide">
              Tip
            </Text>
            <Text className="text-sm text-gray-600 mt-1">
              “Email Alex about the product launch update and send it this afternoon.”
            </Text>
          </View>
        </View>
      )}

      {nluResult ? (
        <View className="bg-white border border-purple-200 rounded-2xl p-4 shadow-sm">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-purple-700">
              {summaryTitle}
            </Text>
            <View className="px-2 py-1 rounded-full bg-purple-100">
              <Text className="text-xs font-bold text-purple-600">
                {nluResult.intent ? nluResult.intent : "Unknown intent"}
              </Text>
            </View>
          </View>

          <Text className="mt-3 text-base text-gray-900">{transcript}</Text>

          {renderEntities()}

          {executionResultMessage ? (
            <View className="mt-3 px-3 py-2 bg-green-50 border border-green-200 rounded-xl flex-row items-center space-x-2">
              <Ionicons name="checkmark-circle" size={18} color="#047857" />
              <Text className="text-sm text-green-700 font-medium">
                {executionResultMessage}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            onPress={handleToggleDetails}
            className="mt-4 flex-row items-center space-x-2"
          >
            <Ionicons
              name={showDetails ? "chevron-up" : "chevron-down"}
              size={16}
              color="#7c3aed"
            />
            <Text className="text-sm font-semibold text-purple-600">
              {showDetails ? "Hide JSON details" : "Show JSON details"}
            </Text>
          </TouchableOpacity>

          {showDetails ? (
            <View className="mt-3 border border-purple-100 rounded-xl bg-purple-50">
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text className="p-3 text-xs font-mono text-purple-900">
                  {JSON.stringify(nluResult, null, 2)}
                </Text>
              </ScrollView>
            </View>
          ) : null}

          <View className="mt-4 flex-row gap-3">
            <TouchableOpacity
              onPress={onConfirm}
              disabled={isLoading}
              className={`flex-1 py-3 rounded-xl items-center flex-row justify-center space-x-2 ${
                isLoading ? "bg-gray-300" : "bg-purple-600"
              }`}
            >
              <Ionicons name="send" size={18} color="white" />
              <Text className="text-white font-semibold text-base">
                {primaryActionLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onTryAgain}
              disabled={isLoading}
              className="flex-1 py-3 rounded-xl items-center border border-purple-200"
            >
              <Text className="text-purple-600 font-semibold text-base">Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onCancel}
              disabled={isLoading}
              className="flex-1 py-3 rounded-xl items-center border border-gray-200"
            >
              <Text className="text-gray-600 font-semibold text-base">Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}
