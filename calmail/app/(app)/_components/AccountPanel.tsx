import { Ionicons } from "@expo/vector-icons";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";

interface AccountPanelProps {
  googleAccount: any;
  isChecking: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  onConnect: () => void;
  onRefresh: () => void;
  onDisconnect: () => void;
}

export function AccountPanel({
  googleAccount,
  isChecking,
  isConnecting,
  isDisconnecting,
  onConnect,
  onRefresh,
  onDisconnect,
}: AccountPanelProps) {
  const showCheckingState = isChecking && !googleAccount;

  if (showCheckingState) {
    return (
      <View className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm mt-4">
        <View className="flex-row items-center space-x-3">
          <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center">
            <ActivityIndicator size="small" color="#6b7280" />
          </View>
          <View>
            <Text className="text-sm font-semibold text-gray-700">
              Checking Google connection…
            </Text>
            <Text className="text-xs text-gray-500 mt-1">
              Hang tight while we confirm access.
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={onRefresh}
          className="mt-4 py-3 rounded-xl border border-gray-200 items-center"
        >
          <Text className="text-sm font-semibold text-gray-600">Refresh now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (googleAccount) {
    const email =
      googleAccount.emailAddress || googleAccount.email || googleAccount.user?.email;

    return (
      <View className="bg-green-50 border border-green-200 rounded-2xl p-4 shadow-sm mt-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center space-x-3">
            <View className="w-10 h-10 rounded-full bg-green-100 items-center justify-center">
              <Ionicons name="checkmark-circle" size={22} color="#047857" />
            </View>
            <View>
              <Text className="text-sm font-semibold text-green-700">
                Google connected
              </Text>
              <Text className="text-xs text-green-600 mt-1">{email}</Text>
            </View>
          </View>
          {isChecking ? (
            <View className="flex-row items-center">
              <ActivityIndicator size="small" color="#047857" />
              <Text className="ml-2 text-xs font-medium text-green-700">
                Refreshing…
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={onRefresh}
              disabled={isDisconnecting}
              className={`px-3 py-2 rounded-lg border ${
                isDisconnecting ? "border-gray-200" : "border-green-300"
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  isDisconnecting ? "text-gray-400" : "text-green-700"
                }`}
              >
                Refresh
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          onPress={onDisconnect}
          disabled={isDisconnecting}
          className={`mt-4 py-3 rounded-xl flex-row items-center justify-center space-x-2 ${
            isDisconnecting ? "bg-gray-200" : "bg-white"
          }`}
        >
          <Ionicons
            name={isDisconnecting ? "hourglass" : "link-outline"}
            size={16}
            color={isDisconnecting ? "#6b7280" : "#dc2626"}
          />
          <Text
            className={`text-sm font-semibold ${
              isDisconnecting ? "text-gray-600" : "text-red-600"
            }`}
          >
            {isDisconnecting ? "Disconnecting..." : "Disconnect access"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm mt-4">
      <View className="flex-row items-center space-x-3">
        <View className="w-10 h-10 rounded-full bg-purple-100 items-center justify-center">
          <Ionicons name="logo-google" size={20} color="#7c3aed" />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-gray-800">
            Connect your Google account
          </Text>
          <Text className="text-xs text-gray-500 mt-1">
            Required to fetch contacts and send email for you.
          </Text>
        </View>
      </View>
      <View className="mt-4 space-y-2">
        <TouchableOpacity
          onPress={onConnect}
          disabled={isConnecting}
          className={`py-3 rounded-xl items-center ${
            isConnecting ? "bg-gray-200" : "bg-purple-600"
          }`}
        >
          <Text className="text-white text-base font-semibold">
            {isConnecting ? "Opening Google..." : "Connect Google"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onRefresh}
          disabled={isConnecting}
          className="py-2 rounded-lg border border-gray-200 items-center"
        >
          <Text className="text-xs font-semibold text-gray-600">Refresh status</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
