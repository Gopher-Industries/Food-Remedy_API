// Terms of Service

import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import IconGeneral from "@/components/icons/IconGeneral";
import Tt from "@/components/ui/UIText";
import { color } from "@/app/design/token";

export default function TermsOfServicePage() {
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
          <Tt className="font-interBold text-xl">Terms of Service</Tt>
          <View style={{ width: 24, height: 24 }} />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 10 }}
      >
        <View className="w-[95%] mx-auto">
          <Tt className="text-hsl30 dark:text-hsl90 text-sm">Last Updated 14 January 2026</Tt>

          <Tt className="text-sm text-justify mt-4 mb-4">
            These Terms of Service ("Terms") govern your use of the Food Remedy
            App ("App", "Service"), developed and maintained by Deakin
            University students in collaboration with Gohper Industries ("we",
            "our", "us"). By accessing or using the App, you agree to comply
            with and be bound by these Terms. If you do not agree with any part
            of these Terms, you must not use the App.
          </Tt>

          <Tt className="text-lg font-interBold mt-4 mb-1">
            Account Creation and Security
          </Tt>
          <Tt className="text-sm text-justify mb-4">
            Some features of the App may require you to create an account. You
            are responsible for maintaining the confidentiality of your login
            details and for all activities that occur under your account. You
            agree to notify us immediately if you suspect any unauthorized use
            of your account.
          </Tt>

          <Tt className="text-lg font-interBold mt-4 mb-1">User Data</Tt>
          <Tt className="text-sm text-justify mb-4">
            We collect and store data you provide, including personal details
            such as allergen preferences, and scan history, to deliver the
            App's core functionality. You retain ownership of your data, but by
            using the Service, you grant us permission to process and store it
            as necessary to provide and improve the Service. You may delete
            your account and all associated data at any time through the App's
            settings or by contacting us. Once deleted, your data cannot be
            recovered.
          </Tt>

          <Tt className="text-lg font-interBold mt-4 mb-1">
            Third-Party Data Source
          </Tt>
          <Tt className="text-sm text-justify mb-4">
            The App uses Open Food Facts, an open food database licensed under
            the Open Database License (ODbL). While we strive for accuracy, the
            data may be incomplete or outdated. We do not guarantee the
            correctness of product or allergen information and are not
            responsible for any errors in third-party data.
          </Tt>

          <Tt className="text-lg font-interBold mt-4 mb-1">
            Health and Safety Disclaimer
          </Tt>
          <Tt className="text-sm text-justify mb-4">
            Food Remedy is provided "as is" and is intended for general
            informational purposes only. It does not replace medical advice.
            Always read product labels and consult a healthcare professional if
            you have food allergies or dietary concerns. We are not responsible
            for health-related outcomes from using the App.
          </Tt>

          <Tt className="text-lg font-interBold mt-4 mb-1">Termination</Tt>
          <Tt className="text-sm text-justify mb-4">
            We may suspend or terminate your access to the Service if you
            violate these Terms or misuse the App. Upon termination, your
            access may be revoked and any associated data may be deleted.
          </Tt>

          <Tt className="text-lg font-interBold mt-4 mb-1">
            Limitation of Liability
          </Tt>
          <Tt className="text-sm text-justify mb-4">
            To the fullest extent permitted by law, Deakin University, Gohper
            Industries, and the Food Remedy development team are not liable for
            any indirect, incidental, special, or consequential damages,
            including but not limited to loss of data, profits, or health
            impacts, arising from your use or inability to use the App.
          </Tt>

          <Tt className="text-lg font-interBold mt-4 mb-1">Updates to Terms</Tt>
          <Tt className="text-sm text-justify mb-4">
            We may update these Terms at any time. Significant changes will be
            communicated in the App. Continued use after such updates
            constitutes acceptance of the revised Terms.
          </Tt>

          <Tt className="text-lg font-interBold mt-4 mb-1">Governing Law</Tt>
          <Tt className="text-sm text-justify mb-4">
            These Terms are governed by the laws of Australia. Any disputes
            shall be resolved in the appropriate jurisdiction within Australia.
          </Tt>
        </View>
      </ScrollView>
    </Screen>
  );
}
