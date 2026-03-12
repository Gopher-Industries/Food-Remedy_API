// Privacy Policy

import { ScrollView, View, Pressable } from "react-native";
import { router } from "expo-router";
import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import IconGeneral from "@/components/icons/IconGeneral";
import Tt from "@/components/ui/UIText";
import { color, spacing } from "@/app/design/token";

export default function PrivacyPolicyPage() {
  return (
    <Screen className="p-safe">
      <Header />

      <View className="w-[95%] mx-auto">
        <View className="flex-row items-center justify-between mb-4">
          <Pressable
            onPress={() => router.back()}
            className="flex-row justify-center items-center self-end px-2 py-1"
          >
            {({ pressed }) => (
              <IconGeneral
                type="arrow-backward-ios"
                fill={pressed ? color.primary : color.primary}
              />
            )}
          </Pressable>
          <Tt className="font-interBold text-xl">Privacy Policy</Tt>
          <View style={{ width: 24, height: 24 }} />
        </View>
      </View>

      {/* Scrollable policy content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 10 }}
      >
        <View className="w-[95%] mx-auto">
          <Tt className="text-hsl30 dark:text-hsl90 text-sm">Last Updated 14 August 2025</Tt>

          {/* OUR PROMISE */}
          <Tt className="text-lg font-interBold mt-4 mb-2">Our Promise</Tt>
          <Tt className="text-sm text-justify mb-4">
            This Privacy Policy applies to your use of the Food Remedy app
            (“App”, “Service”), developed and maintained by Deakin University
            students in collaboration with Gohper Industries (“we”, “us”,
            “our”). We value your privacy and are committed to protecting your
            personal information. This policy explains how we collect, store,
            and use your data when you use our app. By continuing to use the
            app, you agree to this Privacy Policy.
          </Tt>

          {/* DATA COLLECTION */}
          <Tt className="text-lg font-interBold mt-4 mb-1">
            Data Collection & Management
          </Tt>
          <Tt className="font-interSemiBold mb-1">Personal Data and Account</Tt>
          <Tt className="text-sm text-justify mb-4">
            If you create an account, we may collect basic details such as your
            name, email address, and allergen preferences. These are required
            for core app functionality — specifically, to detect allergens and
            provide safe product suggestions. We do not sell your data to third
            parties and take reasonable measures to protect it from unauthorized
            access.
          </Tt>

          <Tt className="font-interSemiBold mb-1">Scan & Allergen Data</Tt>
          <Tt className="text-sm text-justify mb-4">
            When you scan a product, the app processes the product's ingredient
            and nutrition data (sourced from Open Food Facts) to check for
            allergens you've specified. We may store recent scans to improve
            your experience. This data is tied to your account (if you have one)
            or stored locally on your device.
          </Tt>

          <Tt className="font-interSemiBold mb-1">
            Managing and Exporting Your Data
          </Tt>
          <Tt className="text-sm text-justify mb-4">
            You can export your allergen preferences and scan history by
            contacting us.
          </Tt>

          <Tt className="font-interSemiBold mb-1">Customer Support</Tt>
          <Tt className="text-sm text-justify mb-4">
            If you reach out for support, you may provide personally
            identifiable information (such as your email address). We use this
            only for customer service and do not share it externally.
          </Tt>

          <Tt className="font-interSemiBold mb-1">Data Retention</Tt>
          <Tt className="text-sm text-justify mb-4">
            We keep your data for as long as needed to operate the app and
            provide its core features. You can delete your account and all
            associated data at any time via the app's settings or by contacting
            us. Deleted data cannot be recovered.
          </Tt>

          <Tt className="font-interSemiBold mb-1">Children's Privacy</Tt>
          <Tt className="text-sm text-justify mb-4">
            Food Remedy is not intended for children under 13 years old. We do
            not knowingly collect data from children under 13. If you believe we
            have inadvertently collected such data, please contact us and we
            will delete it.
          </Tt>

          {/* THIRD PARTY */}
          <Tt className="text-lg font-interBold mt-4 mb-1">
            Third-Party Services
          </Tt>
          <Tt className="text-sm text-justify mb-4">
            We use Open Food Facts, a global open food database, for product
            data. This data is covered by the Open Database License (ODbL) and
            may not always be complete or accurate. We do not share your
            personal data with Open Food Facts or any other third-party service
            for marketing purposes.
          </Tt>

          {/* MEDICAL DISCLAIMER */}
          <Tt className="text-lg font-interBold mt-4 mb-1">
            Medical Disclaimer
          </Tt>
          <Tt className="text-sm text-justify mb-4">
            Food Remedy provides allergen detection and nutrition information
            for general guidance only. It is not medical advice. Always check
            product packaging and consult a healthcare professional if you have
            allergies or dietary concerns.
          </Tt>

          {/* POLICY CHANGES */}
          <Tt className="text-lg font-interBold mt-4 mb-1">
            Changes to This Policy
          </Tt>
          <Tt className="text-sm text-justify mb-4">
            We may update this Privacy Policy from time to time. Updates will be
            posted in the app. Continued use of the app after changes means you
            accept the updated terms.
          </Tt>
        </View>
      </ScrollView>
    </Screen>
  );
}
