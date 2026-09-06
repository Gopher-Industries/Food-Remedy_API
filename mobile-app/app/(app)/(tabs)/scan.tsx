// Scan Page tsx

import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import IconGeneral from "@/components/icons/IconGeneral";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import {
  Camera,
  CameraType,
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useNotification } from "@/components/providers/NotificationProvider";
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
import { useAuth } from "@/components/providers/AuthProvider";

export default function ScanPage() {
  const { sessionType } = useAuth();
  const { addNotification } = useNotification();
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
    if (sessionType === "guest") {
      router.push("/(app)/(tabs)/profiles");
      return;
    }

    openModal("profileSelector");
  };

  /**
   * Resume / Page Camera Preview on Focus/blur
   */
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === "android") {
        // Small delay helps SurfaceView settle before resuming
        const t = setTimeout(
          () => cameraRef.current?.resumePreview?.(),
          80
        );

        return () => {
          clearTimeout(t);
          cameraRef.current?.pausePreview?.();
        };
      }

      return () => {};
    }, [])
  );

  // Camera permissions are still loading.
  if (!permission) return <LoadingPage />;

  // Camera permissions are not granted yet.
  if (!permission.granted) {
    return (
      <CameraPermission
        permission={permission}
        requestPermission={requestPermission}
      />
    );
  }

  /**
   * Handle Barcode Scanned
   *
   * This is the existing barcode lookup workflow.
   * It is reused by both the live camera scanner
   * and the selected-image barcode scanner.
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

    setTimeout(() => setCollapseSheet(false), 100);
  };

  /**
   * Choose an image containing a barcode and decode it.
   *
   * Barcode image scanning is currently supported on Android only.
   * Once a barcode is detected, the existing barcode scanning
   * workflow is reused.
   */
  const handleChooseBarcodeImage = async () => {
    // Request permission to access the media library
    const { status } =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      addNotification(
        "Media library permission is required to choose a barcode image.",
        "e"
      );
      return;
    }

    // Open image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });

    // User cancelled image selection
    if (result.canceled) {
      addNotification("Image selection cancelled.", "n");
      return;
    }

    const imageUri = result.assets[0].uri;

    console.log("Selected barcode image:", imageUri);

    // Product barcode image scanning is not supported on iOS
    if (Platform.OS === "ios") {
      addNotification(
        "Product barcode images are not supported on iOS.",
        "e"
      );
      return;
    }

    try {
      // Scan the selected image for barcodes
      const barcodes = await Camera.scanFromURLAsync(imageUri, [
        "ean13",
        "ean8",
        "upc_a",
        "upc_e",
        "code128",
        "code39",
        "code93",
        "itf14",
        "codabar",
        "qr",
      ]);

      if (barcodes.length === 0) {
        addNotification(
          "Could not detect a barcode in this image.",
          "e"
        );
        return;
      }

      const barcode = barcodes[0].data;

      if (!barcode) {
        addNotification(
          "Could not read the barcode in this image.",
          "e"
        );
        return;
      }

      console.log("Detected barcode:", barcode);

      // Reuse the existing barcode scanning workflow
      handleBarCodeScanned({
        type: "image",
        data: barcode,
      });

      addNotification(
        `Barcode detected: ${barcode}`,
        "s"
      );
    } catch (error) {
      console.error("Barcode scanning failed:", error);

      addNotification(
        "Unable to scan the selected image.",
        "e"
      );
    }
  };

  return (
    <Screen className="relative px-safe pt-safe">
      <Header />

      {/* ACTIVE PROFILE BADGE */}
      <View className="w-[95%] self-center mt-2 mb-3">
        <ActiveProfileBadge
          compact
          onPress={handleOpenProfileSelector}
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          flex: 1,
          marginTop: 5,
        }}
      >
        {/* CAMERA WRAPPER */}
        <Pressable
          onPress={closeBottomSheet}
          className="relative flex-1"
        >
          {/* Only mount CameraView when focused */}
          {isFocused && (
            <CameraView
              ref={cameraRef}
              key={facing}
              style={{ flex: 1 }}
              facing={facing}
              onBarcodeScanned={
                !scanned ? handleBarCodeScanned : undefined
              }
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
                  fill={
                    pressed
                      ? color.primary
                      : "hsl(0, 0%, 100%)"
                  }
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
                    type={
                      showContainsBadges
                        ? "visibility-off"
                        : "visibility"
                    }
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

          {/* Choose Barcode Image Button */}
          <View className="absolute bottom-28 self-center">
            <Pressable
              onPress={handleChooseBarcodeImage}
              className="bg-primary rounded-lg px-6 py-3"
            >
              <Tt className="text-white font-interSemiBold">
                Choose Barcode Image
              </Tt>
            </Pressable>
          </View>
        </Pressable>

        <ProductSearchTab collapsed={collapseSheet} />
      </ScrollView>
    </Screen>
  );
}
