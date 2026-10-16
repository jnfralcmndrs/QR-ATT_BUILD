
import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { COLORS } from '@/constants/colors';
import { createEvent } from '@/lib/events';
import { buildQRPayload } from '@/lib/qr';
import { useAuth } from '@/lib/auth';
import { getProfile, type Role } from '@/lib/profiles';

/**
 * Convert the selected local Date to a timezone-aware ISO timestamp.
 * Use this when saving to Supabase timestamptz columns.
 */
function toLocalISO(date: Date): string {
  return date.toISOString();
}

function formatDateTime(date: Date) {
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();

  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${month} ${day}, ${year} · ${time}`;
}

const QUICK_END_OPTIONS = [
  { label: '30 min', ms: 30 * 60 * 1000 },
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '2 hours', ms: 2 * 60 * 60 * 1000 },
];

type EditTarget = 'start' | 'end';
type EditingPart = 'date' | 'time';

export default function TeacherScreen() {
  const { user } = useAuth();

  const [role, setRole] = useState<Role | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState('');

  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(
    () => new Date(Date.now() + 60 * 60 * 1000)
  );

  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editingPart, setEditingPart] = useState<EditingPart>('date');

  const [payload, setPayload] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error'>(
    'success'
  );
  const [saving, setSaving] = useState(false);

  const isAndroid = Platform.OS === 'android';

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadRole = async () => {
        if (!user) {
          if (active) {
            setRole(null);
            setRoleLoading(false);
          }
          return;
        }

        setRoleLoading(true);

        try {
          const profile = await getProfile(user.id);

          if (active) {
            setRole(profile?.role ?? 'student');
          }
        } catch (error) {
          console.error('Unable to load teacher profile:', error);

          if (active) {
            setRole(null);
          }
        } finally {
          if (active) {
            setRoleLoading(false);
          }
        }
      };

      void loadRole();

      return () => {
        active = false;
      };
    }, [user])
  );

  const showMessage = (
    text: string,
    type: 'success' | 'error' = 'success'
  ) => {
    setMessage(text);
    setMessageType(type);
  };

  const openPicker = (target: EditTarget) => {
    Keyboard.dismiss();
    setMessage(null);
    setEditTarget(target);
    setEditingPart('date');
  };

  const onPickerChange = (
    event: DateTimePickerEvent,
    selected?: Date
  ) => {
    if (!editTarget) return;

    if (event.type === 'dismissed' || !selected) {
      setEditTarget(null);
      setEditingPart('date');
      return;
    }

    const current = editTarget === 'start' ? startDate : endDate;
    const next = new Date(current);

    if (isAndroid && editingPart === 'date') {
      // Change the date only; preserve the selected time.
      next.setFullYear(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate()
      );

      if (editTarget === 'start') {
        setStartDate(next);
      } else {
        setEndDate(next);
      }

      // Android opens the time picker after the date picker.
      setEditingPart('time');
      return;
    }

    if (isAndroid && editingPart === 'time') {
      // Change the time only; preserve the selected date.
      next.setHours(
        selected.getHours(),
        selected.getMinutes(),
        0,
        0
      );
    } else {
      // iOS datetime picker.
      next.setTime(selected.getTime());
      next.setSeconds(0, 0);
    }

    if (editTarget === 'start') {
      setStartDate(next);
    } else {
      setEndDate(next);
    }

    setEditTarget(null);
    setEditingPart('date');
  };

  const handleQuickEnd = (ms: number) => {
    setMessage(null);
    setEndDate(new Date(startDate.getTime() + ms));
  };

  const handleCreateEvent = async () => {
    if (saving) return;

    Keyboard.dismiss();
    setMessage(null);

    const trimmedTitle = title.trim();
    const trimmedEventId = eventId.trim();

    if (!trimmedTitle || !trimmedEventId) {
      showMessage(
        'Please enter both the event title and event code.',
        'error'
      );
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      showMessage(
        'The end date and time must be later than the start date and time.',
        'error'
      );
      return;
    }

    const event = {
      eventId: trimmedEventId,
      title: trimmedTitle,
      start: toLocalISO(startDate),
      end: toLocalISO(endDate),
    };

    try {
      setSaving(true);

      const { error } = await createEvent(event);

      if (error) {
        console.error('Unable to create event:', error);

        showMessage(
          'Could not save the event. Check the event code and try again.',
          'error'
        );
        return;
      }

      setPayload(buildQRPayload(event));

      showMessage(
        'Event created successfully! Your QR code is ready.',
        'success'
      );
    } catch (error) {
      console.error('Event creation failed:', error);

      showMessage(
        'Something went wrong while creating the event. Please try again.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setEventId('');
    setStartDate(new Date());
    setEndDate(new Date(Date.now() + 60 * 60 * 1000));
    setPayload(null);
    setMessage(null);
    setEditTarget(null);
    setEditingPart('date');
  };

  if (roleLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.centerSubtitle}>Checking your account...</Text>
      </View>
    );
  }

  if (role !== 'teacher') {
    return (
      <View style={styles.center}>
        <View style={styles.lockIcon}>
          <Ionicons
            name="lock-closed-outline"
            size={32}
            color={COLORS.primary}
          />
        </View>

        <Text style={styles.lockTitle}>Teachers Only</Text>

        <Text style={styles.centerSubtitle}>
          Only authorized teacher accounts can create attendance events.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <View style={styles.brand}>
            <View style={styles.brandIcon}>
              <Ionicons name="qr-code-outline" size={25} color="#FFFFFF" />
            </View>

            <View>
              <Text style={styles.brandName}>QR-ATT</Text>
              <Text style={styles.brandCaption}>TEACHER DASHBOARD</Text>
            </View>
          </View>

          <View style={styles.secureBadge}>
            <Ionicons
              name="shield-checkmark-outline"
              size={14}
              color="#237A53"
            />
            <Text style={styles.secureText}>Teacher</Text>
          </View>
        </View>

        <Text style={styles.heroTitle}>Create an Event</Text>

        <Text style={styles.heroSubtitle}>
          Set your event schedule and generate a QR code for student
          attendance.
        </Text>

        <View style={styles.heroFeatures}>
          <View style={styles.featureItem}>
            <Ionicons name="calendar-outline" size={16} color="#FFFFFF" />
            <Text style={styles.featureText}>Set schedule</Text>
          </View>

          <View style={styles.featureItem}>
            <Ionicons name="qr-code-outline" size={16} color="#FFFFFF" />
            <Text style={styles.featureText}>Generate QR</Text>
          </View>
        </View>
      </View>

      <View style={styles.formCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIcon}>
            <Ionicons
              name="create-outline"
              size={21}
              color={COLORS.primary}
            />
          </View>

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Event Details</Text>
            <Text style={styles.sectionSubtitle}>
              Enter the information for your event.
            </Text>
          </View>
        </View>

        <Text style={styles.label}>Event Title</Text>

        <View style={styles.inputContainer}>
          <Ionicons
            name="document-text-outline"
            size={19}
            color={COLORS.textSecondary}
          />

          <TextInput
            style={styles.input}
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              setMessage(null);
            }}
            placeholder="e.g. Founders Day Assembly"
            placeholderTextColor={COLORS.textSecondary}
            returnKeyType="next"
            editable={!saving}
            maxLength={100}
          />
        </View>

        <Text style={styles.label}>Event Code</Text>

        <View style={styles.inputContainer}>
          <Ionicons
            name="key-outline"
            size={19}
            color={COLORS.textSecondary}
          />

          <TextInput
            style={styles.input}
            value={eventId}
            onChangeText={(value) => {
              setEventId(value.toUpperCase());
              setMessage(null);
            }}
            placeholder="e.g. EVT-2026-0002"
            placeholderTextColor={COLORS.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            editable={!saving}
            maxLength={50}
          />
        </View>

        <Text style={styles.inputHint}>
          Use a unique code for every event.
        </Text>

        <View style={styles.sectionDivider} />

        <View style={styles.sectionHeader}>
          <View style={styles.sectionIcon}>
            <Ionicons
              name="time-outline"
              size={21}
              color={COLORS.primary}
            />
          </View>

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Event Schedule</Text>
            <Text style={styles.sectionSubtitle}>
              Choose when attendance should begin and end.
            </Text>
          </View>
        </View>

        <Text style={styles.label}>Starts</Text>

        <PickerField
          value={formatDateTime(startDate)}
          icon="play-circle-outline"
          onPress={() => openPicker('start')}
          disabled={saving}
        />

        <Text style={styles.label}>Ends</Text>

        <PickerField
          value={formatDateTime(endDate)}
          icon="stop-circle-outline"
          onPress={() => openPicker('end')}
          disabled={saving}
        />

        <Text style={styles.quickLabel}>QUICK END TIME</Text>

        <View style={styles.chipRow}>
          {QUICK_END_OPTIONS.map((option) => (
            <Pressable
              key={option.label}
              style={({ pressed }) => [
                styles.chip,
                pressed && styles.chipPressed,
                saving && styles.disabled,
              ]}
              onPress={() => handleQuickEnd(option.ms)}
              disabled={saving}
            >
              <Ionicons
                name="add-outline"
                size={15}
                color={COLORS.primary}
              />
              <Text style={styles.chipText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.inputHint}>
          Quick options calculate the end time from the selected start time.
        </Text>

        {editTarget ? (
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>
                {editTarget === 'start' ? 'Start' : 'End'}{' '}
                {isAndroid
                  ? editingPart === 'date'
                    ? 'Date'
                    : 'Time'
                  : 'Date & Time'}
              </Text>

              {isAndroid ? (
                <Text style={styles.pickerStep}>
                  {editingPart === 'date' ? '1 of 2' : '2 of 2'}
                </Text>
              ) : null}
            </View>

            <DateTimePicker
              value={editTarget === 'start' ? startDate : endDate}
              mode={isAndroid ? editingPart : 'datetime'}
              display={isAndroid ? 'default' : 'spinner'}
              onChange={onPickerChange}
            />

            {!isAndroid ? (
              <Pressable
                style={styles.doneButton}
                onPress={() => {
                  setEditTarget(null);
                  setEditingPart('date');
                }}
              >
                <Text style={styles.doneButtonText}>Done</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {message ? (
          <View
            style={[
              styles.messageBox,
              messageType === 'error'
                ? styles.errorMessageBox
                : styles.successMessageBox,
            ]}
          >
            <Ionicons
              name={
                messageType === 'error'
                  ? 'alert-circle-outline'
                  : 'checkmark-circle-outline'
              }
              size={20}
              color={messageType === 'error' ? '#B42318' : '#237A53'}
            />

            <Text
              style={[
                styles.messageText,
                messageType === 'error'
                  ? styles.errorMessageText
                  : styles.successMessageText,
              ]}
            >
              {message}
            </Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.createButton,
            pressed && !saving && styles.createButtonPressed,
            saving && styles.disabled,
          ]}
          onPress={() => void handleCreateEvent()}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons
                name="add-circle-outline"
                size={21}
                color="#FFFFFF"
              />
              <Text style={styles.createButtonText}>Create Event</Text>
              <Ionicons
                name="arrow-forward-outline"
                size={19}
                color="#FFFFFF"
              />
            </>
          )}
        </Pressable>
      </View>

      {payload ? (
        <View style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <View style={styles.resultSuccessIcon}>
              <Ionicons
                name="checkmark-circle"
                size={23}
                color="#237A53"
              />
            </View>

            <View style={styles.resultHeading}>
              <Text style={styles.resultTitle}>Your QR Is Ready!</Text>
              <Text style={styles.resultSubtitle}>{title.trim()}</Text>
            </View>
          </View>

          <View style={styles.resultInstruction}>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={COLORS.primary}
            />
            <Text style={styles.resultInstructionText}>
              Open the Scan tab to test this event QR code.
            </Text>
          </View>

          <View style={styles.qrBox}>
            <QRCode
              value={payload}
              size={220}
              color="#111827"
              backgroundColor="#FFFFFF"
              quietZone={12}
            />
          </View>

          <View style={styles.eventCodeBadge}>
            <Ionicons name="key-outline" size={15} color="#237A53" />
            <Text style={styles.eventCodeText}>{eventId.trim()}</Text>
          </View>

          <View style={styles.resultDivider} />

          <View style={styles.scheduleSummary}>
            <View style={styles.summaryRow}>
              <Ionicons
                name="play-circle-outline"
                size={18}
                color={COLORS.primary}
              />
              <View style={styles.summaryTextContainer}>
                <Text style={styles.summaryLabel}>Starts</Text>
                <Text style={styles.summaryValue}>
                  {formatDateTime(startDate)}
                </Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <Ionicons
                name="stop-circle-outline"
                size={18}
                color={COLORS.primary}
              />
              <View style={styles.summaryTextContainer}>
                <Text style={styles.summaryLabel}>Ends</Text>
                <Text style={styles.summaryValue}>
                  {formatDateTime(endDate)}
                </Text>
              </View>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.newEventButton,
              pressed && styles.newEventButtonPressed,
            ]}
            onPress={() => {
              Alert.alert(
                'Create Another Event?',
                'Your saved event will remain in History. Start a new event form?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'New Event', onPress: resetForm },
                ]
              );
            }}
          >
            <Ionicons
              name="add-outline"
              size={19}
              color={COLORS.primary}
            />
            <Text style={styles.newEventButtonText}>
              Create Another Event
            </Text>
          </Pressable>

          <Text style={styles.resultFootnote}>
            You can reopen previously created events from the History tab.
          </Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Ionicons
          name="shield-checkmark-outline"
          size={16}
          color={COLORS.textSecondary}
        />
        <Text style={styles.footerText}>
          QR-ATT · Attendance made simple
        </Text>
      </View>
    </ScrollView>
  );
}

type PickerFieldProps = {
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
};

function PickerField({
  value,
  icon,
  onPress,
  disabled = false,
}: PickerFieldProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.pickerField,
        pressed && !disabled && styles.pickerFieldPressed,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={styles.pickerFieldIcon}>
        <Ionicons name={icon} size={21} color={COLORS.primary} />
      </View>

      <Text style={styles.pickerValue}>{value}</Text>

      <Ionicons
        name="calendar-outline"
        size={18}
        color={COLORS.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 35,
  },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  centerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 10,
  },
  lockIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  lockTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 12,
  },
  hero: {
    backgroundColor: COLORS.primary,
    borderRadius: 22,
    padding: 20,
    marginBottom: 18,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  brandName: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: 1,
  },
  brandCaption: {
    color: '#E4F8EC',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.1,
    marginTop: 3,
  },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E7F8ED',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  secureText: {
    color: '#237A53',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    color: '#EAF7EF',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
  },
  heroFeatures: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 6,
  },
  formCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  sectionHeading: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 3,
    lineHeight: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 7,
    marginTop: 12,
  },
  inputContainer: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 13,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 13,
    paddingHorizontal: 10,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  inputHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 6,
    lineHeight: 16,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 21,
  },
  pickerField: {
    minHeight: 58,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 11,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerFieldPressed: {
    backgroundColor: COLORS.surface,
  },
  pickerFieldIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  pickerValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginRight: 8,
    lineHeight: 18,
  },
  quickLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginTop: 18,
    marginBottom: 9,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  pickerCard: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    marginTop: 16,
    alignItems: 'center',
  },
  pickerHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pickerTitle: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  pickerStep: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  doneButton: {
    alignSelf: 'stretch',
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 11,
    marginTop: 8,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  messageBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    padding: 12,
    marginTop: 18,
  },
  errorMessageBox: {
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#F6C7C7',
  },
  successMessageBox: {
    backgroundColor: '#E7F8ED',
    borderWidth: 1,
    borderColor: '#C7EBD5',
  },
  messageText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  errorMessageText: {
    color: '#B42318',
  },
  successMessageText: {
    color: '#237A53',
  },
  createButton: {
    minHeight: 53,
    backgroundColor: COLORS.primary,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 20,
  },
  createButtonPressed: {
    opacity: 0.85,
  },
  createButtonText: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginHorizontal: 10,
  },
  disabled: {
    opacity: 0.55,
  },
  resultCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 18,
    marginTop: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginBottom: 15,
  },
  resultSuccessIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#E0F2E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  resultHeading: {
    flex: 1,
  },
  resultTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  resultSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  resultInstruction: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 11,
    borderRadius: 11,
    marginBottom: 17,
  },
  resultInstructionText: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 11,
    lineHeight: 17,
    marginLeft: 7,
  },
  qrBox: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 13,
  },
  eventCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2E9',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  eventCodeText: {
    color: '#237A53',
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 6,
  },
  resultDivider: {
    height: 1,
    alignSelf: 'stretch',
    backgroundColor: COLORS.border,
    marginVertical: 18,
  },
  scheduleSummary: {
    alignSelf: 'stretch',
    gap: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryTextContainer: {
    flex: 1,
    marginLeft: 10,
  },
  summaryLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginBottom: 3,
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  newEventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 20,
  },
  newEventButtonPressed: {
    opacity: 0.7,
  },
  newEventButtonText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 7,
  },
  resultFootnote: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  footerText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginLeft: 6,
  },
});
