// app/(app)/diagnosticsPanel.tsx
// QA-only — visible in __DEV__ builds. For EAS preview builds set APP_VARIANT=preview in eas.json.

import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, Share, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useCameraPermissions } from "expo-camera";
import { useNetInfo } from "@react-native-community/netinfo";
import Tt from "@/components/ui/UIText";
import Header from "@/components/layout/Header";
import IconGeneral from "@/components/icons/IconGeneral";
import { useAuth } from "@/components/providers/AuthProvider";
import { useSQLiteDatabase } from "@/components/providers/SQLiteDatabaseProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { color } from "@/app/design/token";

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const [, b64] = token.split(".");
    const normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(normalized);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

type DiagRow = { label: string; value: string };

function Section({ title, rows, darkMode }: { title: string; rows: DiagRow[]; darkMode: boolean }) {
  return (
    <View className="mb-4">
      <View className={`px-4 py-2 ${darkMode ? "bg-hsl20" : "bg-hsl90"}`}>
        <Tt className={`text-xs font-interSemiBold tracking-widest uppercase ${darkMode ? "text-hsl60" : "text-hsl40"}`}>
          {title}
        </Tt>
      </View>
      {rows.map(({ label, value }) => (
        <View
          key={label}
          className={`flex-row justify-between items-center px-4 py-3 border-b ${darkMode ? "border-hsl25" : "border-hsl90"}`}
        >
          <Tt className={`text-sm ${darkMode ? "text-hsl70" : "text-hsl50"}`}>{label}</Tt>
          <Tt className={`text-sm font-interMedium flex-shrink ml-4 text-right ${darkMode ? "text-hsl90" : "text-hsl20"}`}>
            {value}
          </Tt>
        </View>
      ))}
    </View>
  );
}

export default function DiagnosticsPanelScreen() {
  const { user, sessionType, emailVerified } = useAuth();
  const { isDbReady } = useSQLiteDatabase();
  const { darkMode } = usePreferences();
  const netInfo = useNetInfo();
  const [cameraPermission] = useCameraPermissions();
  const [tokenExpiry, setTokenExpiry] = useState<string>("—");

  useEffect(() => {
    if (!user) { setTokenExpiry("—"); return; }
    user.getIdToken(false).then((token) => {
      const payload = decodeJwtPayload(token);
      if (payload?.exp) {
        setTokenExpiry(new Date(payload.exp * 1000).toLocaleString());
      } else {
        setTokenExpiry("Unable to decode");
      }
    }).catch(() => setTokenExpiry("Error"));
  }, [user]);

  const appRows: DiagRow[] = [
    { label: "Name", value: Constants.expoConfig?.name ?? "—" },
    { label: "Version", value: Constants.expoConfig?.version ?? "—" },
    { label: "Platform", value: Platform.OS },
    { label: "Build Variant", value: (Constants.expoConfig?.extra?.appVariant as string) ?? "development" },
  ];

  const authRows: DiagRow[] = [
    { label: "Session", value: sessionType },
    { label: "Email", value: user?.email ?? "—" },
    { label: "Verified", value: emailVerified ? "Yes" : "No" },
    { label: "UID", value: user?.uid ? `${user.uid.slice(0, 10)}…` : "—" },
    { label: "Token Expiry", value: tokenExpiry },
  ];

  const databaseRows: DiagRow[] = [
    { label: "SQLite", value: isDbReady ? "Ready ✓" : "Not ready ✗" },
  ];

  const networkRows: DiagRow[] = [
    { label: "Status", value: netInfo.isConnected === false ? "Offline" : "Online" },
    { label: "Type", value: netInfo.type ?? "—" },
  ];

  const permissionRows: DiagRow[] = [
    { label: "Camera", value: cameraPermission?.status ?? "Unknown" },
  ];

  const buildSnapshot = () => {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      app: Object.fromEntries(appRows.map((r) => [r.label, r.value])),
      auth: Object.fromEntries(authRows.map((r) => [r.label, r.value])),
      database: Object.fromEntries(databaseRows.map((r) => [r.label, r.value])),
      network: Object.fromEntries(networkRows.map((r) => [r.label, r.value])),
      permissions: Object.fromEntries(permissionRows.map((r) => [r.label, r.value])),
    }, null, 2);
  };

  const handleExport = async () => {
    try {
      await Share.share({ message: buildSnapshot() });
    } catch {
      // user dismissed share sheet
    }
  };

  return (
    <View className={`flex-1 p-safe ${darkMode ? "bg-hsl15" : "bg-white"}`}>
      <Header />

      <View className="w-[95%] mx-auto mt-4 mb-4 flex-row items-center justify-between">
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="px-2 py-1"
        >
          {({ pressed }) => (
            <IconGeneral
              type="arrow-backward-ios"
              fill={pressed ? "#FF3F3F" : darkMode ? "#FFFFFF" : "hsl(0, 0%, 30%)"}
            />
          )}
        </Pressable>

        <Tt className={`text-xl font-interBold ${darkMode ? "text-white" : "text-hsl20"}`}>
          QA Diagnostics
        </Tt>

        <View style={{ width: 24, height: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Section title="App" rows={appRows} darkMode={darkMode} />
        <Section title="Auth" rows={authRows} darkMode={darkMode} />
        <Section title="Database" rows={databaseRows} darkMode={darkMode} />
        <Section title="Network" rows={networkRows} darkMode={darkMode} />
        <Section title="Permissions" rows={permissionRows} darkMode={darkMode} />

        <View className="w-[95%] mx-auto mt-4">
          <Pressable
            onPress={handleExport}
            className="py-3 px-4 rounded-lg border bg-primary border-primary active:bg-transparent active:border-primary"
          >
            {({ pressed }) => (
              <Tt className={`text-lg text-center font-interSemiBold ${pressed ? "text-primary" : "text-white"}`}>
                Copy Debug Snapshot
              </Tt>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
