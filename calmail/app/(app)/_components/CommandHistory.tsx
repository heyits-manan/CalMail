import { CommandHistoryItem } from "../_types";
import { CommandCard } from "./CommandCard";
import { View, Text } from "react-native";

interface CommandHistoryProps {
  items: CommandHistoryItem[];
}

export function CommandHistory({ items }: CommandHistoryProps) {
  if (!items.length) return null;

  return (
    <View className="mt-8">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-sm font-semibold text-gray-700">
          Recent voice activity
        </Text>
        <Text className="text-xs text-gray-400">
          Showing last {Math.min(5, items.length)}
        </Text>
      </View>
      <View className="space-y-4">
        {items.slice(0, 5).map((item) => (
          <CommandCard
            key={item.id}
            intent={item.intent}
            transcript={item.transcript}
            status={item.status}
            timestamp={item.timestamp}
            metaMessage={item.message}
            source={item.source}
            confidence={item.confidence}
            entities={item.entities}
            emails={item.emails}
          />
        ))}
      </View>
    </View>
  );
}
