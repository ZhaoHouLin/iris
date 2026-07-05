import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../src/store/authStore';
import { useMediaStore } from '../src/store/mediaStore';

const AUTO_LOCK_MS = 3_000;

function AuthGuard() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const cleanupTempFiles = useMediaStore((s) => s.cleanupTempFiles);
  const segments = useSegments();
  const router = useRouter();
  const navState = useRootNavigationState();
  const backgroundedAt = useRef<number | null>(null);

  // Auto-lock on background
  useEffect(() => {
    const handleAppState = async (next: AppStateStatus) => {
      if (next === 'background') {
        backgroundedAt.current = Date.now();
      } else if (next === 'active') {
        if (
          isAuthenticated &&
          backgroundedAt.current !== null &&
          Date.now() - backgroundedAt.current >= AUTO_LOCK_MS
        ) {
          await cleanupTempFiles();
          logout();
        }
        backgroundedAt.current = null;
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [isAuthenticated]);

  // Redirect based on auth state — wait until navigation is ready
  useEffect(() => {
    if (!navState?.key) return;
    const inAuth = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuth) {
      router.replace('/(auth)/unlock');
    } else if (isAuthenticated && inAuth) {
      router.replace('/(main)/gallery');
    }
  }, [navState?.key, isAuthenticated, segments[0]]);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(main)" />
      </Stack>
      <AuthGuard />
    </GestureHandlerRootView>
  );
}
