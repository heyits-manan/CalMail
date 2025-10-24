import { SignedIn, SignedOut, useUser } from "@clerk/clerk-expo";
import { Link } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";
import { SignOutButton } from "../_shared/SignOutButton";

export default function Settings() {
  const { user } = useUser();

  return (
    <View className="flex-1 bg-white">
      <SignedIn>
        <View className="flex-1 px-6 pt-12">
          <View className="mb-8">
            <Text className="text-3xl font-bold text-gray-900">Settings</Text>
            <Text className="text-gray-600 mt-2">
              Manage your account and preferences
            </Text>
          </View>

          <View className="space-y-4">
            <View className="bg-gray-50 p-4 rounded-xl">
              <Text className="text-lg font-semibold text-gray-900">
                Account
              </Text>
              <Text className="text-gray-600 mt-1">
                {user?.emailAddresses[0].emailAddress}
              </Text>
            </View>

            <Link href="/settings/accounts" asChild>
              <TouchableOpacity className="bg-gray-50 p-4 rounded-xl">
                <Text className="text-lg font-semibold text-gray-900">
                  Connected Accounts
                </Text>
                <Text className="text-gray-600 mt-1">
                  Manage Gmail and Google Calendar access
                </Text>
              </TouchableOpacity>
            </Link>

            <View className="mt-8">
              <SignOutButton />
            </View>
          </View>
        </View>
      </SignedIn>

      <SignedOut>
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-xl text-gray-600">
            Please sign in to access settings
          </Text>
        </View>
      </SignedOut>
    </View>
  );
}
