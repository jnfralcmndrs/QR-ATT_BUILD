
import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { signUp } from '@/lib/auth';

type Role = 'student' | 'teacher';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (loading) return;

    Keyboard.dismiss();
    setError(null);

    const cleanName = fullName.trim();
    const cleanEmail = email.trim();

    if (!cleanName || !cleanEmail || !password || !confirmPassword) {
      setError('Please complete all fields.');
      return;
    }

    if (password.length < 6) {
      setError('Your password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Your passwords do not match. Please try again.');
      return;
    }

    setLoading(true);

    try {
      const { data, error: authError } = await signUp(
        cleanEmail,
        password,
        {
          full_name: cleanName,
          role,
        }
      );

      if (authError) {
        setError(authError.message);
        return;
      }

      if (data.session) {
        router.replace('/(tabs)');
        return;
      }

      setSuccess(true);
    } catch (err: unknown) {
      console.error('[REGISTER] Registration failed:', err);

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to create your account. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.topRow}>
              <View style={styles.brand}>
                <View style={styles.logo}>
                  <Ionicons name="qr-code" size={28} color="#FFFFFF" />
                </View>

                <View>
                  <Text style={styles.brandName}>QR-ATT</Text>
                  <Text style={styles.brandCaption}>
                    ATTENDANCE SYSTEM
                  </Text>
                </View>
              </View>

              <View style={styles.secureBadge}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={15}
                  color={COLORS.primary}
                />
                <Text style={styles.secureText}>Secure</Text>
              </View>
            </View>

            <View style={styles.headingSection}>
              <View style={styles.headingIcon}>
                <Ionicons
                  name="person-add-outline"
                  size={25}
                  color={COLORS.primary}
                />
              </View>

              <Text style={styles.eyebrow}>GET STARTED</Text>
              <Text style={styles.title}>Create your account.</Text>
              <Text style={styles.subtitle}>
                Join QR-ATT to make school event attendance easier.
              </Text>
            </View>

            {success ? (
              <View style={styles.successCard}>
                <View style={styles.successIcon}>
                  <Ionicons
                    name="mail-open-outline"
                    size={34}
                    color={COLORS.success}
                  />
                </View>

                <Text style={styles.successTitle}>Check your email!</Text>
                <Text style={styles.successText}>
                  Your registration was submitted successfully. If email
                  confirmation is enabled, open the confirmation link sent to:
                </Text>

                <Text style={styles.successEmail}>{email.trim()}</Text>

                <Text style={styles.successHint}>
                  After confirming your account, return to QR-ATT and sign in.
                </Text>

                <View style={styles.successButton}>
                  <AppButton
                    theme="primary"
                    title="Back to Sign In"
                    icon="log-in-outline"
                    onPress={() => router.replace('/login')}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>Your details</Text>
                <Text style={styles.formSubtitle}>
                  Fill in the information below to register.
                </Text>

                <Text style={styles.label}>Full name</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="person-outline"
                    size={19}
                    color={COLORS.textSecondary}
                  />

                  <TextInput
                    style={styles.input}
                    value={fullName}
                    onChangeText={(value) => {
                      setFullName(value);
                      if (error) setError(null);
                    }}
                    placeholder="Enter your full name"
                    placeholderTextColor={COLORS.textSecondary}
                    autoCapitalize="words"
                    autoCorrect={false}
                    editable={!loading}
                    returnKeyType="next"
                  />
                </View>

                <Text style={styles.label}>I am a...</Text>
                <View style={styles.roleRow}>
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: role === 'student' }}
                    disabled={loading}
                    onPress={() => setRole('student')}
                    style={[
                      styles.roleCard,
                      role === 'student' && styles.roleCardActive,
                    ]}
                  >
                    <View
                      style={[
                        styles.roleIcon,
                        role === 'student' && styles.roleIconActive,
                      ]}
                    >
                      <Ionicons
                        name="school-outline"
                        size={23}
                        color={
                          role === 'student'
                            ? COLORS.primary
                            : COLORS.textSecondary
                        }
                      />
                    </View>

                    <Text
                      style={[
                        styles.roleTitle,
                        role === 'student' && styles.roleTitleActive,
                      ]}
                    >
                      Student
                    </Text>

                    <Text style={styles.roleDescription}>
                      Scan event QR codes
                    </Text>

                    <View
                      style={[
                        styles.radioOuter,
                        role === 'student' && styles.radioOuterActive,
                      ]}
                    >
                      {role === 'student' ? (
                        <View style={styles.radioInner} />
                      ) : null}
                    </View>
                  </Pressable>

                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: role === 'teacher' }}
                    disabled={loading}
                    onPress={() => setRole('teacher')}
                    style={[
                      styles.roleCard,
                      role === 'teacher' && styles.roleCardActive,
                    ]}
                  >
                    <View
                      style={[
                        styles.roleIcon,
                        role === 'teacher' && styles.roleIconActive,
                      ]}
                    >
                      <Ionicons
                        name="briefcase-outline"
                        size={23}
                        color={
                          role === 'teacher'
                            ? COLORS.primary
                            : COLORS.textSecondary
                        }
                      />
                    </View>

                    <Text
                      style={[
                        styles.roleTitle,
                        role === 'teacher' && styles.roleTitleActive,
                      ]}
                    >
                      Teacher
                    </Text>

                    <Text style={styles.roleDescription}>
                      Manage school events
                    </Text>

                    <View
                      style={[
                        styles.radioOuter,
                        role === 'teacher' && styles.radioOuterActive,
                      ]}
                    >
                      {role === 'teacher' ? (
                        <View style={styles.radioInner} />
                      ) : null}
                    </View>
                  </Pressable>
                </View>

                <Text style={styles.label}>Email address</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="mail-outline"
                    size={19}
                    color={COLORS.textSecondary}
                  />

                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={(value) => {
                      setEmail(value);
                      if (error) setError(null);
                    }}
                    placeholder="you@example.com"
                    placeholderTextColor={COLORS.textSecondary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    autoComplete="email"
                    textContentType="emailAddress"
                    editable={!loading}
                    returnKeyType="next"
                  />
                </View>

                <Text style={styles.label}>Password</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={19}
                    color={COLORS.textSecondary}
                  />

                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={(value) => {
                      setPassword(value);
                      if (error) setError(null);
                    }}
                    placeholder="At least 6 characters"
                    placeholderTextColor={COLORS.textSecondary}
                    secureTextEntry={!showPassword}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    editable={!loading}
                    returnKeyType="next"
                  />

                  <TouchableOpacity
                    style={styles.passwordToggle}
                    onPress={() => setShowPassword((value) => !value)}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    <Ionicons
                      name={
                        showPassword ? 'eye-off-outline' : 'eye-outline'
                      }
                      size={20}
                      color={COLORS.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Confirm password</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={19}
                    color={COLORS.textSecondary}
                  />

                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={(value) => {
                      setConfirmPassword(value);
                      if (error) setError(null);
                    }}
                    placeholder="Re-enter your password"
                    placeholderTextColor={COLORS.textSecondary}
                    secureTextEntry={!showConfirmPassword}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    editable={!loading}
                    returnKeyType="done"
                    onSubmitEditing={handleRegister}
                  />

                  <TouchableOpacity
                    style={styles.passwordToggle}
                    onPress={() =>
                      setShowConfirmPassword((value) => !value)
                    }
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showConfirmPassword
                        ? 'Hide confirm password'
                        : 'Show confirm password'
                    }
                  >
                    <Ionicons
                      name={
                        showConfirmPassword
                          ? 'eye-off-outline'
                          : 'eye-outline'
                      }
                      size={20}
                      color={COLORS.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                {error ? (
                  <View style={styles.errorBox}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={19}
                      color={COLORS.danger}
                    />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <View style={styles.buttonContainer}>
                  {loading ? (
                    <View style={styles.loadingButton}>
                      <ActivityIndicator
                        size="small"
                        color="#FFFFFF"
                      />
                      <Text style={styles.loadingText}>
                        Creating your account...
                      </Text>
                    </View>
                  ) : (
                    <AppButton
                      theme="primary"
                      title="Create Account"
                      icon="person-add-outline"
                      onPress={handleRegister}
                    />
                  )}
                </View>

                <View style={styles.securityNote}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={15}
                    color={COLORS.success}
                  />
                  <Text style={styles.securityText}>
                    Your account details are handled securely.
                  </Text>
                </View>
              </View>
            )}

            {!success ? (
              <View style={styles.loginPrompt}>
                <Text style={styles.loginPromptText}>
                  Already have an account?{' '}
                </Text>
                <Link href="/login" asChild>
                  <TouchableOpacity disabled={loading}>
                    <Text style={styles.loginLink}>Sign in</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            ) : null}

            <Text style={styles.footer}>
              QR-ATT · SCHOOL EVENT ATTENDANCE
            </Text>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 22,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  logo: {
    width: 49,
    height: 49,
    borderRadius: 15,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: 0.5,
  },
  brandCaption: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  secureText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  headingSection: {
    marginBottom: 23,
  },
  headingIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    marginBottom: 15,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.7,
    color: COLORS.primary,
    marginBottom: 8,
  },
  title: {
    fontSize: 29,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 21,
    color: COLORS.textSecondary,
  },
  formCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    padding: 19,
  },
  formTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  formSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textSecondary,
    marginTop: 5,
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  inputContainer: {
    minHeight: 51,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
    marginBottom: 17,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  passwordToggle: {
    padding: 5,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 19,
  },
  roleCard: {
    flex: 1,
    minHeight: 130,
    position: 'relative',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    backgroundColor: COLORS.background,
  },
  roleCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  roleIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
  },
  roleIconActive: {
    backgroundColor: COLORS.card,
  },
  roleTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  roleTitleActive: {
    color: COLORS.primary,
  },
  roleDescription: {
    fontSize: 10,
    lineHeight: 15,
    color: COLORS.textSecondary,
    marginTop: 4,
    paddingRight: 4,
  },
  radioOuter: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: COLORS.primary,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#FDECEC',
    borderRadius: 11,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.danger,
  },
  buttonContainer: {
    marginTop: 3,
  },
  loadingButton: {
    minHeight: 51,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  securityNote: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  securityText: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  loginPrompt: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 22,
  },
  loginPromptText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  loginLink: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  successCard: {
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    padding: 24,
  },
  successIcon: {
    width: 70,
    height: 70,
    borderRadius: 23,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
  },
  successText: {
    fontSize: 13,
    lineHeight: 21,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  successEmail: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    textAlign: 'center',
    marginTop: 12,
  },
  successHint: {
    fontSize: 12,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 13,
  },
  successButton: {
    width: '100%',
    marginTop: 22,
  },
  footer: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 25,
  },
});
