// Scan Page tsx

import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import IconGeneral from "@/components/icons/IconGeneral";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import BarcodeOverlayMask from "@/components/layout/BarcodeOverlayGuide";
import { useProduct } from "@/components/providers/ProductProvider";
import LoadingPage from "@/app/(misc)/loading";
import CameraPermission from "@/components/ui/CameraPermission";
import { useIsFocused } from "@react-navigation/native";
import ProductSearchTab from "@/components/ui/ProductSearchTab";
import ActiveProfileBadge from "@/components/ui/ActiveProfileBadge";
import { useModalManager } from "@/components/providers/ModalManagerProvider";
import { color } from "@/app/design/token";
import { useSessionPreferences } from "@/components/providers/SessionPreferencesProvider";
import Tt from "@/components/ui/UIText";

export default function ScanPage() {
  const { setBarcode } = useProduct();
  const { openModal } = useModalManager();
  const {
    showContainsBadges,
    toggleShowContains,
    toggleAllergenHighlight,
  } = useSessionPreferences();
  const [scanned, setScanned] = useState<boolean>(false);
  const [collapseSheet, setCollapseSheet] = useState(false);
  const isFocused = useIsFocused();
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>("back");
  const [permission, requestPermission] = useCameraPermissions();

  const toggleCameraFacing = () =>
    setFacing((p) => (p === "back" ? "front" : "back"));

  const handleOpenProfileSelector = () => {
    openModal("profileSelector");
  };

  /**
   * Resume / Page Camera Preview on Focus/blur
   */
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === "android") {
        // small delay helps SurfaceView settle before resuming
        const t = setTimeout(() => cameraRef.current?.resumePreview?.(), 80);
        return () => {
          clearTimeout(t);
          cameraRef.current?.pausePreview?.();
        };
      }
      return () => {};
    }, []),
  );

  // Camera permissions are still loading.
  if (!permission) return <LoadingPage />;

  // Camera permissions are not granted yet.
  if (!permission.granted)
    return (
      <CameraPermission
        permission={permission}
        requestPermission={requestPermission}
      />
    );

  /**
   * Handle Barcode Scanned
   * @param param
   */
  const handleBarCodeScanned = ({
    type,
    data,
  }: {
    type: string;
    data: string;
  }) => {
    setScanned(true);
    setBarcode(data);
    router.push("/(app)/product");
    setTimeout(() => setScanned(false), 800);
  };

  /**
   * Close Bottom Sheet
   */
  const closeBottomSheet = () => {
    setCollapseSheet(true);
    setTimeout(() => setCollapseSheet(false), 100); // reset after trigger
  };

  return (
    <Screen className="relative px-safe pt-safe">
      <Header />

      {/* ACTIVE PROFILE BADGE */}
      <View className="w-[95%] self-center mt-2 mb-3">
        <ActiveProfileBadge compact onPress={handleOpenProfileSelector} />
      </View>

      <ScrollView contentContainerStyle={{ flex: 1, marginTop: 5 }}>
        {/* CAMERA WRAPPER */}
        <Pressable onPress={closeBottomSheet} className="relative flex-1">
          {/* Only mount CameraView when focused */}
          {isFocused && (
            <CameraView
              ref={cameraRef}
              key={facing}
              style={{ flex: 1 }}
              facing={facing}
              onBarcodeScanned={!scanned ? handleBarCodeScanned : undefined}
            />
          )}

          <BarcodeOverlayMask />

          {/* Camera Switch Button */}
          <View className="absolute right-4 top-4">
            <Pressable
              onPress={toggleCameraFacing}
              className="flex flex-col items-center gap-y-1"
            >
              {({ pressed }) => (
                <IconGeneral
                  type="camera-switch"
                  fill={pressed ? color.primary : "hsl(0, 0%, 100%)"}
                />
              )}
            </Pressable>
          </View>

          {/* Allergen Toggle Button */}
          <View className="absolute left-4 top-2">
            <Pressable
              onPress={() => {
                toggleShowContains();
                toggleAllergenHighlight();
              }}
              className="bg-primary rounded-lg py-3 px-4 flex-row justify-center items-center shadow-lg"
            >
              {({ pressed }) => (
                <>
                  <IconGeneral
                    type={showContainsBadges ? "visibility-off" : "visibility"}
                    fill="white"
                    size={20}
                  />
                  <Tt className="text-white font-interSemiBold ml-2">
                    {showContainsBadges
                      ? "Hide Allergen Info"
                      : "View Allergen Info"}
                  </Tt>
                </>
              )}
            </Pressable>
          </View>
        </Pressable>

        <ProductSearchTab collapsed={collapseSheet} />
      </ScrollView>
    </Screen>
  );
}
