// Camera Permissions

import { ActivityIndicator, Linking, Pressable, View } from "react-native";
import IconCameraPermission from "../icons/IconCameraPermission";
import Tt from "./UIText";
import { router } from "expo-router";
import { PermissionResponse, useCameraPermissions } from "expo-camera";
import { useEffect, useState } from "react";

interface CameraPermissionProps {
  permission: PermissionResponse;
  requestPermission: () => Promise<PermissionResponse>;
}

const CameraPermission = ({ permission, requestPermission }: CameraPermissionProps) => {
  const [requesting, setRequesting] = useState<boolean>(false);
  const canAskAgain = permission?.canAskAgain ?? true;
  const granted = permission?.granted ?? false;

  const openSettings = () => Linking.openSettings?.();

  // If user grants permission on this screen, hop back to scan
  useEffect(() => {
    if (permission?.granted) {
      // Avoid double navigations if this component is reused
      router.replace("/(app)/(tabs)/scan");
    }
  }, [permission?.granted]);

  /**
   * Handle Request
   * @returns 
   */
  const handleRequest = async () => {
    if (requesting || granted || !canAskAgain) return;
    try {
      setRequesting(true);
      await requestPermission();
    } finally {
      setRequesting(false);
    }
  };

  // If already granted, render nothing — parent will switch to the camera
  if (granted) return null;

  return (
    <View className="flex-1 p-safe bg-cyan-100/50">
      <View className="items-center justify-center flex-1 w-[90%] self-center">
        <IconCameraPermission width={150} height={150} />

        <View className="w-full mt-8">
          <Tt className="text-2xl text-center font-drukWide">ALLOW CAMERA</Tt>
          <Tt className="my-2 mb-4 text-sm text-center text-hsl20">Allow Food Remedy to use the camera to scan barcodes</Tt>

          {/* Primary action varies by state */}
          {!granted && canAskAgain && (
            <Pressable
              onPress={handleRequest}
              disabled={requesting}
              hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
              className={`px-4 py-3 my-4 border rounded-md ${requesting ? "bg-primary/70" : "bg-primary"} border-primary`}
            >
              {requesting ? (
                <View className="flex-row justify-center items-center gap-x-2">
                  <ActivityIndicator color="#FF3D3D" />
                  <Tt className="text-lg text-center text-white">Requesting…</Tt>
                </View>
              ) : (
                <Tt className="text-lg text-center text-white">Allow</Tt>
              )}
            </Pressable>
          )}

          {/* Permanently denied -> Settings */}
          {!granted && !canAskAgain && (
            <Pressable
              onPress={openSettings}
              hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
              className="px-4 py-3 my-4 border rounded-md bg-primary border-primary active:bg-primary/80"
            >
              <Tt className="text-lg text-center text-white">Open Settings</Tt>
            </Pressable>
          )}

          {/* “Don’t Allow” keeps user in app and returns to History tab */}
          <Pressable
            onPress={() => router.replace("/(app)/(tabs)")}
            hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
            className="w-full px-4 py-3 my-2 border rounded-md border-hsl10 active:bg-hsl10"
          >
            {({ pressed }) => (
              <Tt className={`text-lg text-center text-black ${pressed && "text-white"}`}>
                Don't Allow
              </Tt>
            )}
          </Pressable>


        </View>
      </View>
    </View>
  );
}

export default CameraPermission;