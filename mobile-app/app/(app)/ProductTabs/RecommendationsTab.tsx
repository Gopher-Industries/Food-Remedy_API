import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { router } from 'expo-router';

import Tt from '@/components/ui/UIText';
import { useAuth } from '@/components/providers/AuthProvider';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { useProduct } from '@/components/providers/ProductProvider';
import { useProfile } from '@/components/providers/ProfileProvider';
import {
  getIntentAwareRecommendations,
  RecommendationRequestError,
} from '@/services/api/intentAwareRecommendations';
import {
  openSubstitutionProduct,
  recommendationReason,
  ScanSubstitutionCoordinator,
  type ScanSubstitutionState,
} from '@/services/scanSubstitutionFlow';

type Props = { product: { barcode?: string | null } | null };

const initialState: ScanSubstitutionState = { status: 'idle' };

export default function RecommendationsTab({ product }: Props) {
  const { darkMode } = usePreferences();
  const { user, sessionType } = useAuth();
  const { activeProfile, activeProfileId } = useProfile();
  const { setBarcode, setCurrentProduct } = useProduct();
  const [state, setState] = useState<ScanSubstitutionState>(initialState);
  const [retry, setRetry] = useState(0);
  const coordinatorRef = useRef<ScanSubstitutionCoordinator | null>(null);

  if (!coordinatorRef.current) {
    coordinatorRef.current = new ScanSubstitutionCoordinator(
      async (input, options) => {
        const network = await NetInfo.fetch();
        if (network.isConnected === false || network.isInternetReachable === false) {
          throw new RecommendationRequestError('offline', 'Device is offline.');
        }
        return getIntentAwareRecommendations(input, options);
      },
      setState,
    );
  }

  const barcode = product?.barcode ?? null;

  useEffect(() => {
    const coordinator = coordinatorRef.current!;
    coordinator.clear();
    if (sessionType !== 'authenticated' || !user?.uid || !barcode || !activeProfileId) return;
    void coordinator.load({ barcode, profileId: activeProfileId, limit: 5 });
    return () => coordinator.cancel();
  }, [activeProfileId, barcode, retry, sessionType, user?.uid]);

  useEffect(() => () => coordinatorRef.current?.cancel(), []);

  const muted = darkMode ? 'text-hsl70' : 'text-gray-600';
  const panel = darkMode ? 'border-hsl30 bg-hsl20' : 'border-gray-200 bg-white';

  const openProduct = (candidateBarcode: string) => {
    setCurrentProduct(null);
    openSubstitutionProduct(candidateBarcode, setBarcode, () => router.push('/(app)/product'));
  };

  const retryButton = (
    <TouchableOpacity
      onPress={() => setRetry(value => value + 1)}
      className="mt-4 self-center rounded-lg bg-red-500 px-5 py-3"
    >
      <Tt className="font-interSemiBold text-white">Try again</Tt>
    </TouchableOpacity>
  );

  let content: React.ReactNode;
  if (!product || !barcode) {
    content = <Tt className={muted}>No scanned product is available.</Tt>;
  } else if (sessionType !== 'authenticated' || !user) {
    content = <Tt className={muted}>Sign in to load profile-aware alternatives.</Tt>;
  } else if (!activeProfileId || !activeProfile) {
    content = <Tt className={muted}>Select an active profile to check suitable alternatives.</Tt>;
  } else if (state.status === 'loading' || state.status === 'idle') {
    content = (
      <View className="items-center py-8">
        <ActivityIndicator color="#ef4444" />
        <Tt className={`mt-3 ${muted}`}>Checking eligible alternatives…</Tt>
      </View>
    );
  } else if (state.status === 'success') {
    content = (
      <View>
        {state.result.substitutions.map(item => (
          <TouchableOpacity
            key={item.barcode}
            onPress={() => openProduct(item.barcode)}
            className={`mb-3 rounded-xl border p-4 ${panel}`}
          >
            <Tt className={`font-interSemiBold text-base ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {item.productName}
            </Tt>
            {item.brand ? <Tt className={`mt-1 text-xs ${muted}`}>{item.brand}</Tt> : null}
            <Tt className={`mt-3 text-sm ${darkMode ? 'text-hsl90' : 'text-gray-700'}`}>
              {recommendationReason(item)}
            </Tt>
            <Tt className="mt-3 text-xs font-interSemiBold text-red-500">View product</Tt>
          </TouchableOpacity>
        ))}
        <Tt className={`mt-1 text-xs ${muted}`}>
          Recheck the product label before purchase; product information can change.
        </Tt>
      </View>
    );
  } else {
    content = (
      <View className="items-center py-6">
        <Tt className={`text-center ${muted}`}>{state.message}</Tt>
        {(state.status === 'offline' || state.status === 'timeout' || state.status === 'error')
          ? retryButton
          : null}
      </View>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      className={`mt-6 flex-1 ${darkMode ? 'bg-hsl15' : 'bg-white'}`}
    >
      <View className="px-4 pb-8">
        <Tt className={`mb-2 text-xs font-interBold tracking-wider ${muted}`}>
          PROFILE-AWARE ALTERNATIVES
        </Tt>
        {activeProfile ? (
          <Tt className={`mb-4 text-xs ${muted}`}>
            Checked for {activeProfile.firstName || 'the selected profile'}
          </Tt>
        ) : null}
        {content}
      </View>
    </ScrollView>
  );
}
