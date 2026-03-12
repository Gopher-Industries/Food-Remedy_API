/**
 * TEMPORARY HOOK
 * 
 * Uses device id.
 * 
 * Needs to be replaced with retrieving the userId from sql database
 */

import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';

const KEY = 'foodremedy.device_user_id';

export function useDeviceUserId() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let id: string | null = null;
      if (Platform.OS === 'web') {
        id = await AsyncStorage.getItem(KEY);
        if (!id) {
          id = uuidv4();
          await AsyncStorage.setItem(KEY, id);
        }
      } else {
        id = await SecureStore.getItemAsync(KEY);
        if (!id) {
          id = uuidv4();
          await SecureStore.setItemAsync(KEY, id);
        }
      }
      setUserId(id);
    })();
  }, []);

  return userId;
}
