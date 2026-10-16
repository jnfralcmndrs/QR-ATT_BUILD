
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';

import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  getAttendanceHistory,
  type AttendanceRecord,
  getTeacherEventAttendance,
  type TeacherEventAttendance,
} from '@/lib/attendance';
import { getProfile, type Role } from '@/lib/profiles';
import { buildQRPayload } from '@/lib/qr';

type AdminAttendee = {
  studentId: string;
  studentName: string;
  scannedAt: string;
};

type AdminEvent = {
  eventId: string;
  eventCode: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  createdAt: string | null;
  teacherName: string;
  attendeeCount: number;
  attendees: AdminAttendee[];
};

type EventStatus = 'Upcoming' | 'Ongoing' | 'Ended';
type StatusFilter = 'All' | EventStatus;

function getEventStatus(
  startTime: string | null,
  endTime: string | null,
): EventStatus {
  const now = Date.now();
  const start = startTime ? new Date(startTime).getTime() : null;
  const end = endTime ? new Date(endTime).getTime() : null;

  if (end !== null && Number.isFinite(end) && now > end) {
    return 'Ended';
  }

  if (start !== null && Number.isFinite(start) && now < start) {
    return 'Upcoming';
  }

  if (start !== null && Number.isFinite(start)) {
    return 'Ongoing';
  }

  return 'Ended';
}

function getStatusStyle(status: EventStatus) {
  if (status === 'Ended') {
    return styles.endedBadge;
  }

  if (status === 'Ongoing') {
    return styles.ongoingBadge;
  }

  return styles.upcomingBadge;
}

