import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { VoiceState } from "../_types";

interface RecordButtonProps {
  listening: boolean;
  isLoading: boolean;
  onPress: () => void;
  voiceState: VoiceState;
  onCancelListening?: () => void;
  disabled?: boolean;
}

export function RecordButton({
  listening,
  isLoading,
  onPress,
  voiceState,
  onCancelListening,
  disabled,
}: RecordButtonProps) {
  const STATES: Record<
    VoiceState,
    {
      icon: keyof typeof Ionicons.glyphMap;
      label: string;
      subLabel?: string;
      ringColor: string;
      background: string;
      textColor: string;
    }
  > = {
    idle: {
      icon: "mic",
      label: "Tap to speak",
      subLabel: "Or use the typing field",
      ringColor: "#c7d2fe",
      background: "#4f46e5",
      textColor: "#f5f5ff",
    },
    listening: {
      icon: "stop-circle",
      label: "Listening…",
      subLabel: "Say your command or tap stop",
      ringColor: "#c084fc",
      background: "#7c3aed",
      textColor: "#f5f5ff",
    },
    thinking: {
      icon: "hourglass",
      label: "Got it, working on it",
      subLabel: "Sit tight",
      ringColor: "#fde68a",
      background: "#f59e0b",
      textColor: "#1f2937",
    },
    acting: {
      icon: "sparkles",
      label: "Executing",
      subLabel: "Drafting your message…",
      ringColor: "#a7f3d0",
      background: "#10b981",
      textColor: "#052e16",
    },
    done: {
      icon: "checkmark-circle",
      label: "All set",
      subLabel: "Review the command card",
      ringColor: "#bbf7d0",
      background: "#22c55e",
      textColor: "#0f172a",
    },
    error: {
      icon: "warning",
      label: "Something went wrong",
      subLabel: "Try again or edit",
      ringColor: "#fecaca",
      background: "#ef4444",
      textColor: "#f8fafc",
    },
  };

  const meta = STATES[voiceState];
  const isVoiceDisabled = disabled;
  const isPressDisabled =
    isVoiceDisabled || voiceState === "thinking" || voiceState === "acting";

  return (
    <View className="items-center mt-6">
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        disabled={isPressDisabled}
        style={styles.shadow}
      >
        <View
          style={[
            styles.button,
            {
              backgroundColor: isVoiceDisabled ? "#e5e7eb" : meta.background,
            },
          ]}
        >
          <View
            style={[
              styles.ring,
              {
                borderColor: isVoiceDisabled ? "#d1d5db" : meta.ringColor,
                opacity: voiceState === "idle" ? 0.6 : 1,
              },
            ]}
          />
          <Ionicons
            name={meta.icon}
            size={32}
            color={isVoiceDisabled ? "#6b7280" : meta.textColor}
          />
        </View>
      </TouchableOpacity>
      <Text className="mt-4 text-sm font-semibold text-gray-800">
        {meta.label}
      </Text>
      {meta.subLabel ? (
        <Text className="mt-1 text-xs font-medium text-gray-500">
          {meta.subLabel}
        </Text>
      ) : null}
      {voiceState === "listening" && onCancelListening ? (
        <TouchableOpacity
          onPress={onCancelListening}
          className="mt-3 px-4 py-2 rounded-full border border-purple-200"
        >
          <Text className="text-xs font-semibold text-purple-600">
            Tap to stop listening
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    top: -12,
    left: -12,
    right: -12,
    bottom: -12,
    borderRadius: 60,
    borderWidth: 6,
  },
  shadow: {
    shadowColor: "#4c1d95",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
});
