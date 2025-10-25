import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { View, Text } from "react-native";
import { CommandHistoryStatus, EmailSummary } from "../_types";

type CommandCardStatus =
  | CommandHistoryStatus
  | "thinking"
  | "acting"
  | "done";

interface CommandCardProps {
  intent?: string;
  transcript: string;
  entities?: Record<string, unknown>;
  confidence?: number;
  status: CommandCardStatus;
  timestamp?: number;
  source?: "voice" | "text";
  metaMessage?: string;
  footer?: ReactNode;
  children?: ReactNode;
  emails?: EmailSummary[];
}

const STATUS_META: Record<
  CommandCardStatus,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; border: string }
> = {
  pending: {
    label: "Need review",
    icon: "alert-circle",
    color: "#7c3aed",
    border: "border-purple-200",
  },
  needs_confirm: {
    label: "Confirm to proceed",
    icon: "help-circle",
    color: "#7c3aed",
    border: "border-purple-200",
  },
  acting: {
    label: "Executing",
    icon: "sparkles",
    color: "#0f766e",
    border: "border-emerald-200",
  },
  thinking: {
    label: "Working",
    icon: "hourglass",
    color: "#b45309",
    border: "border-amber-200",
  },
  sent: {
    label: "Sent",
    icon: "checkmark-circle",
    color: "#047857",
    border: "border-emerald-200",
  },
  done: {
    label: "Complete",
    icon: "checkmark-circle",
    color: "#047857",
    border: "border-emerald-200",
  },
  cancelled: {
    label: "Cancelled",
    icon: "close-circle",
    color: "#b91c1c",
    border: "border-rose-200",
  },
  error: {
    label: "Failed",
    icon: "warning",
    color: "#b91c1c",
    border: "border-rose-200",
  },
};

export function CommandCard({
  intent,
  transcript,
  entities,
  confidence,
  status,
  timestamp,
  source,
  metaMessage,
  footer,
  children,
  emails,
}: CommandCardProps) {
  const meta = STATUS_META[status];
  const entryDate = timestamp ? new Date(timestamp) : undefined;
  const renderEntities = () => {
    if (!entities || !Object.keys(entities).length) return null;
    return (
      <View className="flex-row flex-wrap gap-2 mt-4">
        {Object.entries(entities).map(([key, value]) => (
          <View
            key={key}
            className="px-3 py-1.5 rounded-full bg-gray-100 border border-gray-200"
          >
            <Text className="text-xs font-semibold text-gray-700">
              {key}:{" "}
              <Text className="font-medium text-gray-900">
                {String(value)}
              </Text>
            </Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View className={`bg-white rounded-3xl border ${meta.border} p-5 shadow-sm`}>
      <View className="flex-row items-start justify-between">
        <View className="flex-row items-center space-x-3">
          <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center">
            <Ionicons name={meta.icon} size={20} color={meta.color} />
          </View>
          <View>
            <Text className="text-sm font-semibold" style={{ color: meta.color }}>
              {meta.label}
            </Text>
            {intent ? (
              <Text className="text-xs text-gray-500 mt-0.5">
                Intent: {intent}
              </Text>
            ) : null}
          </View>
        </View>
        <View className="items-end">
          {confidence !== undefined ? (
            <View className="px-2 py-1 rounded-full bg-purple-100">
              <Text className="text-xs font-semibold text-purple-600">
                {(confidence * 100).toFixed(0)}% certain
              </Text>
            </View>
          ) : null}
          {source ? (
            <Text className="text-[10px] text-gray-400 mt-1 uppercase tracking-wide">
              {source === "voice" ? "Voice" : "Text"}
            </Text>
          ) : null}
          {entryDate ? (
            <Text className="text-[10px] text-gray-400 mt-1">
              {entryDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          ) : null}
        </View>
      </View>

      <Text className="mt-4 text-base text-gray-900 leading-6">{transcript}</Text>

      {renderEntities()}

      {emails && emails.length ? (
        <View className="mt-4 space-y-3">
          {emails.map((email, index) => {
            const receivedDate = new Date(email.date);
            const hasValidDate = !Number.isNaN(receivedDate.getTime());
            const dateLabel = hasValidDate
              ? receivedDate.toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Unknown date";

            return (
              <View
                key={email.id || `${index}`}
                className="p-4 rounded-2xl border border-gray-200 bg-gray-50"
              >
                <View className="flex-row items-start justify-between">
                  <Text className="text-sm font-semibold text-gray-900 flex-1 pr-3">
                    {email.subject || "(No subject)"}
                  </Text>
                  <Text className="text-xs text-gray-500">{dateLabel}</Text>
                </View>
                <Text className="text-xs text-gray-500 mt-1">
                  From: <Text className="font-medium text-gray-600">{email.from}</Text>
                </Text>
                {email.snippet ? (
                  <Text className="text-sm text-gray-700 mt-2 leading-5">
                    {email.snippet}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {children}

      {metaMessage ? (
        <View className="mt-4 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
          <Text className="text-xs font-medium text-gray-600">{metaMessage}</Text>
        </View>
      ) : null}

      {footer ? <View className="mt-5">{footer}</View> : null}
    </View>
  );
}
