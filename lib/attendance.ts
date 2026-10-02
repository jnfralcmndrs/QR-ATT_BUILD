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
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, event_code, title, start_time, end_time')
    .eq('created_by', teacherId);

  if (eventsError || !events || events.length === 0) {
    return [];
  }

  const eventIds = events.map((event) => event.id);

  const { data: attendance, error: attendanceError } = await supabase
    .from('attendance')
    .select('student_id, scanned_at, event_id')
    .in('event_id', eventIds);

  if (attendanceError) {
    return [];
  }

  return events.map((event) => {
    const attendees = (attendance ?? [])
      .filter((row) => row.event_id === event.id)
      .map((row) => ({
        studentId: String(row.student_id),
        scannedAt: String(row.scanned_at),
      }));

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
    counts[String(row.event_id)] =
      (counts[String(row.event_id)] ?? 0) + 1;
  });

  const summaries: TeacherEventSummary[] = events.map((event) => ({
    eventId: String(event.id),
    eventCode: String(event.event_code),
    title: String(event.title),
    attendeeCount: counts[String(event.id)] ?? 0,
  }));

  return summaries;
}


export async function registerAttendance(
  rawPayload: string,
  studentId: string
): Promise<RegisterResult> {
  // 1. Validate QR payload
  const parsed = parseQRPayload(rawPayload);

  if (!parsed.ok) {
    return {
      success: false,
      message: parsed.message,
    };
  }

  const payload = parsed.payload;

  // 2. Check event time window
  const now = Date.now();

  const start = payload.start
    ? new Date(payload.start).getTime()
    : null;

  const end = payload.end
    ? new Date(payload.end).getTime()
    : null;

  if (start && now < start) {
    return {
      success: false,
      message: 'Event has not started yet.',
    };
  }

  if (end && now > end) {
    return {
      success: false,
      message: 'Event has already ended.',
    };
  }

  const title = payload.title ?? payload.event;

  // 3. Find event using shared helper
  const foundEvent = await getEventByCode(payload.event);

  let eventId: string;
  let eventTitle: string;

  if (foundEvent) {
    eventId = String(foundEvent.id);
    eventTitle = String(foundEvent.title);
  } else {
    // 3b. Event does not exist → create it
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

  // 4. Record attendance
  const { error: attendanceError } = await supabase
    .from('attendance')
    .insert([
      {
        student_id: studentId,
        event_id: eventId,
        scanned_at: new Date().toISOString(),
      },
    ]);

  // 5. Handle duplicate or other database errors
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

  const history: AttendanceRecord[] = data.map((row: any) => ({
    id: String(row.id),
    eventId: String(row.events?.event_code ?? ''),
    eventTitle: String(row.events?.title ?? ''),
    scannedAt: String(row.scanned_at ?? ''),
  }));

  return history;
}