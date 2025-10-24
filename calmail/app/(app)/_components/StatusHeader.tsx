import { Ionicons } from "@expo/vector-icons";
import { View, Text, TouchableOpacity } from "react-native";
import { VoiceState } from "../_types";

interface StatusHeaderProps {
  userEmail?: string;
  voiceState: VoiceState;
  transcript: string;
  hints?: string[];
  onHintPress?: (hint: string) => void;
}

export function StatusHeader({
  userEmail,
  voiceState,
  transcript,
  hints = [],
  onHintPress,
}: StatusHeaderProps) {
  const STATE_META: Record<
    VoiceState,
    {
      label: string;
      description: string;
      icon: keyof typeof Ionicons.glyphMap;
      chipColor: string;
      textColor: string;
    }
  > = {
    idle: {
      label: "Ready",
      description: "Ask CalMail to handle your email or calendar.",
      icon: "sparkles-outline",
      chipColor: "bg-gray-100",
      textColor: "text-gray-600",
    },
    listening: {
      label: "Listening",
      description: "Live captioning your voice in real time.",
      icon: "mic",
      chipColor: "bg-purple-100",
      textColor: "text-purple-600",
    },
    thinking: {
      label: "Working",
      description: "Parsing intent and prepping actions.",
      icon: "hourglass",
      chipColor: "bg-amber-100",
      textColor: "text-amber-700",
    },
    acting: {
      label: "Acting",
      description: "Executing the requested action securely.",
      icon: "rocket-outline",
      chipColor: "bg-emerald-100",
      textColor: "text-emerald-700",
    },
    done: {
      label: "Done",
      description: "Review the command card for next steps.",
      icon: "checkmark-circle",
      chipColor: "bg-emerald-100",
      textColor: "text-emerald-700",
    },
    error: {
      label: "Issue",
      description: "We saved the transcript. Try again or edit.",
      icon: "warning",
      chipColor: "bg-rose-100",
      textColor: "text-rose-600",
    },
  };

  const meta = STATE_META[voiceState];

  return (
    <View className="mb-8">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-3xl font-semibold text-gray-900">
            Hi {userEmail ?? "there"}
          </Text>
          <Text className="text-gray-500 mt-1">{meta.description}</Text>
        </View>
        <View
          className={`px-3 py-1 rounded-full flex-row items-center space-x-2 ${meta.chipColor}`}
        >
          <Ionicons
            name={meta.icon}
            size={16}
            color="#1f2937"
          />
          <Text className={`text-xs font-semibold ${meta.textColor}`}>
            {meta.label}
          </Text>
        </View>
      </View>

      {transcript ? (
        <View className="mt-4 px-4 py-3 rounded-2xl bg-purple-50 border border-purple-100">
          <Text className="text-xs uppercase tracking-wide text-purple-500 font-semibold">
            Latest transcript
          </Text>
          <Text className="text-base text-purple-900 mt-1">{transcript}</Text>
        </View>
      ) : null}

      {hints.length ? (
        <View className="flex-row flex-wrap gap-2 mt-5">
          {hints.map((hint) => (
            <TouchableOpacity
              key={hint}
              onPress={() => onHintPress?.(hint)}
              className="px-3 py-1.5 rounded-full bg-white border border-gray-200"
            >
              <Text className="text-xs font-semibold text-gray-600">
                {hint}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}
