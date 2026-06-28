import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { deriveAndCacheKey, clearCachedKey } from '../crypto/encryption';

const PIN_KEY = 'vault_pin';
const BIOMETRIC_KEY = 'vault_biometric_enabled';

interface AuthStore {
  isAuthenticated: boolean;
  hasPin: boolean;
  biometricEnabled: boolean;
  checkHasPin: () => Promise<void>;
  loadBiometricPreference: () => Promise<void>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  setupPin: (pin: string) => Promise<void>;
  authenticate: (pin: string) => Promise<'real' | 'invalid'>;
  authenticateWithBiometric: () => Promise<'real' | 'invalid'>;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  isAuthenticated: false,
  hasPin: false,
  biometricEnabled: false,

  checkHasPin: async () => {
    const pin = await SecureStore.getItemAsync(PIN_KEY);
    set({ hasPin: !!pin });
  },

  loadBiometricPreference: async () => {
    const val = await SecureStore.getItemAsync(BIOMETRIC_KEY);
    set({ biometricEnabled: val === 'true' });
  },

  setBiometricEnabled: async (enabled: boolean) => {
    await SecureStore.setItemAsync(BIOMETRIC_KEY, enabled ? 'true' : 'false');
    set({ biometricEnabled: enabled });
  },

  setupPin: async (pin) => {
    await SecureStore.setItemAsync(PIN_KEY, pin);
    set({ hasPin: true });
  },

  authenticate: async (pin) => {
    const realPin = await SecureStore.getItemAsync(PIN_KEY);
    if (pin === realPin) {
      await deriveAndCacheKey(pin);
      set({ isAuthenticated: true });
      return 'real';
    }
    return 'invalid';
  },

  authenticateWithBiometric: async () => {
    const realPin = await SecureStore.getItemAsync(PIN_KEY);
    if (!realPin) return 'invalid';
    await deriveAndCacheKey(realPin);
    set({ isAuthenticated: true });
    return 'real';
  },

  logout: () => {
    clearCachedKey();
    set({ isAuthenticated: false });
  },
}));
