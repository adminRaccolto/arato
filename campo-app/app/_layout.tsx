import 'react-native-url-polyfill/auto';
import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../lib/auth';

SplashScreen.preventAutoHideAsync();

function Guard() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync();

    const inLogin = segments[0] === 'login';
    if (!session && !inLogin) router.replace('/login');
    else if (session && inLogin) router.replace('/(tabs)');
  }, [session, loading, segments, router]);

  return <Slot />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#1A4870" />
      <AuthProvider>
        <Guard />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
