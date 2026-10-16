
import { supabase } from './supabase';
import { parseQRPayload } from './qr';
import { getEventByCode } from './events';

export type AttendanceRecord = {
  id: string;
  eventId: string;
  eventTitle: string;
  scannedAt: string;
};

export type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
};

export type TeacherEventAttendance = {
  eventId: string;
  eventCode: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  attendeeCount: number;
  attendees: {
    studentId: string;
    studentName?: string | null;
    scannedAt: string;
  }[];
};

export type TeacherEventSummary = {
  eventId: string;
  eventCode: string;
  title: string;
  attendeeCount: number;
};

export async function getTeacherEventAttendance(
  teacherId: string
): Promise<TeacherEventAttendance[]> {
  // Get events created by this teacher, newest first.
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, event_code, title, start_time, end_time, created_at')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventsError || !events || events.length === 0) {
    if (eventsError) {
      console.error('Error loading teacher events:', eventsError.message);
    }
    return [];
  }

  const eventIds = events.map((event) => event.id);

  const { data: attendance, error: attendanceError } = await supabase
    .from('attendance')
    .select('student_id, scanned_at, event_id')
    .in('event_id', eventIds)
    .order('scanned_at', { ascending: false });

  if (attendanceError) {
    console.error('Error loading event attendance:', attendanceError.message);
    return [];
  }

  const attendanceRows = attendance ?? [];

  // Collect unique student IDs so their names can be fetched once.
  const studentIds = [
    ...new Set(
      attendanceRows.map((row) => String(row.student_id))
    ),
  ];

  const nameByStudentId: Record<string, string> = {};

  if (studentIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', studentIds);

    if (profilesError) {
      console.error('Error loading student names:', profilesError.message);
    } else {
      (profiles ?? []).forEach((profile) => {
        const id = String(profile.id);
        const name = profile.full_name?.trim();

        if (name) {
          nameByStudentId[id] = name;
        }
      });
    }
  }

  // Keep the event order returned by the newest-first query.
  return events.map((event) => {
    const attendees = attendanceRows
      .filter((row) => String(row.event_id) === String(event.id))
      .map((row) => {
        const studentId = String(row.student_id);

        return {
          studentId,
          studentName: nameByStudentId[studentId] ?? null,
          scannedAt: String(row.scanned_at ?? ''),
        };
      });

    return {
      eventId: String(event.id),
      eventCode: String(event.event_code),
      title: String(event.title),
      startTime: event.start_time ?? null,
      endTime: event.end_time ?? null,
      attendeeCount: attendees.length,
      attendees,
    };
  });
}

export async function getTeacherEventSummary(
  teacherId: string
): Promise<TeacherEventSummary[]> {
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, event_code, title')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventsError || !events || events.length === 0) {
    return [];
  }

  const eventIds = events.map((event) => event.id);

  const { data: attRows, error: attError } = await supabase
    .from('attendance')
    .select('event_id')
    .in('event_id', eventIds);

  if (attError) {
    return [];
  }

  const counts: Record<string, number> = {};

  (attRows ?? []).forEach((row) => {
    const eventId = String(row.event_id);
    counts[eventId] = (counts[eventId] ?? 0) + 1;
  });

  return events.map((event) => ({
    eventId: String(event.id),
    eventCode: String(event.event_code),
    title: String(event.title),
    attendeeCount: counts[String(event.id)] ?? 0,
  }));
}

export async function registerAttendance(
  rawPayload: string,
  studentId: string
): Promise<RegisterResult> {
  // 1. Validate QR payload.
  const parsed = parseQRPayload(rawPayload);

  if (!parsed.ok) {
    return {
      success: false,
      message: parsed.message,
    };
  }

  const payload = parsed.payload;

  // 2. Check the event time window.
  const now = Date.now();

  const start = payload.start
    ? new Date(payload.start).getTime()
    : null;

  const end = payload.end
    ? new Date(payload.end).getTime()
    : null;

  if (start !== null && Number.isFinite(start) && now < start) {
    return {
      success: false,
      message: 'Event has not started yet.',
    };
  }

  if (end !== null && Number.isFinite(end) && now > end) {
    return {
      success: false,
      message: 'Event has already ended.',
    };
  }

  const title = payload.title ?? payload.event;

  // 3. Find the event.
  const foundEvent = await getEventByCode(payload.event);

  let eventId: string;
  let eventTitle: string;

  if (foundEvent) {
    eventId = String(foundEvent.id);
    eventTitle = String(foundEvent.title);
  } else {
    // Create the event if it does not exist.
    const { data: newEvent, error: insertError } = await supabase
      .from('events')
      .insert([
        {
          event_code: payload.event,
          title,
          start_time: payload.start ?? null,
          end_time: payload.end ?? null,
        },
      ])
      .select('id, title')
      .single();

    if (insertError || !newEvent) {
      return {
        success: false,
        message: 'Could not create event.',
      };
    }

    eventId = String(newEvent.id);
    eventTitle = String(newEvent.title);
  }

  // 4. Record attendance.
  const { error: attendanceError } = await supabase
    .from('attendance')
    .insert([
      {
        student_id: studentId,
        event_id: eventId,
        scanned_at: new Date().toISOString(),
      },
    ]);

  // 5. Handle duplicate or other database errors.
  if (attendanceError) {
    if (attendanceError.code === '23505') {
      return {
        success: false,
        message: 'Already registered for this event.',
        eventTitle,
      };
    }

    return {
      success: false,
      message: attendanceError.message,
      eventTitle,
    };
  }

  return {
    success: true,
    message: 'Attendance recorded!',
    eventTitle,
  };
}

export async function getAttendanceHistory(
  studentId: string
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select(`
      id,
      event_id,
      scanned_at,
      events (
        event_code,
        title
      )
    `)
    .eq('student_id', studentId)
    .order('scanned_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((row: any) => ({
    id: String(row.id),
    eventId: String(row.events?.event_code ?? ''),
    eventTitle: String(row.events?.title ?? ''),
    scannedAt: String(row.scanned_at ?? ''),
  }));
}
