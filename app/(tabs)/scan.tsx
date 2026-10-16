
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { registerAttendance } from '@/lib/attendance';
import { getProfile, type Profile } from '@/lib/profiles';

export default function ScanScreen() {
  const { session, user, loading: authLoading } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [scanned, setScanned] = useState(false);
  const [lastData, setLastData] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      if (authLoading) return;

      if (!session || !user?.id) {
        if (active) {
          setProfile(null);
          setProfileLoading(false);
        }
        return;
      }

      setProfileLoading(true);

      const result = await getProfile(user.id);

      if (active) {
        setProfile(result);
        setProfileLoading(false);
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [authLoading, session, user?.id]);

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanned || submitting || profile?.role !== 'student' || !user?.id) {
      return;
    }

    setScanned(true);
    setSubmitting(true);
    setLastData(data);
    setMessage(null);

    try {
      const result = await registerAttendance(data, user.id);
      setMessage(result.message);
      setSuccess(result.success);
    } catch (error) {
      console.error('Attendance registration failed:', error);
      setMessage('Unable to record attendance. Please try again.');
      setSuccess(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleScanAgain = () => {
    setScanned(false);
    setLastData(null);
    setMessage(null);
    setSuccess(false);
    setSubmitting(false);
  };

  if (authLoading || profileLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.subtitle}>Checking account permissions...</Text>
      </View>
    );
  }

  if (!session || !user) {
    return <Redirect href="/login" />;
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Profile Unavailable</Text>
        <Text style={styles.subtitle}>
          We couldn't verify your account role. Please return to your profile
          or sign in again.
        </Text>
        <AppButton
          theme="primary"
          title="Back to Dashboard"
          icon="home"
          onPress={() => {
            // The dashboard can be opened using the tab bar.
          }}
        />
      </View>
    );
  }

  if (profile.role !== 'student') {
    return <Redirect href="/" />;
  }

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.subtitle}>Preparing camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <View style={styles.permissionIcon}>
          <Text style={styles.permissionEmoji}>▦</Text>
        </View>
        <Text style={styles.title}>Camera Permission Needed</Text>
        <Text style={styles.subtitle}>
          Allow camera access to scan your teacher's attendance QR code.
        </Text>
        <AppButton
          theme="primary"
          title="Grant Camera Permission"
          icon="camera"
          onPress={() => {
            void requestPermission();
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={
          scanned || submitting ? undefined : handleBarcodeScanned
        }
      />

      <View style={styles.topHeader}>
        <Text style={styles.headerTitle}>Scan Attendance</Text>
        <Text style={styles.headerSubtitle}>
          Position the event QR code inside the camera view.
        </Text>
      </View>

      <View style={styles.scanFrameContainer} pointerEvents="none">
        <View style={styles.scanFrame}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
      </View>

      <View style={styles.overlay}>
        <Text style={styles.overlayTitle}>
          {submitting
            ? 'Recording attendance...'
            : scanned
              ? 'QR Code Detected'
              : 'Ready to Scan?'}
        </Text>

        <Text style={styles.overlaySubtitle}>
          {submitting
            ? 'Please wait while your attendance is submitted.'
            : scanned
              ? 'Here is the result of your scan.'
              : 'Keep the QR code steady inside the frame.'}
        </Text>

        {submitting && (
          <ActivityIndicator
            size="small"
            color={COLORS.primary}
            style={styles.resultLoader}
          />
        )}

        {scanned && message !== null && (
          <View
            style={[
              styles.resultBox,
              success ? styles.successBox : styles.errorBox,
            ]}
          >
            <Text
              style={[
                styles.scanResult,
                success ? styles.successText : styles.errorText,
              ]}
            >
              {message}
            </Text>
          </View>
        )}

        {scanned && lastData !== null && (
          <Text style={styles.scanData} numberOfLines={3}>
            QR data: {lastData}
          </Text>
        )}

        {scanned && !submitting && (
          <View style={styles.buttonContainer}>
            <AppButton
              theme="primary"
              title="Scan Another Code"
              icon="refresh"
              onPress={handleScanAgain}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },

  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },

  camera: {
    ...StyleSheet.absoluteFillObject,
  },

  topHeader: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },

  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 21,
    fontWeight: '700',
    textAlign: 'center',
  },

  headerSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 5,
  },

  scanFrameContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scanFrame: {
    width: 245,
    height: 245,
    position: 'relative',
  },

  corner: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderColor: '#FFFFFF',
  },

  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 5,
    borderLeftWidth: 5,
    borderTopLeftRadius: 15,
  },

  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 5,
    borderRightWidth: 5,
    borderTopRightRadius: 15,
  },

  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 5,
    borderLeftWidth: 5,
    borderBottomLeftRadius: 15,
  },

  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 5,
    borderRightWidth: 5,
    borderBottomRightRadius: 15,
  },

  overlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 20,
    alignItems: 'center',
    elevation: 8,
  },

  overlayTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },

  overlaySubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 12,
  },

  resultLoader: {
    marginVertical: 8,
  },

  resultBox: {
    width: '100%',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },

  successBox: {
    backgroundColor: '#E8F5E9',
  },

  errorBox: {
    backgroundColor: '#FFEBEE',
  },

  scanResult: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },

  successText: {
    color: '#2E7D32',
  },

  errorText: {
    color: '#C62828',
  },

  scanData: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },

  buttonContainer: {
    width: '100%',
    marginTop: 14,
  },

  title: {
    fontSize: 21,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },

  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 18,
    marginTop: 8,
  },

  permissionIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },

  permissionEmoji: {
    fontSize: 32,
    color: COLORS.primary,
  },
});
