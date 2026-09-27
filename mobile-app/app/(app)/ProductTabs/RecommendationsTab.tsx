import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { router } from "expo-router";

import Tt from "@/components/ui/UIText";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useProduct } from "@/components/providers/ProductProvider";
import { useProfile } from "@/components/providers/ProfileProvider";
import {
  fetchSubstitutions,
  substitutionsEnabled,
  type SubstitutionResponse,
} from "@/services/substitutions";

type Props = { product: any };

export default function RecommendationsTab({ product }: Props) {
  const { user, sessionType } = useAuth();
  const { profiles, activeProfile, isHydrated } = useProfile();
  const { darkMode } = usePreferences();
  const { setBarcode } = useProduct();
  const [result, setResult] = useState<SubstitutionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProfile = useMemo(
    () => activeProfile || profiles.find((profile) => profile.status) || profiles[0] || null,
    [activeProfile, profiles]
  );
  const selectedProfileId = selectedProfile?.profileId;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setResult(null);
    setError(null);
    setLoading(false);
    if (!substitutionsEnabled() || sessionType !== "authenticated" || !user || !selectedProfileId || !product?.barcode) return () => controller.abort();

    setLoading(true);
    user.getIdToken()
      .then((idToken) => fetchSubstitutions({
        barcode: product.barcode,
        profileId: selectedProfileId,
        idToken,
        limit: 5,
        signal: controller.signal,
      }))
      .then((response) => {
        if (active) setResult(response);
      })
      .catch((requestError) => {
        if (active && requestError?.name !== "AbortError") setError(requestError?.message || "Substitutions could not be loaded safely.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [product?.barcode, selectedProfileId, sessionType, user]);

  const panel = darkMode ? "border-hsl30 bg-hsl20" : "border-gray-200 bg-white";
  const secondary = darkMode ? "text-hsl70" : "text-gray-600";

  if (!substitutionsEnabled()) {
    return <EmptyPanel message="Profile-aware substitutions are currently unavailable." panel={panel} secondary={secondary} />;
  }
  if (sessionType !== "authenticated") {
    return <EmptyPanel message="Sign in to receive substitutions checked against your profile." panel={panel} secondary={secondary} />;
  }
  if (!isHydrated) {
    return <View className="items-center py-10"><ActivityIndicator /></View>;
  }
  if (!selectedProfile) {
    return <EmptyPanel message="Select or create a nutritional profile before requesting substitutions." panel={panel} secondary={secondary} />;
  }
  if (loading) {
    return <View className="items-center py-10"><ActivityIndicator /><Tt className={`mt-3 text-sm ${secondary}`}>Checking relevant products against your profile...</Tt></View>;
  }
  if (error) {
    return <EmptyPanel message={error} panel={panel} secondary={secondary} />;
  }
  if (!result || result.status === "empty") {
    return <EmptyPanel message={result?.emptyState?.message || "No substitution result is available."} panel={panel} secondary={secondary} />;
  }

  return (
    <View className="mt-6 mb-8">
      <View className={`mb-4 rounded-xl border p-4 ${panel}`}>
        <Tt className="font-interBold text-base text-hsl20 dark:text-white">Checked for {selectedProfile.firstName || "active profile"}</Tt>
        <Tt className={`mt-1 text-xs ${secondary}`}>Only category-relevant products that passed the active profile checks are shown.</Tt>
      </View>

      {result.substitutions.map((substitution) => (
        <Pressable
          key={substitution.barcode}
          onPress={() => {
            setBarcode(substitution.barcode);
            router.push("/(app)/product");
          }}
          className={`mb-3 rounded-xl border p-4 active:opacity-70 ${panel}`}
        >
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Tt className="font-interBold text-base text-hsl20 dark:text-white">{substitution.productName}</Tt>
              {substitution.brand ? <Tt className={`mt-1 text-xs ${secondary}`}>{substitution.brand}</Tt> : null}
            </View>
            <View className="rounded-full bg-green-100 px-3 py-1">
              <Tt className="font-interBold text-xs text-green-800">{Math.round(substitution.score)} match</Tt>
            </View>
          </View>
          <View className="mt-3 gap-y-1">
            {substitution.reasons.slice(0, 4).map((item) => (
              <Tt key={item.code} className={`text-xs ${secondary}`}>• {item.message}</Tt>
            ))}
          </View>
        </Pressable>
      ))}
      <Tt className={`mt-2 text-xs ${secondary}`}>Recommendations use available product declarations and are not medical advice. Always check the package.</Tt>
    </View>
  );
}

function EmptyPanel({ message, panel, secondary }: { message: string; panel: string; secondary: string }) {
  return (
    <View className={`mt-6 rounded-xl border p-5 ${panel}`}>
      <Tt className="font-interBold text-base text-hsl20 dark:text-white">No safe substitute shown</Tt>
      <Tt className={`mt-2 text-sm ${secondary}`}>{message}</Tt>
    </View>
  );
}
