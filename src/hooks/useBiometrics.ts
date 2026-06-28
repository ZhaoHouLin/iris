import { useCallback } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';

export function useBiometrics() {
  const isAvailable = useCallback(async (): Promise<boolean> => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  }, []);

  const authenticate = useCallback(async (): Promise<boolean> => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: '使用生物辨識解鎖',
      fallbackLabel: '使用 PIN 碼',
      cancelLabel: '取消',
    });
    return result.success;
  }, []);

  return { isAvailable, authenticate };
}
