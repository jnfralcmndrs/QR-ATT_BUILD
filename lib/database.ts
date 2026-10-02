import { supabase } from './supabase';

export type AttendanceRecord = {
  id: string;
  eventId: string;
  eventTitle: string;
  scannedAt: string;
};

type EventPayload = {
  v: number;
  event: string;
  title?: string;
  start?: string;
  end?: string;
};

export type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
};

export async function registerAttendance(
  rawPayload: string,
  studentId: string
): Promise<RegisterResult> {
  let payload: EventPayload;

  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return {
      success: false,
      message: 'Invalid QR code.',
    };
  }

  if (payload.v !== 1 || !payload.event) {
    return {
      success: false,
      message: 'Not an attendance QR code.',
    };
  }

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

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title')
    .eq('event_code', payload.event)
    .maybeSingle();

  if (eventError) {
    return {
      success: false,
      message: 'Could not find event.',
    };
  }

  let eventId: string;
  let eventTitle: string;

  if (event) {
    eventId = event.id;
    eventTitle = event.title;
  } else {
    const { data: newEvent, error: createError } = await supabase
      .from('events')
      .insert({
        event_code: payload.event,
        title,
        start_time: payload.start ?? null,
        end_time: payload.end ?? null,
      })
      .select('id, title')
      .single();

    if (createError || !newEvent) {
      return {
        success: false,
        message: 'Could not create event.',
      };
    }

    eventId = newEvent.id;
    eventTitle = newEvent.title;
  }

  const { error: attendanceError } = await supabase
    .from('attendance')
    .insert({
      student_id: studentId,
      event_id: eventId,
      scanned_at: new Date().toISOString(),
    });

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
    id: row.id,
    eventId: row.events?.event_code ?? '',
    eventTitle: row.events?.title ?? '',
    scannedAt: row.scanned_at,
  }));
}