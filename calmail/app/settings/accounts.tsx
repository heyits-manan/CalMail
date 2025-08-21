import { useState } from "react";
import { Switch, Text, View } from "react-native";

export default function ConnectedAccounts() {
  const [gmailEnabled, setGmailEnabled] = useState(true);
  const [calendarEnabled, setCalendarEnabled] = useState(true);

  return (
    <View style={{ flex: 1, paddingTop: 48, paddingHorizontal: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "600", marginBottom: 16 }}>
        Connected Accounts
      </Text>

      <View
        style={{
          backgroundColor: "#f3f4f6",
          padding: 16,
          borderRadius: 12,
          marginBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View>
          <Text style={{ fontSize: 16, fontWeight: "600" }}>Gmail</Text>
          <Text style={{ color: "#6b7280", marginTop: 4 }}>
            sasha@example.com
          </Text>
        </View>
        <Switch value={gmailEnabled} onValueChange={setGmailEnabled} />
      </View>

      <View
        style={{
          backgroundColor: "#f3f4f6",
          padding: 16,
          borderRadius: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View>
          <Text style={{ fontSize: 16, fontWeight: "600" }}>
            Google Calendar
          </Text>
          <Text style={{ color: "#6b7280", marginTop: 4 }}>
            sasha@example.com
          </Text>
        </View>
        <Switch value={calendarEnabled} onValueChange={setCalendarEnabled} />
      </View>
    </View>
  );
}
