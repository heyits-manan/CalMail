import { Ionicons } from "@expo/vector-icons";
import { View, Text } from "react-native";

interface AgendaEntry {
  id: string;
  title: string;
  time: string;
  location?: string;
}

interface Suggestion {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface MyDayCardProps {
  unreadCount?: number;
  upcoming?: AgendaEntry[];
  suggestions?: Suggestion[];
}

export function MyDayCard({
  unreadCount = 0,
  upcoming = [],
  suggestions = [],
}: MyDayCardProps) {
  return (
    <View className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm">
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center space-x-2">
          <View className="w-9 h-9 rounded-full bg-indigo-100 items-center justify-center">
            <Ionicons name="calendar" size={18} color="#4f46e5" />
          </View>
          <Text className="text-base font-semibold text-gray-800">
            My Day
          </Text>
        </View>
        <View className="flex-row items-center space-x-1">
          <Ionicons name="mail-unread" size={14} color="#4338ca" />
          <Text className="text-xs font-semibold text-indigo-600">
            {unreadCount} unread
          </Text>
        </View>
      </View>

      {upcoming.length ? (
        <View className="space-y-3">
          {upcoming.slice(0, 3).map((entry) => (
            <View
              key={entry.id}
              className="flex-row justify-between items-start px-3 py-2 rounded-2xl bg-gray-50 border border-gray-200"
            >
              <View>
                <Text className="text-sm font-semibold text-gray-800">
                  {entry.title}
                </Text>
                {entry.location ? (
                  <Text className="text-xs text-gray-500 mt-1">
                    {entry.location}
                  </Text>
                ) : null}
              </View>
              <Text className="text-xs font-semibold text-gray-500">
                {entry.time}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View className="px-4 py-3 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
          <Text className="text-sm text-gray-500">
            Free morning. Try “add lunch with Priya at 1pm”.
          </Text>
        </View>
      )}

      {suggestions.length ? (
        <View className="flex-row flex-wrap gap-2 mt-4">
          {suggestions.map((suggestion) => (
            <View
              key={suggestion.id}
              className="px-3 py-1.5 rounded-full bg-indigo-50 flex-row items-center space-x-2"
            >
              <Ionicons
                name={suggestion.icon}
                size={14}
                color="#4338ca"
              />
              <Text className="text-xs font-semibold text-indigo-700">
                {suggestion.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
