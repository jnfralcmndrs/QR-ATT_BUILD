
import { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Alert,
  TextInput,
  Pressable,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth, signOut } from '@/lib/auth';
import { getProfile, updateProfile, type Profile } from '@/lib/profiles';

export default function ProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [draftName, setDraftName] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user?.id) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    setProfileError(null);

    try {
      const result = await getProfile(user.id);

      setProfile(result);
      setDraftName(result?.full_name ?? '');

      if (!result) {
        setProfileError('Your account profile could not be found.');
      }
    } catch (error) {
      console.error('Profile loading error:', error);
      setProfileError('Unable to load your profile. Please try again.');
    } finally {
      setProfileLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile])
  );

  const handleSaveName = async () => {
    if (!user?.id || saving) return;

    const name = draftName.trim();

    if (!name) {
      Alert.alert('Name Required', 'Please enter your full name.');
      return;
    }

    setSaving(true);

    try {
      const { error } = await updateProfile(user.id, {
        full_name: name,
      });

      if (error) {
        Alert.alert('Unable to Save', error);
        return;
      }

      setProfile((previous) =>
        previous ? { ...previous, full_name: name } : previous
      );

      setDraftName(name);
      setEditing(false);
      Alert.alert('Success', 'Your name has been updated.');
    } catch (error) {
      console.error('Profile update error:', error);
      Alert.alert('Error', 'Unable to update your name. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    if (loading) return;

    setLoading(true);

    try {
      await signOut();
      router.replace('/login');
    } catch (error) {
      console.error('Sign-out error:', error);

      // If the local session has already been cleared,
      // allow the user to return to the login screen.
      router.replace('/login');
    } finally {
      setLoading(false);
    }
  };

  const role = profile?.role;
  const roleLabel =
    role === 'admin'
      ? 'Administrator'
      : role === 'teacher'
        ? 'Teacher'
        : 'Student';

  const roleIcon =
    role === 'admin'
      ? 'shield-checkmark-outline'
      : role === 'teacher'
        ? 'school-outline'
        : 'person-outline';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.eyebrow}>ACCOUNT SETTINGS</Text>
            <Text style={styles.title}>My Profile</Text>
            <Text style={styles.subtitle}>
              Manage your account information.
            </Text>
          </View>

          <View style={styles.headerIcon}>
            <Ionicons
              name="person-circle-outline"
              size={30}
              color={COLORS.primary}
            />
          </View>
        </View>

        {profileLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading your profile...</Text>
          </View>
        ) : profileError ? (
          <View style={styles.messageCard}>
            <Ionicons
              name="alert-circle-outline"
              size={32}
              color={COLORS.danger}
            />

            <Text style={styles.messageTitle}>Profile Unavailable</Text>
            <Text style={styles.messageText}>{profileError}</Text>

            <AppButton
              title="Try Again"
              icon="refresh-outline"
              theme="primary"
              onPress={() => void loadProfile()}
            />
          </View>
        ) : (
          <>
            <View style={styles.identityCard}>
              <View style={styles.avatar}>
                <Ionicons
                  name={roleIcon as React.ComponentProps<typeof Ionicons>['name']}
                  size={35}
                  color={COLORS.primary}
                />
              </View>

              <Text style={styles.displayName}>
                {profile?.full_name?.trim() || 'Welcome to QR-ATT'}
              </Text>

              <Text style={styles.emailText}>
                {user?.email || profile?.email || 'No email available'}
              </Text>

              <View
                style={[
                  styles.roleBadge,
                  role === 'admin' && styles.adminBadge,
                  role === 'teacher' && styles.teacherBadge,
                ]}
              >
                <Ionicons
                  name={roleIcon as React.ComponentProps<typeof Ionicons>['name']}
                  size={14}
                  color={COLORS.primary}
                />
                <Text style={styles.roleText}>{roleLabel}</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Personal Information</Text>

            <View style={styles.infoCard}>
              <View style={styles.fieldHeader}>
                <View style={styles.fieldIcon}>
                  <Ionicons
                    name="person-outline"
                    size={19}
                    color={COLORS.primary}
                  />
                </View>

                <Text style={styles.label}>Full Name</Text>

                {!editing && (
                  <Pressable
                    style={styles.editButton}
                    onPress={() => {
                      setDraftName(profile?.full_name ?? '');
                      setEditing(true);
                    }}
                  >
                    <Ionicons
                      name="create-outline"
                      size={16}
                      color={COLORS.primary}
                    />
                    <Text style={styles.editButtonText}>Edit</Text>
                  </Pressable>
                )}
              </View>

              {editing ? (
                <>
                  <TextInput
                    style={styles.nameInput}
                    value={draftName}
                    onChangeText={setDraftName}
                    placeholder="Enter your full name"
                    placeholderTextColor={COLORS.textSecondary}
                    editable={!saving}
                    autoCapitalize="words"
                    maxLength={100}
                    returnKeyType="done"
                    onSubmitEditing={handleSaveName}
                  />

                  <View style={styles.editActions}>
                    <View style={styles.editActionButton}>
                      <AppButton
                        title="Cancel"
                        icon="close-outline"
                          onPress={() => {
                            setDraftName(profile?.full_name ?? '');
                            setEditing(false);
                          }}
                        disabled={saving}
                      />
                    </View>

                    <View style={styles.editActionButton}>
                      <AppButton
                        title={saving ? 'Saving...' : 'Save Changes'}
                        icon="checkmark-outline"
                        theme="primary"
                        onPress={handleSaveName}
                        disabled={saving}
                      />
                    </View>
                  </View>
                </>
              ) : (
                <Text style={styles.value}>
                  {profile?.full_name?.trim() || 'No name added yet'}
                </Text>
              )}

              <View style={styles.separator} />

              <View style={styles.fieldHeader}>
                <View style={styles.fieldIcon}>
                  <Ionicons
                    name="mail-outline"
                    size={19}
                    color={COLORS.primary}
                  />
                </View>
                <Text style={styles.label}>Email Address</Text>
              </View>

              <Text style={styles.value}>
                {user?.email || profile?.email || 'Not available'}
              </Text>

              <View style={styles.separator} />

              <View style={styles.fieldHeader}>
                <View style={styles.fieldIcon}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={19}
                    color={COLORS.primary}
                  />
                </View>
                <Text style={styles.label}>Account Role</Text>
              </View>

              <Text style={styles.value}>{roleLabel}</Text>

              <View style={styles.separator} />

              <View style={styles.fieldHeader}>
                <View style={styles.fieldIcon}>
                  <Ionicons
                    name="finger-print-outline"
                    size={19}
                    color={COLORS.primary}
                  />
                </View>
                <Text style={styles.label}>User ID</Text>
              </View>

              <Text selectable style={styles.userId}>
                {user?.id || 'Not available'}
              </Text>
            </View>

            <View style={styles.securityNote}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={COLORS.primary}
              />
              <Text style={styles.securityText}>
                Your account role determines which attendance features are
                available to you.
              </Text>
            </View>
          </>
        )}

        <View style={styles.signOutCard}>
          <View style={styles.signOutInfo}>
            <Text style={styles.signOutTitle}>Sign out</Text>
            <Text style={styles.signOutSubtitle}>
              Return to the login screen on this device.
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color={COLORS.danger} />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              style={({ pressed }) => [
                styles.signOutButton,
                pressed && styles.pressed,
              ]}
              onPress={handleSignOut}
              disabled={loading}
            >
              <Ionicons
                name="log-out-outline"
                size={20}
                color={COLORS.danger}
              />
              <Text style={styles.signOutButtonText}>Sign Out</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.footer}>QR-ATT · Attendance Management</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 36,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 5,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 5,
  },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityCard: {
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 25,
    marginBottom: 26,
  },
  avatar: {
    width: 82,
    height: 82,
    borderRadius: 28,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  displayName: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  emailText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 30,
    paddingHorizontal: 13,
    paddingVertical: 7,
    marginTop: 14,
  },
  teacherBadge: {
    backgroundColor: '#E7F5FF',
  },
  adminBadge: {
    backgroundColor: '#F1ECFF',
  },
  roleText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 21,
    padding: 17,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },
  fieldIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  label: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  value: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginLeft: 44,
  },
  userId: {
    fontSize: 11,
    lineHeight: 17,
    color: COLORS.textSecondary,
    marginLeft: 44,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  nameInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: COLORS.textPrimary,
    fontSize: 15,
    marginBottom: 12,
  },
  editActions: {
    flexDirection: 'row',
    gap: 9,
  },
  editActionButton: {
    flex: 1,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 17,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    padding: 14,
    marginTop: 15,
  },
  securityText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 10,
  },
  loadingCard: {
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 12,
  },
  messageCard: {
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    padding: 24,
    gap: 12,
  },
  messageTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  messageText: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  signOutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 19,
    padding: 16,
    marginTop: 22,
  },
  signOutInfo: {
    flex: 1,
  },
  signOutTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  signOutSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF0EF',
    borderWidth: 1,
    borderColor: '#F3D3D0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  signOutButtonText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.7,
  },
  footer: {
    color: COLORS.textSecondary,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 24,
  },
});
