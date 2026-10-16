import { useCallback, useEffect, useMemo, useState } from 'react';
import { Redirect, router } from 'expo-router';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getProfile, type Profile } from '@/lib/profiles';
import { supabase } from '@/lib/supabase';

type UserRole = 'student' | 'teacher' | 'admin';

type AppEvent = {
  id: string;
  event_code: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  created_by: string | null;
  created_at: string | null;
};

type AppUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
};

type RawAppUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: unknown;
};

type AttendanceRow = {
  id?: string;
  event_id: string;
  student_id: string;
  scanned_at: string | null;
};

type AdminEvent = AppEvent & {
  attendeeCount: number;
  teacherName: string;
};

type TeacherEvent = AppEvent & {
  attendeeCount: number;
};

type TeacherAttendance = {
  event_id: string;
  student_id: string;
  scanned_at: string | null;
  eventTitle: string;
  studentName: string;
};

function normalizeRole(value: unknown): UserRole | null {
  const role = String(value ?? '').trim().toLowerCase();

  if (role === 'student' || role === 'teacher' || role === 'admin') {
    return role;
  }

  return null;
}

function normalizeUser(row: RawAppUser): AppUser | null {
  const role = normalizeRole(row.role);

  if (!role || !row.id) return null;

  return {
    id: String(row.id),
    email: String(row.email ?? '').trim(),
    full_name:
      typeof row.full_name === 'string' && row.full_name.trim()
        ? row.full_name.trim()
        : null,
    role,
  };
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';

  return date.toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not set';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';

  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getEventStatus(event: AppEvent) {
  const now = Date.now();
  const start = event.start_time
    ? new Date(event.start_time).getTime()
    : null;
  const end = event.end_time
    ? new Date(event.end_time).getTime()
    : null;

  if (start !== null && !Number.isNaN(start) && now < start) {
    return 'Upcoming';
  }

  if (end !== null && !Number.isNaN(end) && now > end) {
    return 'Ended';
  }

  if (
    start !== null &&
    end !== null &&
    !Number.isNaN(start) &&
    !Number.isNaN(end)
  ) {
    return 'Ongoing';
  }

  return 'Unscheduled';
}

export default function HomeScreen() {
  const { session, user, loading: authLoading } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');

  // Admin dashboard data
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);

  // Teacher dashboard data
  const [teacherLoading, setTeacherLoading] = useState(false);
  const [teacherError, setTeacherError] = useState('');
  const [teacherEvents, setTeacherEvents] = useState<TeacherEvent[]>([]);
  const [teacherAttendance, setTeacherAttendance] = useState<
    TeacherAttendance[]
  >([]);

  const [activeSection, setActiveSection] = useState<
    'overview' | 'events' | 'users'
  >('overview');

  const [eventSearch, setEventSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');

  const [selectedEvent, setSelectedEvent] =
    useState<AdminEvent | null>(null);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user?.id) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    setProfileError('');

    try {
      const result = await getProfile(user.id);

      if (!result) {
        setProfile(null);
        setProfileError(
          'Your profile could not be loaded. Check your profile record and permissions.',
        );
      } else {
        setProfile(result);
      }
    } catch (error) {
      console.error('Dashboard profile error:', error);
      setProfile(null);
      setProfileError('Unable to load your profile. Please try again.');
    } finally {
      setProfileLoading(false);
    }
  }, [user?.id]);

  const loadAdminData = useCallback(async () => {
    if (profile?.role !== 'admin') return;

    setAdminLoading(true);
    setAdminError('');

    try {
      const [eventsResult, usersResult, attendanceResult] =
        await Promise.all([
          supabase
            .from('events')
            .select(
              'id, event_code, title, start_time, end_time, created_by, created_at',
            )
            .order('created_at', { ascending: false }),

          supabase
            .from('profiles')
            .select('id, email, full_name, role')
            .order('full_name', { ascending: true }),

          supabase
            .from('attendance')
            .select('event_id, student_id, scanned_at'),
        ]);

      if (eventsResult.error) throw eventsResult.error;
      if (usersResult.error) throw usersResult.error;
      if (attendanceResult.error) throw attendanceResult.error;

      const eventRows = (eventsResult.data ?? []) as AppEvent[];
      const rawUserRows = (usersResult.data ?? []) as unknown as RawAppUser[];
      const attendanceRows = (attendanceResult.data ?? []) as AttendanceRow[];

      const normalizedUsers = rawUserRows
        .map(normalizeUser)
        .filter((item): item is AppUser => item !== null);

      const roleCounts = normalizedUsers.reduce(
        (counts, item) => {
          counts[item.role] += 1;
          return counts;
        },
        { student: 0, teacher: 0, admin: 0 },
      );

      console.log('Admin dashboard user role counts:', roleCounts);
      console.log(
        'Admin dashboard users loaded:',
        normalizedUsers.length,
        'of',
        rawUserRows.length,
      );

      const userMap = new Map(normalizedUsers.map((item) => [item.id, item]));
      const attendanceCounts = new Map<string, number>();

      attendanceRows.forEach((record) => {
        if (!record.event_id) return;
        attendanceCounts.set(
          record.event_id,
          (attendanceCounts.get(record.event_id) ?? 0) + 1,
        );
      });

      const mappedEvents: AdminEvent[] = eventRows.map((event) => {
        const teacher = event.created_by
          ? userMap.get(event.created_by)
          : undefined;

        return {
          ...event,
          attendeeCount: attendanceCounts.get(event.id) ?? 0,
          teacherName:
            teacher?.full_name || teacher?.email || 'Unknown teacher',
        };
      });

      setEvents(mappedEvents);
      setUsers(normalizedUsers);
      setAttendance(attendanceRows);
    } catch (error) {
      console.error('Admin dashboard loading error:', error);
      setAdminError(
        error instanceof Error
          ? error.message
          : 'Unable to load admin data. Check your internet connection and Supabase permissions.',
      );
    } finally {
      setAdminLoading(false);
    }
  }, [profile?.role]);

  const loadTeacherData = useCallback(async () => {
    if (profile?.role !== 'teacher' || !user?.id) return;

    setTeacherLoading(true);
    setTeacherError('');

    try {
      const eventsResult = await supabase
        .from('events')
        .select(
          'id, event_code, title, start_time, end_time, created_by, created_at',
        )
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });

      if (eventsResult.error) throw eventsResult.error;

      const ownEvents = (eventsResult.data ?? []) as AppEvent[];

      if (ownEvents.length === 0) {
        setTeacherEvents([]);
        setTeacherAttendance([]);
        return;
      }

      const eventIds = ownEvents.map((event) => event.id);

      const attendanceResult = await supabase
        .from('attendance')
        .select('event_id, student_id, scanned_at')
        .in('event_id', eventIds)
        .order('scanned_at', { ascending: false });

      if (attendanceResult.error) throw attendanceResult.error;

      const attendanceRows = (attendanceResult.data ?? []) as AttendanceRow[];
      const counts = new Map<string, number>();

      attendanceRows.forEach((row) => {
        counts.set(row.event_id, (counts.get(row.event_id) ?? 0) + 1);
      });

      setTeacherEvents(
        ownEvents.map((event) => ({
          ...event,
          attendeeCount: counts.get(event.id) ?? 0,
        })),
      );

      const studentIds = [
        ...new Set(
          attendanceRows.map((row) => row.student_id).filter(Boolean),
        ),
      ];

      let studentNames = new Map<string, string>();

      if (studentIds.length > 0) {
        const profilesResult = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', studentIds);

        if (profilesResult.error) {
          console.warn(
            'Teacher dashboard could not load student names:',
            profilesResult.error.message,
          );
        } else {
          studentNames = new Map(
            (profilesResult.data ?? []).map((item) => [
              String(item.id),
              String(item.full_name || item.email || 'Student'),
            ]),
          );
        }
      }

      const eventTitles = new Map(
        ownEvents.map((event) => [event.id, event.title]),
      );

      setTeacherAttendance(
        attendanceRows.slice(0, 8).map((row) => ({
          ...row,
          eventTitle: eventTitles.get(row.event_id) || 'Event',
          studentName: studentNames.get(row.student_id) || 'Student',
        })),
      );
    } catch (error) {
      console.error('Teacher dashboard loading error:', error);
      setTeacherError(
        error instanceof Error
          ? error.message
          : 'Unable to load your events and attendance. Please try again.',
      );
    } finally {
      setTeacherLoading(false);
    }
  }, [profile?.role, user?.id]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (profile?.role === 'admin') {
      void loadAdminData();
    }
  }, [profile?.role, loadAdminData]);

  useEffect(() => {
    if (profile?.role === 'teacher') {
      void loadTeacherData();
    }
  }, [profile?.role, loadTeacherData]);

  const refreshDashboard = useCallback(async () => {
    await loadProfile();
  }, [loadProfile]);

  const filteredEvents = useMemo(() => {
    const query = eventSearch.trim().toLowerCase();
    if (!query) return events;

    return events.filter(
      (event) =>
        (event.title ?? '').toLowerCase().includes(query) ||
        (event.event_code ?? '').toLowerCase().includes(query) ||
        (event.teacherName ?? '').toLowerCase().includes(query),
    );
  }, [events, eventSearch]);

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();

    return users.filter((item) => {
      const normalizedRole = normalizeRole(item.role);
      const matchesRole =
        roleFilter === 'all' || normalizedRole === roleFilter;

      const matchesSearch =
        !query ||
        (item.full_name ?? '').toLowerCase().includes(query) ||
        (item.email ?? '').toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query);

      return matchesRole && matchesSearch;
    });
  }, [users, userSearch, roleFilter]);

  const selectedEventAttendance = useMemo(() => {
    if (!selectedEvent) return [];

    return attendance
      .filter((record) => record.event_id === selectedEvent.id)
      .map((record) => {
        const attendee = users.find((item) => item.id === record.student_id);

        return {
          ...record,
          attendeeName:
            attendee?.full_name || attendee?.email || 'Unknown student',
        };
      })
      .sort((a, b) => {
        const aTime = a.scanned_at ? new Date(a.scanned_at).getTime() : 0;
        const bTime = b.scanned_at ? new Date(b.scanned_at).getTime() : 0;
        return aTime - bTime;
      });
  }, [selectedEvent, attendance, users]);

  const studentCount = users.filter((item) => item.role === 'student').length;
  const teacherCount = users.filter((item) => item.role === 'teacher').length;
  const adminCount = users.filter((item) => item.role === 'admin').length;

  const ongoingTeacherEvents = teacherEvents.filter(
    (event) => getEventStatus(event) === 'Ongoing',
  ).length;

  const upcomingTeacherEvents = teacherEvents.filter(
    (event) => getEventStatus(event) === 'Upcoming',
  ).length;

  const totalTeacherAttendance = teacherEvents.reduce(
    (total, event) => total + event.attendeeCount,
    0,
  );

  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading your account...</Text>
      </View>
    );
  }

  if (!session || !user) {
    return <Redirect href="/login" />;
  }

  if (profileLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorPage}>
          <View style={styles.largeIcon}>
            <Ionicons
              name="person-circle-outline"
              size={42}
              color={COLORS.primary}
            />
          </View>
          <Text style={styles.pageTitle}>Profile unavailable</Text>
          <Text style={styles.mutedText}>
            {profileError || 'Your profile information is not available.'}
          </Text>
          <AppButton title="Retry" icon="refresh-outline" onPress={loadProfile} />
          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.replace('/profile')}
          >
            <Text style={styles.secondaryButtonText}>Open Profile</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const displayName =
    profile.full_name?.trim() || profile.email?.split('@')[0] || 'User';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={profileLoading || adminLoading || teacherLoading}
            onRefresh={() => {
              if (profile.role === 'admin') {
                void loadAdminData();
              } else if (profile.role === 'teacher') {
                void loadTeacherData();
              } else {
                void refreshDashboard();
              }
            }}
            tintColor={COLORS.primary}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <Ionicons
                name="qr-code"
                size={25}
                color={COLORS.textOnPrimary}
              />
            </View>
            <View style={styles.brandTextContainer}>
              <Text style={styles.brandTitle}>QR-ATT</Text>
              <Text style={styles.brandSubtitle}>Attendance made simple</Text>
            </View>
          </View>

          <Pressable
            onPress={() => router.push('/profile')}
            style={styles.profileButton}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <Ionicons
              name="person-outline"
              size={22}
              color={COLORS.textPrimary}
            />
          </Pressable>
        </View>

        <View style={styles.welcomeCard}>
          <View style={styles.welcomeTextContainer}>
            <Text style={styles.eyebrow}>
              {profile.role.toUpperCase()} DASHBOARD
            </Text>
            <Text style={styles.welcomeTitle}>Hello, {displayName}!</Text>
            <Text style={styles.welcomeDescription}>
              {profile.role === 'admin'
                ? 'Manage users, review events, and monitor attendance.'
                : profile.role === 'teacher'
                  ? 'Manage your events and review attendance records.'
                  : 'Scan event QR codes and check your attendance history.'}
            </Text>
          </View>
          <View style={styles.welcomeIcon}>
            <Ionicons
              name={
                profile.role === 'admin'
                  ? 'shield-checkmark-outline'
                  : profile.role === 'teacher'
                    ? 'school-outline'
                    : 'qr-code-outline'
              }
              size={38}
              color={COLORS.primary}
            />
          </View>
        </View>

        {profile.role === 'admin' ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Admin overview</Text>
              <Pressable
                onPress={loadAdminData}
                disabled={adminLoading}
                style={styles.refreshButton}
              >
                <Ionicons
                  name="refresh-outline"
                  size={18}
                  color={COLORS.primary}
                />
                <Text style={styles.refreshText}>Refresh</Text>
              </Pressable>
            </View>

            <View style={styles.statsGrid}>
              <StatCard
                icon="calendar-outline"
                title="Total events"
                value={String(events.length)}
              />
              <StatCard
                icon="people-outline"
                title="Total users"
                value={String(users.length)}
              />
              <StatCard
                icon="school-outline"
                title="Teachers"
                value={String(teacherCount)}
              />
              <StatCard
                icon="person-outline"
                title="Students"
                value={String(studentCount)}
              />
            </View>

            <View style={styles.adminTabs}>
              <AdminTab
                title="Overview"
                icon="grid-outline"
                active={activeSection === 'overview'}
                onPress={() => setActiveSection('overview')}
              />
              <AdminTab
                title="Events"
                icon="calendar-outline"
                active={activeSection === 'events'}
                onPress={() => setActiveSection('events')}
              />
              <AdminTab
                title="Users"
                icon="people-outline"
                active={activeSection === 'users'}
                onPress={() => setActiveSection('users')}
              />
            </View>

            {adminError ? (
              <View style={styles.errorCard}>
                <Ionicons
                  name="alert-circle-outline"
                  size={24}
                  color={COLORS.danger}
                />
                <View style={styles.errorTextContainer}>
                  <Text style={styles.errorTitle}>Could not load admin data</Text>
                  <Text style={styles.errorMessage}>{adminError}</Text>
                  <Text style={styles.errorHint}>
                    Check your Supabase Row Level Security policies.
                  </Text>
                </View>
                <Pressable
                  onPress={loadAdminData}
                  style={styles.smallRetryButton}
                >
                  <Text style={styles.smallRetryText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {adminLoading ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.mutedText}>Loading administration data...</Text>
              </View>
            ) : null}

            {activeSection === 'overview' ? (
              <>
                <SectionHeading
                  title="Recent events"
                  subtitle="Events created by your teachers"
                  actionLabel="View all"
                  onAction={() => setActiveSection('events')}
                />
                {!adminLoading && !adminError && events.length === 0 ? (
                  <EmptyState
                    icon="calendar-outline"
                    title="No events found"
                    description="Events created by teachers will appear here."
                  />
                ) : null}
                {events.slice(0, 4).map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onPress={() => setSelectedEvent(event)}
                  />
                ))}

                <SectionHeading
                  title="User accounts"
                  subtitle="Registered students, teachers, and admins"
                  actionLabel="View all"
                  onAction={() => setActiveSection('users')}
                />
                {!adminLoading && !adminError && users.length === 0 ? (
                  <EmptyState
                    icon="people-outline"
                    title="No users found"
                    description="Registered accounts will appear here."
                  />
                ) : null}
                {users.slice(0, 4).map((item) => (
                  <UserCard
                    key={item.id}
                    user={item}
                    onPress={() => setSelectedUser(item)}
                  />
                ))}

                <View style={styles.readOnlyNote}>
                  <Ionicons
                    name="information-circle-outline"
                    size={19}
                    color={COLORS.textSecondary}
                  />
                  <Text style={styles.readOnlyText}>
                    This dashboard is for viewing records. User roles and
                    account details are not edited here.
                  </Text>
                </View>
              </>
            ) : null}

            {activeSection === 'events' ? (
              <>
                <SectionHeading
                  title="All events"
                  subtitle="Events from every teacher account"
                />
                <View style={styles.searchContainer}>
                  <Ionicons
                    name="search-outline"
                    size={20}
                    color={COLORS.textSecondary}
                  />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search title, code, or teacher..."
                    placeholderTextColor={COLORS.textSecondary}
                    value={eventSearch}
                    onChangeText={setEventSearch}
                    autoCapitalize="none"
                  />
                  {eventSearch.length > 0 ? (
                    <Pressable onPress={() => setEventSearch('')}>
                      <Ionicons
                        name="close-circle"
                        size={20}
                        color={COLORS.textSecondary}
                      />
                    </Pressable>
                  ) : null}
                </View>
                <Text style={styles.resultCount}>
                  {filteredEvents.length} event
                  {filteredEvents.length === 1 ? '' : 's'}
                </Text>
                {!adminLoading && !adminError && filteredEvents.length === 0 ? (
                  <EmptyState
                    icon="search-outline"
                    title="No matching events"
                    description="Try a different event title, code, or teacher name."
                  />
                ) : null}
                {filteredEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onPress={() => setSelectedEvent(event)}
                  />
                ))}
              </>
            ) : null}

            {activeSection === 'users' ? (
              <>
                <SectionHeading
                  title="All users"
                  subtitle="View registered account information"
                />
                <View style={styles.statsGrid}>
                  <StatCard
                    icon="person-outline"
                    title="Students"
                    value={String(studentCount)}
                  />
                  <StatCard
                    icon="school-outline"
                    title="Teachers"
                    value={String(teacherCount)}
                  />
                  <StatCard
                    icon="shield-checkmark-outline"
                    title="Admins"
                    value={String(adminCount)}
                  />
                  <StatCard
                    icon="people-outline"
                    title="All accounts"
                    value={String(users.length)}
                  />
                </View>
                <View style={styles.searchContainer}>
                  <Ionicons
                    name="search-outline"
                    size={20}
                    color={COLORS.textSecondary}
                  />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search name, email, or ID..."
                    placeholderTextColor={COLORS.textSecondary}
                    value={userSearch}
                    onChangeText={setUserSearch}
                    autoCapitalize="none"
                  />
                  {userSearch.length > 0 ? (
                    <Pressable onPress={() => setUserSearch('')}>
                      <Ionicons
                        name="close-circle"
                        size={20}
                        color={COLORS.textSecondary}
                      />
                    </Pressable>
                  ) : null}
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterRow}
                >
                  {(['all', 'student', 'teacher', 'admin'] as const).map(
                    (role) => (
                      <Pressable
                        key={role}
                        onPress={() => setRoleFilter(role)}
                        style={[
                          styles.filterChip,
                          roleFilter === role && styles.filterChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            roleFilter === role && styles.filterChipTextActive,
                          ]}
                        >
                          {role === 'all'
                            ? 'All roles'
                            : role.charAt(0).toUpperCase() + role.slice(1)}
                        </Text>
                      </Pressable>
                    ),
                  )}
                </ScrollView>

                <Text style={styles.resultCount}>
                  {filteredUsers.length} user
                  {filteredUsers.length === 1 ? '' : 's'}
                </Text>
                {!adminLoading && !adminError && filteredUsers.length === 0 ? (
                  <EmptyState
                    icon="people-outline"
                    title="No matching users"
                    description="Try another search or role filter."
                  />
                ) : null}
                {filteredUsers.map((item) => (
                  <UserCard
                    key={item.id}
                    user={item}
                    onPress={() => setSelectedUser(item)}
                  />
                ))}
              </>
            ) : null}
          </>
        ) : profile.role === 'teacher' ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Teacher overview</Text>
              <Pressable
                onPress={loadTeacherData}
                disabled={teacherLoading}
                style={styles.refreshButton}
              >
                <Ionicons
                  name="refresh-outline"
                  size={18}
                  color={COLORS.primary}
                />
                <Text style={styles.refreshText}>Refresh</Text>
              </Pressable>
            </View>

            <View style={styles.statsGrid}>
              <StatCard
                icon="calendar-outline"
                title="Total events"
                value={String(teacherEvents.length)}
              />
              <StatCard
                icon="radio-button-on-outline"
                title="Ongoing"
                value={String(ongoingTeacherEvents)}
              />
              <StatCard
                icon="time-outline"
                title="Upcoming"
                value={String(upcomingTeacherEvents)}
              />
              <StatCard
                icon="people-outline"
                title="Attendance records"
                value={String(totalTeacherAttendance)}
              />
            </View>

            <SectionHeading
              title="Quick actions"
              subtitle="Manage your events and attendance"
            />
            <ActionCard
              icon="calendar-outline"
              title="Manage events"
              description="Create events and display QR codes for attendance."
              buttonTitle="Open Events"
              onPress={() => router.push('/teacher')}
              primary
            />
            <ActionCard
              icon="people-outline"
              title="Attendance records"
              description="Review your events and the students who attended."
              buttonTitle="View Records"
              onPress={() => router.push('/history')}
            />

            {teacherError ? (
              <View style={styles.errorCard}>
                <Ionicons
                  name="alert-circle-outline"
                  size={24}
                  color={COLORS.danger}
                />
                <View style={styles.errorTextContainer}>
                  <Text style={styles.errorTitle}>
                    Could not load teacher data
                  </Text>
                  <Text style={styles.errorMessage}>{teacherError}</Text>
                  <Text style={styles.errorHint}>
                    If this continues, check your Supabase permissions.
                  </Text>
                </View>
                <Pressable
                  onPress={loadTeacherData}
                  style={styles.smallRetryButton}
                >
                  <Text style={styles.smallRetryText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {teacherLoading ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.mutedText}>Loading your events...</Text>
              </View>
            ) : null}

            <SectionHeading
              title="My events"
              subtitle="Events created by your account"
              actionLabel="Manage"
              onAction={() => router.push('/teacher')}
            />

            {!teacherLoading && !teacherError && teacherEvents.length === 0 ? (
              <EmptyState
                icon="calendar-outline"
                title="No events yet"
                description="Create your first event to see it listed here."
              />
            ) : null}

            {teacherEvents.slice(0, 5).map((event) => (
              <TeacherEventCard key={event.id} event={event} />
            ))}

            <SectionHeading
              title="Recent attendance"
              subtitle="The latest student check-ins for your events"
              actionLabel="View all"
              onAction={() => router.push('/history')}
            />

            {!teacherLoading &&
            !teacherError &&
            teacherAttendance.length === 0 ? (
              <EmptyState
                icon="people-outline"
                title="No attendance yet"
                description="Students who scan your event QR codes will appear here."
              />
            ) : null}

            {teacherAttendance.map((record, index) => (
              <View
                key={`${record.event_id}-${record.student_id}-${record.scanned_at ?? index}`}
                style={styles.recentAttendanceCard}
              >
                <View style={styles.attendeeAvatar}>
                  <Text style={styles.attendeeAvatarText}>
                    {record.studentName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.attendeeInfo}>
                  <Text style={styles.attendeeName} numberOfLines={1}>
                    {record.studentName}
                  </Text>
                  <Text style={styles.recentEventTitle} numberOfLines={1}>
                    {record.eventTitle}
                  </Text>
                  <Text style={styles.attendeeTime}>
                    {formatDateTime(record.scanned_at)}
                  </Text>
                </View>
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={COLORS.success}
                />
              </View>
            ))}

            <View style={styles.profileSummary}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Your account</Text>
                <Pressable
                  onPress={() => router.push('/profile')}
                  style={styles.viewProfileButton}
                >
                  <Text style={styles.viewProfileText}>View profile</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={COLORS.primary}
                  />
                </Pressable>
              </View>
              <AccountSummary displayName={displayName} profile={profile} />
            </View>
          </>
        ) : (
          <>
            {/* Student welcome section */}
            <View style={styles.studentIntro}>
              <View style={styles.studentIntroIcon}>
                <Ionicons
                  name="hand-left-outline"
                  size={23}
                  color={COLORS.primary}
                />
              </View>
              <Text style={styles.studentIntroTitle}>Ready to check in?</Text>
              <Text style={styles.studentIntroDescription}>
                Make your attendance count. Scan your event QR code when
                you're ready to join an activity.
              </Text>
            </View>

            {/* Main attendance scanning card */}
            <Pressable
              onPress={() => router.push('/scan')}
              accessibilityRole="button"
              accessibilityLabel="Scan attendance QR code"
              style={({ pressed }) => [
                styles.studentScanCard,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.studentScanTop}>
                <View style={styles.studentScanIcon}>
                  <Ionicons
                    name="scan-outline"
                    size={34}
                    color={COLORS.primary}
                  />
                </View>

                <View style={styles.studentScanBadge}>
                  <Text style={styles.studentScanBadgeText}>QUICK ACTION</Text>
                </View>
              </View>

              <Text style={styles.studentScanTitle}>Scan Attendance</Text>
              <Text style={styles.studentScanDescription}>
                Open the scanner and scan your teacher's event QR code to
                record your attendance.
              </Text>

              <View style={styles.studentScanButton}>
                <Text style={styles.studentScanButtonText}>Open Scanner</Text>
                <Ionicons
                  name="arrow-forward"
                  size={19}
                  color={COLORS.primary}
                />
              </View>
            </Pressable>

            {/* Student shortcuts */}
            <View style={styles.studentSectionHeader}>
              <Text style={styles.sectionTitle}>Your activities</Text>
              <Text style={styles.studentSectionCaption}>
                Access your records
              </Text>
            </View>

            <Pressable
              onPress={() => router.push('/history')}
              accessibilityRole="button"
              accessibilityLabel="View attendance history"
              style={({ pressed }) => [
                styles.studentShortcutCard,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.studentShortcutIcon}>
                <Ionicons
                  name="time-outline"
                  size={24}
                  color={COLORS.primary}
                />
              </View>

              <View style={styles.studentShortcutText}>
                <Text style={styles.studentShortcutTitle}>
                  Attendance History
                </Text>
                <Text style={styles.studentShortcutDescription}>
                  Review your previous attendance records.
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={21}
                color={COLORS.textSecondary}
              />
            </Pressable>

            <Pressable
              onPress={() => router.push('/profile')}
              accessibilityRole="button"
              accessibilityLabel="View your profile"
              style={({ pressed }) => [
                styles.studentShortcutCard,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.studentShortcutIcon}>
                <Ionicons
                  name="person-outline"
                  size={24}
                  color={COLORS.primary}
                />
              </View>

              <View style={styles.studentShortcutText}>
                <Text style={styles.studentShortcutTitle}>My Profile</Text>
                <Text style={styles.studentShortcutDescription}>
                  View your account information.
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={21}
                color={COLORS.textSecondary}
              />
            </Pressable>

            {/* Existing account summary */}
            <View style={styles.profileSummary}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Your account</Text>
                <Pressable
                  onPress={() => router.push('/profile')}
                  style={styles.viewProfileButton}
                >
                  <Text style={styles.viewProfileText}>View profile</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={COLORS.primary}
                  />
                </Pressable>
              </View>

              <AccountSummary
                displayName={displayName}
                profile={profile}
              />
            </View>
          </>
        )}

        <Text style={styles.footerText}>QR-ATT · Attendance made simple</Text>
      </ScrollView>

      {/* Admin event details modal */}
      <Modal
        visible={selectedEvent !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedEvent(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Event details</Text>
              <Pressable
                onPress={() => setSelectedEvent(null)}
                style={styles.modalCloseButton}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={COLORS.textPrimary}
                />
              </Pressable>
            </View>

            {selectedEvent ? (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalScrollContent}
              >
                <View style={styles.modalEventIcon}>
                  <Ionicons
                    name="calendar"
                    size={30}
                    color={COLORS.primary}
                  />
                </View>
                <Text style={styles.modalEventTitle}>
                  {selectedEvent.title}
                </Text>
                <Text style={styles.modalEventCode}>
                  {selectedEvent.event_code}
                </Text>

                <View style={styles.statusRow}>
                  <Text style={styles.fieldLabel}>Status</Text>
                  <StatusBadge status={getEventStatus(selectedEvent)} />
                </View>
                <DetailRow
                  label="Created by"
                  value={selectedEvent.teacherName}
                />
                <DetailRow
                  label="Start time"
                  value={formatDateTime(selectedEvent.start_time)}
                />
                <DetailRow
                  label="End time"
                  value={formatDateTime(selectedEvent.end_time)}
                />
                <DetailRow
                  label="Created on"
                  value={formatDateTime(selectedEvent.created_at)}
                />
                <DetailRow
                  label="Attendee count"
                  value={String(selectedEvent.attendeeCount)}
                />

                <Text style={styles.modalSectionTitle}>Attendance list</Text>
                {selectedEventAttendance.length === 0 ? (
                  <EmptyState
                    icon="people-outline"
                    title="No attendance yet"
                    description="Students who scan this event's QR code will appear here."
                  />
                ) : (
                  selectedEventAttendance.map((record, index) => (
                    <View
                      key={`${record.event_id}-${record.student_id}-${index}`}
                      style={styles.attendeeRow}
                    >
                      <View style={styles.attendeeAvatar}>
                        <Text style={styles.attendeeAvatarText}>
                          {record.attendeeName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.attendeeInfo}>
                        <Text style={styles.attendeeName}>
                          {record.attendeeName}
                        </Text>
                        <Text style={styles.attendeeTime}>
                          {formatDateTime(record.scanned_at)}
                        </Text>
                      </View>
                      <Ionicons
                        name="checkmark-circle"
                        size={21}
                        color={COLORS.success}
                      />
                    </View>
                  ))
                )}
                <AppButton
                  title="Close details"
                  icon="close-outline"
                  onPress={() => setSelectedEvent(null)}
                />
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Admin user details modal */}
      <Modal
        visible={selectedUser !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedUser(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>User details</Text>
              <Pressable
                onPress={() => setSelectedUser(null)}
                style={styles.modalCloseButton}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={COLORS.textPrimary}
                />
              </Pressable>
            </View>

            {selectedUser ? (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalScrollContent}
              >
                <View style={styles.userDetailAvatar}>
                  <Text style={styles.userDetailAvatarText}>
                    {(selectedUser.full_name || selectedUser.email || 'U')
                      .charAt(0)
                      .toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.modalEventTitle}>
                  {selectedUser.full_name || 'Name not provided'}
                </Text>
                <View style={styles.centeredRoleBadge}>
                  <Text style={styles.centeredRoleText}>
                    {selectedUser.role.toUpperCase()}
                  </Text>
                </View>
                <DetailRow
                  label="Full name"
                  value={selectedUser.full_name || 'Not provided'}
                />
                <DetailRow
                  label="Email"
                  value={selectedUser.email || 'Not provided'}
                />
                <DetailRow label="Role" value={selectedUser.role} />
                <DetailRow label="User ID" value={selectedUser.id} />
                <Text style={styles.readOnlyText}>
                  Account information is displayed for review only.
                </Text>
                <AppButton
                  title="Close details"
                  icon="close-outline"
                  onPress={() => setSelectedUser(null)}
                />
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SectionHeading({
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeadingContainer}>
      <View style={styles.sectionHeadingText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.headingAction}>
          <Text style={styles.headingActionText}>{actionLabel}</Text>
          <Ionicons
            name="chevron-forward"
            size={15}
            color={COLORS.primary}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

function StatCard({
  icon,
  title,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  value: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIcon}>
        <Ionicons name={icon} size={21} color={COLORS.primary} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );
}

function AdminTab({
  title,
  icon,
  active,
  onPress,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.adminTab, active && styles.adminTabActive]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={active ? COLORS.textOnPrimary : COLORS.textSecondary}
      />
      <Text
        style={[styles.adminTabText, active && styles.adminTabTextActive]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isOngoing = status === 'Ongoing';
  const isEnded = status === 'Ended';

  return (
    <View
      style={[
        styles.statusBadge,
        isOngoing
          ? styles.statusOngoing
          : isEnded
            ? styles.statusEnded
            : styles.statusUpcoming,
      ]}
    >
      <Text
        style={[
          styles.statusText,
          isOngoing
            ? styles.statusTextOngoing
            : isEnded
              ? styles.statusTextEnded
              : styles.statusTextUpcoming,
        ]}
      >
        {status}
      </Text>
    </View>
  );
}

function EventCard({
  event,
  onPress,
}: {
  event: AdminEvent;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.eventCard,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.eventCardTop}>
        <View style={styles.eventIcon}>
          <Ionicons
            name="calendar-outline"
            size={23}
            color={COLORS.primary}
          />
        </View>
        <View style={styles.eventMain}>
          <Text style={styles.eventTitle} numberOfLines={2}>
            {event.title}
          </Text>
          <Text style={styles.eventCode}>{event.event_code}</Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={19}
          color={COLORS.textSecondary}
        />
      </View>

      <View style={styles.eventDivider} />

      <View style={styles.eventInfoRow}>
        <Ionicons
          name="person-outline"
          size={16}
          color={COLORS.textSecondary}
        />
        <Text style={styles.eventInfoText} numberOfLines={1}>
          {event.teacherName}
        </Text>
      </View>
      <View style={styles.eventInfoRow}>
        <Ionicons
          name="time-outline"
          size={16}
          color={COLORS.textSecondary}
        />
        <Text style={styles.eventInfoText}>
          {formatDateTime(event.start_time)}
        </Text>
      </View>
      <View style={styles.eventFooter}>
        <StatusBadge status={getEventStatus(event)} />
        <View style={styles.attendeeCount}>
          <Ionicons
            name="people-outline"
            size={17}
            color={COLORS.primary}
          />
          <Text style={styles.attendeeCountText}>
            {event.attendeeCount} attendee
            {event.attendeeCount === 1 ? '' : 's'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function TeacherEventCard({ event }: { event: TeacherEvent }) {
  return (
    <View style={styles.eventCard}>
      <View style={styles.eventCardTop}>
        <View style={styles.eventIcon}>
          <Ionicons
            name="calendar-outline"
            size={23}
            color={COLORS.primary}
          />
        </View>
        <View style={styles.eventMain}>
          <Text style={styles.eventTitle} numberOfLines={2}>
            {event.title}
          </Text>
          <Text style={styles.eventCode}>{event.event_code}</Text>
        </View>
      </View>
      <View style={styles.eventDivider} />
      <View style={styles.eventInfoRow}>
        <Ionicons
          name="time-outline"
          size={16}
          color={COLORS.textSecondary}
        />
        <Text style={styles.eventInfoText}>
          Starts: {formatDateTime(event.start_time)}
        </Text>
      </View>
      <View style={styles.eventInfoRow}>
        <Ionicons
          name="calendar-outline"
          size={16}
          color={COLORS.textSecondary}
        />
        <Text style={styles.eventInfoText}>
          Ends: {formatDateTime(event.end_time)}
        </Text>
      </View>
      <View style={styles.eventFooter}>
        <StatusBadge status={getEventStatus(event)} />
        <View style={styles.attendeeCount}>
          <Ionicons
            name="people-outline"
            size={17}
            color={COLORS.primary}
          />
          <Text style={styles.attendeeCountText}>
            {event.attendeeCount} attendee
            {event.attendeeCount === 1 ? '' : 's'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function UserCard({
  user,
  onPress,
}: {
  user: AppUser;
  onPress: () => void;
}) {
  const name = user.full_name || 'Name not provided';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.userCard,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.userAvatar}>
        <Text style={styles.userAvatarText}>
          {name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.userMain}>
        <Text style={styles.userName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.userEmail} numberOfLines={1}>
          {user.email || 'No email provided'}
        </Text>
        <Text style={styles.userId} numberOfLines={1}>
          ID: {user.id}
        </Text>
      </View>
      <View style={styles.userCardRight}>
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>{user.role.toUpperCase()}</Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={17}
          color={COLORS.textSecondary}
        />
      </View>
    </Pressable>
  );
}

function ActionCard({
  icon,
  title,
  description,
  buttonTitle,
  onPress,
  primary = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  buttonTitle: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <View style={styles.actionCard}>
      <View style={styles.actionHeader}>
        <View
          style={[styles.actionIcon, primary && styles.primaryActionIcon]}
        >
          <Ionicons
            name={icon}
            size={25}
            color={primary ? COLORS.textOnPrimary : COLORS.primary}
          />
        </View>
        <View style={styles.actionTextContainer}>
          <Text style={styles.actionTitle}>{title}</Text>
          <Text style={styles.actionDescription}>{description}</Text>
        </View>
      </View>
      <AppButton title={buttonTitle} icon={icon} onPress={onPress} />
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons
          name={icon}
          size={27}
          color={COLORS.textSecondary}
        />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
    </View>
  );
}

function AccountSummary({
  displayName,
  profile,
}: {
  displayName: string;
  profile: Profile;
}) {
  return (
    <View style={styles.accountRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {displayName.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.accountInfo}>
        <Text style={styles.accountName}>{displayName}</Text>
        <Text style={styles.accountEmail}>{profile.email}</Text>
        <Text style={styles.accountRole}>{profile.role.toUpperCase()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 35 },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: { marginTop: 12, color: COLORS.textSecondary, fontSize: 14 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  logo: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTextContainer: { marginLeft: 12 },
  brandTitle: { color: COLORS.textPrimary, fontSize: 21, fontWeight: '800' },
  brandSubtitle: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  profileButton: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 25,
  },
  welcomeTextContainer: { flex: 1, paddingRight: 10 },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 9,
  },
  welcomeTitle: {
    color: COLORS.textPrimary,
    fontSize: 25,
    fontWeight: '800',
    marginBottom: 8,
  },
  welcomeDescription: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  welcomeIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 13,
    marginTop: 6,
  },
  sectionHeadingText: { flex: 1, paddingRight: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 13,
    marginTop: 2,
  },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: COLORS.textPrimary },
  sectionSubtitle: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4 },
  headingAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 8,
  },
  headingActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  refreshButton: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 7 },
  refreshText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    width: '48.2%',
    backgroundColor: COLORS.card,
    borderRadius: 17,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: { fontSize: 25, fontWeight: '800', color: COLORS.textPrimary },
  statTitle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  adminTabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 5,
    borderRadius: 15,
    marginBottom: 22,
  },
  adminTab: {
    flex: 1,
    minHeight: 43,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 4,
  },
  adminTabActive: { backgroundColor: COLORS.primary },
  adminTabText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  adminTabTextActive: { color: COLORS.textOnPrimary },
  eventCard: {
    backgroundColor: COLORS.card,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    marginBottom: 12,
  },
  cardPressed: { opacity: 0.75 },
  eventCardTop: { flexDirection: 'row', alignItems: 'center' },
  eventIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  eventMain: { flex: 1, marginRight: 8 },
  eventTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
    lineHeight: 21,
  },
  eventCode: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4 },
  eventDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 13 },
  eventInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
    gap: 8,
  },
  eventInfoText: { flex: 1, color: COLORS.textSecondary, fontSize: 12 },
  eventFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
  },
  attendeeCount: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  attendeeCountText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20 },
  statusUpcoming: { backgroundColor: '#FFF2D8' },
  statusOngoing: { backgroundColor: '#DDF7E9' },
  statusEnded: { backgroundColor: '#E9EDF0' },
  statusText: { fontSize: 11, fontWeight: '800' },
  statusTextUpcoming: { color: '#94651A' },
  statusTextOngoing: { color: '#167347' },
  statusTextEnded: { color: '#596873' },
  userCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 13,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  userAvatarText: { color: COLORS.primary, fontSize: 19, fontWeight: '800' },
  userMain: { flex: 1, marginRight: 8 },
  userName: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '800' },
  userEmail: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4 },
  userId: { color: COLORS.textSecondary, fontSize: 10, marginTop: 4 },
  userCardRight: { alignItems: 'flex-end', gap: 8 },
  roleBadge: { backgroundColor: COLORS.surface, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8 },
  roleBadgeText: { fontSize: 9, fontWeight: '800', color: COLORS.primary },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    minHeight: 48,
    marginBottom: 12,
    gap: 9,
  },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: 13, paddingVertical: 10 },
  resultCount: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 },
  filterRow: { flexDirection: 'row', gap: 8, paddingBottom: 13 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  filterChipTextActive: { color: COLORS.textOnPrimary },
  actionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 17,
    padding: 16,
    marginBottom: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 15 },
  actionIcon: {
    width: 47,
    height: 47,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  primaryActionIcon: { backgroundColor: COLORS.primary },
  actionTextContainer: { flex: 1, paddingTop: 2 },
  actionTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 5 },
  actionDescription: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19 },

  // Student dashboard UI
  studentIntro: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 19,
    marginBottom: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  studentIntroIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  studentIntroTitle: {
    color: COLORS.textPrimary,
    fontSize: 21,
    fontWeight: '800',
    marginBottom: 7,
  },
  studentIntroDescription: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  studentScanCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 22,
    padding: 20,
    marginBottom: 25,
  },
  studentScanTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 17,
  },
  studentScanIcon: {
    width: 61,
    height: 61,
    borderRadius: 19,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentScanBadge: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },
  studentScanBadgeText: {
    color: COLORS.textOnPrimary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  studentScanTitle: {
    color: COLORS.textOnPrimary,
    fontSize: 23,
    fontWeight: '800',
    marginBottom: 8,
  },
  studentScanDescription: {
    color: COLORS.textOnPrimary,
    opacity: 0.9,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 19,
  },
  studentScanButton: {
    backgroundColor: COLORS.card,
    borderRadius: 13,
    minHeight: 49,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  studentScanButtonText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  studentSectionHeader: {
    marginBottom: 13,
    gap: 4,
  },
  studentSectionCaption: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  studentShortcutCard: {
    backgroundColor: COLORS.card,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    marginBottom: 11,
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentShortcutIcon: {
    width: 47,
    height: 47,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  studentShortcutText: {
    flex: 1,
    marginRight: 8,
  },
  studentShortcutTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 5,
  },
  studentShortcutDescription: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },

  profileSummary: {
    marginTop: 15,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 17,
    padding: 16,
  },
  viewProfileButton: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewProfileText: { color: COLORS.primary, fontWeight: '700', fontSize: 12 },
  accountRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  avatarText: { fontSize: 22, fontWeight: '800', color: COLORS.primary },
  accountInfo: { flex: 1 },
  accountName: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800' },
  accountEmail: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4 },
  accountRole: { color: COLORS.primary, fontSize: 10, fontWeight: '800', marginTop: 5 },
  errorPage: { flex: 1, justifyContent: 'center', padding: 25, alignItems: 'center' },
  largeIcon: {
    width: 78,
    height: 78,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 17,
  },
  pageTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center', marginBottom: 9 },
  mutedText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 20, textAlign: 'center' },
  secondaryButton: { padding: 13, marginTop: 8 },
  secondaryButtonText: { color: COLORS.primary, fontWeight: '700' },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#F4CCCC',
    marginBottom: 16,
  },
  errorTextContainer: { flex: 1 },
  errorTitle: { fontSize: 14, fontWeight: '800', color: COLORS.danger, marginBottom: 5 },
  errorMessage: { fontSize: 12, lineHeight: 18, color: COLORS.textPrimary },
  errorHint: { fontSize: 11, lineHeight: 16, color: COLORS.textSecondary, marginTop: 6 },
  smallRetryButton: { paddingHorizontal: 8, paddingVertical: 5 },
  smallRetryText: { color: COLORS.danger, fontWeight: '800', fontSize: 12 },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 15,
  },
  emptyState: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 23,
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyIcon: {
    width: 51,
    height: 51,
    borderRadius: 17,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  emptyDescription: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 5 },
  readOnlyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 15,
    padding: 13,
    backgroundColor: COLORS.surface,
    borderRadius: 13,
  },
  readOnlyText: { flex: 1, fontSize: 12, lineHeight: 18, color: COLORS.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalContent: {
    maxHeight: '90%',
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingHorizontal: 20,
    paddingTop: 19,
    paddingBottom: 25,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontSize: 19, fontWeight: '800', color: COLORS.textPrimary },
  modalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScrollContent: { paddingBottom: 10 },
  modalEventIcon: {
    width: 59,
    height: 59,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalEventTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 5 },
  modalEventCode: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 17 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  fieldLabel: { color: COLORS.textSecondary, fontSize: 13 },
  detailRow: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  detailLabel: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 5 },
  detailValue: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  modalSectionTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary, marginTop: 22, marginBottom: 12 },
  attendeeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  recentAttendanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginBottom: 10,
  },
  attendeeAvatar: {
    width: 39,
    height: 39,
    borderRadius: 13,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  attendeeAvatarText: { color: COLORS.primary, fontSize: 16, fontWeight: '800' },
  attendeeInfo: { flex: 1, marginRight: 8 },
  attendeeName: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '700' },
  attendeeTime: { color: COLORS.textSecondary, fontSize: 11, marginTop: 4 },
  recentEventTitle: { color: COLORS.primary, fontSize: 12, marginTop: 3 },
  userDetailAvatar: {
    width: 75,
    height: 75,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 13,
  },
  userDetailAvatarText: { fontSize: 31, color: COLORS.primary, fontWeight: '800' },
  centeredRoleBadge: {
    alignSelf: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginTop: 7,
    marginBottom: 15,
  },
  centeredRoleText: { color: COLORS.primary, fontSize: 11, fontWeight: '800' },
  footerText: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 11, marginTop: 25, marginBottom: 8 },
});