export default function HistoryScreen() {
  const { user } = useAuth();

  const [role, setRole] = useState<Role | null>(null);
  const [studentRecords, setStudentRecords] = useState<AttendanceRecord[]>([]);
  const [teacherEvents, setTeacherEvents] = useState<TeacherEventAttendance[]>([]);
  const [adminEvents, setAdminEvents] = useState<AdminEvent[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  const [selectedQrEvent, setSelectedQrEvent] =
    useState<TeacherEventAttendance | null>(null);
  const [savingQr, setSavingQr] = useState(false);

  const qrExportRef = useRef<View>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAdminEvents = useCallback(async (): Promise<AdminEvent[]> => {
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, event_code, title, start_time, end_time, created_at, created_by')
      .order('created_at', { ascending: false });

    if (eventsError) {
      console.error('Admin events query failed:', eventsError.message);
      throw eventsError;
    }

    if (!events?.length) {
      setAdminEvents([]);
      return [];
    }

    const eventIds = events.map((event) => String(event.id));

    const { data: attendance, error: attendanceError } = await supabase
      .from('attendance')
      .select('event_id, student_id, scanned_at')
      .in('event_id', eventIds)
      .order('scanned_at', { ascending: false });

    if (attendanceError) {
      console.error('Admin attendance query failed:', attendanceError.message);
      throw attendanceError;
    }

    const rows = attendance ?? [];

    const profileIds = [
      ...new Set([
        ...events
          .map((event) => event.created_by)
          .filter((id): id is string => Boolean(id))
          .map(String),
        ...rows.map((row) => String(row.student_id)),
      ]),
    ];

    const nameById: Record<string, string> = {};

    if (profileIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', profileIds);

      if (profilesError) {
        console.error('Admin profile query failed:', profilesError.message);
        throw profilesError;
      }

      (profiles ?? []).forEach((profile) => {
        nameById[String(profile.id)] =
          profile.full_name?.trim() || 'Unnamed user';
      });
    }

    const result: AdminEvent[] = events.map((event) => {
      const eventId = String(event.id);

      const attendees = rows
        .filter((row) => String(row.event_id) === eventId)
        .map((row) => {
          const studentId = String(row.student_id);

          return {
            studentId,
            studentName: nameById[studentId] || shortId(studentId),
            scannedAt: String(row.scanned_at ?? ''),
          };
        });

      const teacherId = event.created_by ? String(event.created_by) : '';

      return {
        eventId,
        eventCode: String(event.event_code ?? ''),
        title: String(event.title ?? 'Untitled event'),
        startTime: event.start_time ?? null,
        endTime: event.end_time ?? null,
        createdAt: event.created_at ?? null,
        teacherName: teacherId
          ? nameById[teacherId] || shortId(teacherId)
          : 'Unknown teacher',
        attendeeCount: attendees.length,
        attendees,
      };
    });

    setAdminEvents(result);
    return result;
  }, []);

  const load = useCallback(
    async (showLoader = true) => {
      if (!user) {
        setRole(null);
        setStudentRecords([]);
        setTeacherEvents([]);
        setAdminEvents([]);
        setSelectedQrEvent(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (showLoader) {
        setLoading(true);
      }

      try {
        const profile = await getProfile(user.id);

        if (!profile) {
          throw new Error('Could not load your account profile.');
        }

        const currentRole = profile.role;
        setRole(currentRole);

        if (currentRole === 'admin') {
          setStudentRecords([]);
          setTeacherEvents([]);
          await loadAdminEvents();
        } else if (currentRole === 'teacher') {
          const events = await getTeacherEventAttendance(user.id);
          setTeacherEvents(events);
          setStudentRecords([]);
          setAdminEvents([]);
        } else {
          const records = await getAttendanceHistory(user.id);

          setStudentRecords(
            [...records].sort(
              (a, b) =>
                new Date(b.scannedAt).getTime() -
                new Date(a.scannedAt).getTime(),
            ),
          );

          setTeacherEvents([]);
          setAdminEvents([]);
        }
      } catch (error) {
        console.error('Unable to load history:', error);

        Alert.alert(
          'Unable to Load History',
          'Please check your connection and Supabase permissions, then try again.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user, loadAdminEvents],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load(false);
  };

  const openQrViewer = (event: TeacherEventAttendance) => {
    setSelectedQrEvent(event);
  };

  const closeQrViewer = () => {
    if (!savingQr) {
      setSelectedQrEvent(null);
    }
  };

  const saveEventQrAsImage = async () => {
    if (!selectedQrEvent || !qrExportRef.current || savingQr) {
      return;
    }

    setSavingQr(true);

    try {
      const permission = await MediaLibrary.requestPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Permission Required',
          'Allow photo library access to save the event QR code as an image.',
        );
        return;
      }

      const imageUri = await captureRef(qrExportRef.current, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      await MediaLibrary.saveToLibraryAsync(imageUri);

      Alert.alert(
        'QR Code Saved',
        'The event QR code has been saved to your photo gallery.',
      );
    } catch (error) {
      console.error('Unable to save event QR code:', error);

      Alert.alert(
        'Unable to Save QR Code',
        'The QR image could not be saved. Please try again.',
      );
    } finally {
      setSavingQr(false);
    }
  };

  if (loading || role === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.muted}>Loading history...</Text>
      </View>
    );
  }

  // ADMIN HISTORY
  if (role === 'admin') {
    const today = new Date().toDateString();

    const todaysScans = adminEvents.reduce(
      (total, event) =>
        total +
        event.attendees.filter(
          (attendee) =>
            attendee.scannedAt &&
            new Date(attendee.scannedAt).toDateString() === today,
        ).length,
      0,
    );

    const totalAttendance = adminEvents.reduce(
      (total, event) => total + event.attendeeCount,
      0,
    );

    const filteredEvents = adminEvents.filter((event) => {
      const query = search.trim().toLowerCase();

      const matchesSearch =
        !query ||
        event.title.toLowerCase().includes(query) ||
        event.eventCode.toLowerCase().includes(query) ||
        event.teacherName.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === 'All' ||
        getEventStatus(event.startTime, event.endTime) === statusFilter;

      return matchesSearch && matchesStatus;
    });

    return (
      <View style={styles.container}>
        <FlatList
          data={filteredEvents}
          keyExtractor={(item) => item.eventId}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View>
              <View style={styles.pageHeader}>
                <Text style={styles.eyebrow}>ADMINISTRATOR</Text>
                <Text style={styles.pageTitle}>System History</Text>
                <Text style={styles.muted}>
                  Monitor events and attendance across all teachers.
                </Text>
              </View>

              <View style={styles.statsGrid}>
                <StatCard label="Total Events" value={adminEvents.length} icon="▦" />
                <StatCard label="Attendance Records" value={totalAttendance} icon="✓" />
                <StatCard label="Today's Scans" value={todaysScans} icon="◷" />
                <StatCard
                  label="Teachers With Events"
                  value={
                    new Set(
                      adminEvents
                        .filter((event) => event.teacherName !== 'Unknown teacher')
                        .map((event) => event.teacherName),
                    ).size
                  }
                  icon="♙"
                />
              </View>

              <Text style={styles.sectionTitle}>All Events</Text>

              <TextInput
                style={styles.searchInput}
                placeholder="Search event, code, or teacher..."
                placeholderTextColor={COLORS.textSecondary}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                clearButtonMode="while-editing"
              />

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
              >
                {(['All', 'Upcoming', 'Ongoing', 'Ended'] as StatusFilter[]).map(
                  (filter) => {
                    const active = statusFilter === filter;

                    return (
                      <Pressable
                        key={filter}
                        onPress={() => setStatusFilter(filter)}
                        style={[
                          styles.filterChip,
                          active && styles.filterChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterText,
                            active && styles.filterTextActive,
                          ]}
                        >
                          {filter}
                        </Text>
                      </Pressable>
                    );
                  },
                )}
              </ScrollView>

              <Text style={styles.resultText}>
                Showing {filteredEvents.length} of {adminEvents.length} events
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const status = getEventStatus(item.startTime, item.endTime);
            const expanded = expandedEvent === item.eventId;

            return (
              <View style={[styles.card, styles.teacherEventCard]}>
                <View style={styles.eventTopRow}>
                  <View style={styles.eventIcon}>
                    <Text style={styles.eventIconText}>▦</Text>
                  </View>

                  <View style={styles.eventInfo}>
                    <Text style={styles.eventTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.eventCode}>{item.eventCode}</Text>
                  </View>

                  <View style={[styles.statusBadge, getStatusStyle(status)]}>
                    <Text style={styles.statusText}>{status}</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <InfoRow label="Created by" value={item.teacherName} />
                <InfoRow
                  label="Event starts"
                  value={item.startTime ? formatDate(item.startTime) : 'Not specified'}
                />
                <InfoRow
                  label="Event ends"
                  value={item.endTime ? formatDate(item.endTime) : 'Not specified'}
                />

                <View style={styles.attendanceSummary}>
                  <View>
                    <Text style={styles.attendanceNumber}>{item.attendeeCount}</Text>
                    <Text style={styles.mutedSmall}>Attendance records</Text>
                  </View>

                  <Pressable
                    onPress={() =>
                      setExpandedEvent(expanded ? null : item.eventId)
                    }
                    style={styles.detailsButton}
                  >
                    <Text style={styles.detailsButtonText}>
                      {expanded ? 'Hide Details' : 'View Attendees'}
                    </Text>
                  </Pressable>
                </View>

                {expanded ? (
                  <View style={styles.attendeeSection}>
                    <Text style={styles.sectionSubtitle}>Attendance Records</Text>

                    {item.attendees.length === 0 ? (
                      <Text style={styles.emptyText}>
                        No students have scanned this event yet.
                      </Text>
                    ) : (
                      item.attendees.map((attendee) => (
                        <View
                          key={`${attendee.studentId}-${attendee.scannedAt}`}
                          style={styles.attendeeRow}
                        >
                          <View style={styles.avatar}>
                            <Text style={styles.avatarText}>
                              {attendee.studentName.charAt(0).toUpperCase()}
                            </Text>
                          </View>

                          <View style={styles.attendeeInfo}>
                            <Text style={styles.attendeeName}>
                              {attendee.studentName}
                            </Text>
                            <Text style={styles.mutedSmall}>
                              {formatDate(attendee.scannedAt)}
                            </Text>
                          </View>

                          <Text style={styles.presentText}>Present</Text>
                        </View>
                      ))
                    )}
                  </View>
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                {adminEvents.length === 0 ? 'No events found' : 'No matching events'}
              </Text>
              <Text style={styles.emptyText}>
                {adminEvents.length === 0
                  ? 'Events created by teachers will appear here.'
                  : 'Try another search or change the status filter.'}
              </Text>
            </View>
          }
          ListFooterComponent={<View style={styles.listFooter} />}
        />
      </View>
    );
  }

  // TEACHER HISTORY
  if (role === 'teacher') {
    return (
      <>
        <View style={styles.container}>
          <FlatList
            data={teacherEvents}
            keyExtractor={(item) => item.eventId}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={styles.pageHeader}>
                <Text style={styles.eyebrow}>TEACHER</Text>
                <Text style={styles.pageTitle}>My Events</Text>
                <Text style={styles.muted}>
                  Review your events, QR codes, and attendance records.
                </Text>
                <Text style={styles.resultText}>
                  {teacherEvents.length} events created
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const status = getEventStatus(item.startTime, item.endTime);

              return (
                <View style={[styles.card, styles.teacherEventCard]}>
                  <View style={styles.eventTopRow}>
                    <View style={styles.eventIcon}>
                      <Text style={styles.eventIconText}>▦</Text>
                    </View>

                    <View style={styles.eventInfo}>
                      <Text style={styles.eventTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={styles.eventCode}>{item.eventCode}</Text>
                    </View>

                    <View style={[styles.statusBadge, getStatusStyle(status)]}>
                      <Text style={styles.statusText}>{status}</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <InfoRow
                    label="Event starts"
                    value={item.startTime ? formatDate(item.startTime) : 'Not specified'}
                  />
                  <InfoRow
                    label="Event ends"
                    value={item.endTime ? formatDate(item.endTime) : 'Not specified'}
                  />

                  <View style={styles.attendanceSummary}>
                    <View>
                      <Text style={styles.attendanceNumber}>
                        {item.attendeeCount}
                      </Text>
                      <Text style={styles.mutedSmall}>Attendance records</Text>
                    </View>

                    <Pressable
                      style={styles.detailsButton}
                      onPress={() => openQrViewer(item)}
                    >
                      <Text style={styles.detailsButtonText}>View QR Code</Text>
                    </Pressable>
                  </View>

                  <View style={styles.attendeeSection}>
                    <Text style={styles.sectionSubtitle}>Attendance Records</Text>

                    {item.attendees.length > 0 ? (
                      item.attendees.map((attendee) => (
                        <View
                          key={`${attendee.studentId}-${attendee.scannedAt}`}
                          style={styles.attendeeRow}
                        >
                          <View style={styles.avatar}>
                            <Text style={styles.avatarText}>
                              {(attendee.studentName || 'S')
                                .charAt(0)
                                .toUpperCase()}
                            </Text>
                          </View>

                          <View style={styles.attendeeInfo}>
                            <Text style={styles.attendeeName}>
                              {attendee.studentName || shortId(attendee.studentId)}
                            </Text>
                            <Text style={styles.mutedSmall}>
                              {formatDate(attendee.scannedAt)}
                            </Text>
                          </View>

                          <View style={styles.presentBadge}>
                            <Text style={styles.presentText}>Recorded</Text>
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.emptyText}>
                        No students have scanned this event yet.
                      </Text>
                    )}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No events yet</Text>
                <Text style={styles.emptyText}>
                  Events you create will appear here.
                </Text>
              </View>
            }
            ListFooterComponent={<View style={styles.listFooter} />}
          />
        </View>

        <Modal
          visible={selectedQrEvent !== null}
          transparent
          animationType="fade"
          onRequestClose={closeQrViewer}
          statusBarTranslucent
        >
          <View style={styles.modalOverlay}>
            <View style={styles.qrModal}>
              <View style={styles.qrModalHeader}>
                <View style={styles.qrModalHeading}>
                  <Text style={styles.qrModalTitle}>Event QR Code</Text>
                  <Text style={styles.qrModalSubtitle}>
                    Save or display this code for attendance scanning.
                  </Text>
                </View>

                <Pressable
                  onPress={closeQrViewer}
                  disabled={savingQr}
                  style={styles.closeButton}
                  accessibilityRole="button"
                  accessibilityLabel="Close QR code"
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </Pressable>
              </View>

              {selectedQrEvent ? (
                <>
                  <View
                    ref={qrExportRef}
                    collapsable={false}
                    style={styles.qrExportCard}
                  >
                    <Text style={styles.qrExportTitle}>
                      {selectedQrEvent.title}
                    </Text>
                    <Text style={styles.qrExportCode}>
                      {selectedQrEvent.eventCode}
                    </Text>

                    <View style={styles.qrCodeContainer}>
                      <QRCode
                        value={buildQRPayload({
                          eventId: selectedQrEvent.eventCode,
                          title: selectedQrEvent.title,
                          start: selectedQrEvent.startTime ?? undefined,
                          end: selectedQrEvent.endTime ?? undefined,
                        })}
                        size={230}
                        backgroundColor="#FFFFFF"
                        color="#000000"
                        ecl="H"
                      />
                    </View>

                    <Text style={styles.qrExportFooter}>QR-ATT Attendance</Text>
                    <Text style={styles.qrExportHint}>
                      Scan this code to record attendance.
                    </Text>
                  </View>

                  <Pressable
                    style={[
                      styles.saveQrButton,
                      savingQr && styles.disabledButton,
                    ]}
                    onPress={() => void saveEventQrAsImage()}
                    disabled={savingQr}
                  >
                    {savingQr ? (
                      <View style={styles.savingRow}>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text style={styles.saveQrButtonText}>
                          Saving image...
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.saveQrButtonText}>
                        ↓ Save as Image
                      </Text>
                    )}
                  </Pressable>

                  <Text style={styles.qrModalNote}>
                    The QR image will be saved to your device's photo gallery.
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        </Modal>
      </>
    );
  }

  // STUDENT HISTORY
  return (
    <View style={styles.container}>
      <FlatList
        data={studentRecords}
        keyExtractor={(item) => String(item.id)}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.pageHeader}>
            <Text style={styles.eyebrow}>STUDENT</Text>
            <Text style={styles.pageTitle}>Attendance History</Text>
            <Text style={styles.muted}>
              Review your latest attendance records.
            </Text>
            <Text style={styles.resultText}>
              {studentRecords.length} records
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={[styles.card, styles.teacherEventCard]}>
            <View style={styles.eventTopRow}>
              <View style={styles.eventIcon}>
                <Text style={styles.eventIconText}>✓</Text>
              </View>

              <View style={styles.eventInfo}>
                <Text style={styles.eventTitle} numberOfLines={2}>
                  {item.eventTitle}
                </Text>
                <Text style={styles.eventCode}>{item.eventId}</Text>
              </View>

              {index === 0 ? (
                <View style={[styles.statusBadge, styles.ongoingBadge]}>
                  <Text style={styles.statusText}>Latest</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.divider} />

            <InfoRow
              label="Scanned at"
              value={formatDate(item.scannedAt)}
            />

            <View style={styles.studentRecordFooter}>
              <View style={styles.recordedIcon}>
                <Text style={styles.recordedIconText}>✓</Text>
              </View>
              <Text style={styles.recordedLabel}>Attendance recorded</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No attendance records</Text>
            <Text style={styles.emptyText}>
              Scan an event QR code to register your attendance.
            </Text>
          </View>
        }
        ListFooterComponent={<View style={styles.listFooter} />}
      />
    </View>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIcon}>
        <Text style={styles.statIconText}>{icon}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function shortId(id: string) {
  return id ? `…${id.slice(-8)}` : 'Unknown user';
}

function formatDate(value: string) {
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 18,
    paddingTop: 56,
  },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  listContent: {
    paddingBottom: 24,
  },
  listFooter: {
    height: 28,
  },
  pageHeader: {
    marginBottom: 20,
  },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 7,
  },
  pageTitle: {
    fontSize: 27,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  muted: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  mutedSmall: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 17,
    padding: 14,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#E0F2E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statIconText: {
    fontSize: 18,
    color: '#237A53',
    fontWeight: '800',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  statLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 4,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
  },
  filterRow: {
    gap: 8,
    paddingVertical: 12,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  resultText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 10,
    marginBottom: 12,
  },

  // Shared card design used by ADMIN, TEACHER, and STUDENT.
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  teacherEventCard: {
    // Kept as a compatibility style; the shared card design is in styles.card.
  },
  eventTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eventIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#E0F2E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventIconText: {
    color: '#237A53',
    fontSize: 20,
    fontWeight: '800',
  },
  eventInfo: {
    flex: 1,
    minWidth: 0,
  },
  eventTitle: {
    fontSize: 17,
    color: COLORS.textPrimary,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 23,
  },
  eventCode: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5,
    letterSpacing: 0.3,
  },
  statusBadge: {
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignSelf: 'center',
  },
  endedBadge: {
    backgroundColor: '#E0F2E9',
  },
  ongoingBadge: {
    backgroundColor: '#DBEAFE',
  },
  upcomingBadge: {
    backgroundColor: '#FEF3C7',
  },
  statusText: {
    color: COLORS.textPrimary,
    fontSize: 10,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 13,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  infoLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    flex: 0.8,
  },
  infoValue: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    flex: 1.4,
    textAlign: 'right',
  },
  attendanceSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 13,
    marginTop: 3,
  },
  attendanceNumber: {
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  detailsButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 11,
  },
  detailsButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  attendeeSection: {
    marginTop: 15,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 13,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E0F2E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#237A53',
    fontSize: 13,
    fontWeight: '800',
  },
  attendeeInfo: {
    flex: 1,
    minWidth: 0,
  },
  attendeeName: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  presentText: {
    color: '#237A53',
    fontSize: 10,
    fontWeight: '800',
  },
  presentBadge: {
    backgroundColor: '#E0F2E9',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  studentRecordFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EAF5EE',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginTop: 3,
  },
  recordedIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#D8EDDE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordedIconText: {
    color: '#237A53',
    fontSize: 13,
    fontWeight: '800',
  },
  recordedLabel: {
    color: '#237A53',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    marginTop: 8,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 7,
  },
  listFooter: {
    height: 28,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  qrModal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 18,
    alignItems: 'center',
  },
  qrModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
    gap: 12,
  },
  qrModalHeading: {
    flex: 1,
  },
  qrModalTitle: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  qrModalSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  qrExportCard: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 20,
    paddingHorizontal: 12,
  },
  qrExportTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  qrExportCode: {
    color: '#4B5563',
    fontSize: 12,
    marginTop: 5,
    marginBottom: 15,
    textAlign: 'center',
  },
  qrCodeContainer: {
    backgroundColor: '#FFFFFF',
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrExportFooter: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 14,
  },
  qrExportHint: {
    color: '#6B7280',
    fontSize: 10,
    marginTop: 5,
    textAlign: 'center',
  },
  saveQrButton: {
    width: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 13,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  disabledButton: {
    opacity: 0.65,
  },
  saveQrButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  qrModalNote: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 10,
  },
});
