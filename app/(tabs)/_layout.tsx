
import { useEffect, useState } from 'react';
import { Redirect, Tabs, useSegments } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getProfile, type Profile } from '@/lib/profiles';

export default function TabLayout() {
  const { session, loading: authLoading } = useAuth();
  const segments = useSegments();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    async function loadProfile() {
      if (authLoading) return;

      if (!session?.user?.id) {
        setProfile(null);
        setProfileError('');
        setProfileLoading(false);
        return;
      }

      setProfile(null);
      setProfileError('');
      setProfileLoading(true);

      try {
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(
              new Error(
                'Profile loading timed out. Check your internet connection and try again.'
              )
            );
          }, 10000);
        });

        const result = await Promise.race([
          getProfile(session.user.id),
          timeout,
        ]);

        if (!active) return;

        if (result) {
          setProfile(result);
        } else {
          setProfileError(
            'No profile was found for this account. Check your Supabase profiles table.'
          );
        }
      } catch (error) {
        if (active) {
          console.error('Failed to load profile:', error);
          setProfileError(
            error instanceof Error
              ? error.message
              : 'Unable to load your profile.'
          );
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (active) setProfileLoading(false);
      }
    }

    void loadProfile();

    return () => {
      active = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [session?.user?.id, authLoading, retryCount]);

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.message}>Checking your session...</Text>
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  if (profileLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.message}>Loading your profile...</Text>
      </View>
    );
  }

  if (profileError || !profile) {
    return (
      <View style={styles.center}>
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={COLORS.warning}
        />
        <Text style={styles.errorTitle}>Unable to load profile</Text>
        <Text style={styles.errorMessage}>
          {profileError || 'Your account profile could not be loaded.'}
        </Text>

        <Pressable
          style={styles.retryButton}
          onPress={() => setRetryCount((count) => count + 1)}
        >
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  const currentRoute = segments[segments.length - 1];
  const isScanRoute = currentRoute === 'scan';
  const isStudent = profile.role === 'student';

  if (isScanRoute && !isStudent) {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: {
          backgroundColor: COLORS.card,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'home-sharp' : 'home-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          href: isStudent ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'qr-code' : 'qr-code-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'time' : 'time-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="teacher"
        options={{
          title: 'Events',
          href: isStudent ? null : undefined,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'clipboard' : 'clipboard-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  message: {
    marginTop: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  errorTitle: {
    marginTop: 12,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  errorMessage: {
    marginTop: 8,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: {
    color: COLORS.textOnPrimary,
    fontWeight: '700',
  },
});
