
import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
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
import { signIn } from '@/lib/auth';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (loading) return;

    Keyboard.dismiss();
    setError(null);

    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);

    try {
      const { data, error: authError } = await signIn(
        cleanEmail,
        password
      );

      if (authError) {
        setError(authError.message);
        return;
      }

      if (!data.session) {
        setError('No active session was returned. Please try again.');
        return;
      }

      router.replace('/(tabs)');
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to sign in. Please try again.'
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
                  <Ionicons name="qr-code" size={29} color="#FFFFFF" />
                </View>
                <View>
                  <Text style={styles.brandName}>QR-ATT</Text>
                  <Text style={styles.brandCaption}>ATTENDANCE SYSTEM</Text>
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

            <View style={styles.welcomeSection}>
              <View style={styles.welcomeIcon}>
                <Ionicons
                  name="hand-right-outline"
                  size={25}
                  color={COLORS.primary}
                />
              </View>

              <Text style={styles.eyebrow}>WELCOME BACK</Text>
              <Text style={styles.title}>Let's get you signed in.</Text>
              <Text style={styles.subtitle}>
                Access your account and make school attendance simple.
              </Text>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Sign in to your account</Text>
              <Text style={styles.formSubtitle}>
                Enter your registered account details below.
              </Text>

              <Text style={styles.label}>Email address</Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="mail-outline"
                  size={20}
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
                  size={20}
                  color={COLORS.textSecondary}
                />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    if (error) setError(null);
                  }}
                  placeholder="Enter your password"
                  placeholderTextColor={COLORS.textSecondary}
                  secureTextEntry={!showPassword}
                  autoComplete="current-password"
                  textContentType="password"
                  editable={!loading}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
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
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={21}
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
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.loadingText}>Signing in...</Text>
                  </View>
                ) : (
                  <AppButton
                    theme="primary"
                    title="Sign In"
                    icon="arrow-forward-outline"
                    onPress={handleLogin}
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

            <View style={styles.registerCard}>
              <View style={styles.registerIcon}>
                <Ionicons
                  name="person-add-outline"
                  size={21}
                  color={COLORS.primary}
                />
              </View>

              <View style={styles.registerCopy}>
                <Text style={styles.registerTitle}>New to QR-ATT?</Text>
                <Text style={styles.registerSubtitle}>
                  Create an account to get started.
                </Text>
              </View>

              <Link href="/register" asChild>
                <TouchableOpacity
                  style={styles.registerButton}
                  disabled={loading}
                  accessibilityRole="button"
                >
                  <Text style={styles.registerButtonText}>Sign up</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={COLORS.primary}
                  />
                </TouchableOpacity>
              </Link>
            </View>

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
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 20,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 34,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: COLORS.textPrimary,
  },
  brandCaption: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.3,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
  },
  secureText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  welcomeSection: {
    marginBottom: 24,
  },
  welcomeIcon: {
    width: 47,
    height: 47,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 17,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
    color: COLORS.primary,
    marginBottom: 9,
  },
  title: {
    fontSize: 30,
    lineHeight: 37,
    fontWeight: '800',
    letterSpacing: -0.7,
    color: COLORS.textPrimary,
    marginBottom: 9,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.textSecondary,
    maxWidth: 330,
  },
  formCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 21,
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
    marginTop: 6,
    marginBottom: 23,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  inputContainer: {
    minHeight: 53,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    borderRadius: 13,
    paddingHorizontal: 13,
    marginBottom: 19,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 13,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  passwordToggle: {
    padding: 5,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#FDECEC',
    borderRadius: 11,
    padding: 12,
    marginBottom: 15,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.danger,
  },
  buttonContainer: {
    marginTop: 2,
  },
  loadingButton: {
    minHeight: 52,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  securityNote: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
    marginTop: 17,
  },
  securityText: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  registerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 17,
    padding: 14,
    marginTop: 19,
    gap: 11,
  },
  registerIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerCopy: {
    flex: 1,
  },
  registerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  registerSubtitle: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  registerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 9,
    paddingLeft: 5,
  },
  registerButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
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
