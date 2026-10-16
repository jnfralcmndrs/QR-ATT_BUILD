
import { supabase } from './supabase';

export type Event = {
  eventId: string;
  title: string;
  start: string;
  end: string;
};

export type CloudEvent = {
  id: string;
  event_code: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  created_by: string | null;
  created_at: string;
};

/**
 * Normalize an ISO timestamp before saving.
 *
 * If the input already contains a timezone (such as the Z produced by
 * Date.toISOString()), preserve the represented moment and normalize it
 * to UTC. If it has no timezone, interpret it as a local date/time first.
 */
function normalizeTimestamp(value: string): string | null {
  if (!value) return null;

  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);

  if (hasTimezone) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function createEvent(
  event: Event
): Promise<{ error: string | null }> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      return { error: userError.message };
    }

    if (!user) {
      return { error: 'You must be signed in to create an event.' };
    }

    const startTime = normalizeTimestamp(event.start);
    const endTime = normalizeTimestamp(event.end);

    if (!startTime || !endTime) {
      return { error: 'The event start or end time is invalid.' };
    }

    if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
      return { error: 'The event end time must be later than the start time.' };
    }

    const { error } = await supabase.from('events').upsert(
      {
        event_code: event.eventId.trim(),
        title: event.title.trim(),
        start_time: startTime,
        end_time: endTime,
        created_by: user.id,
      },
      { onConflict: 'event_code' }
    );

    if (error) {
      console.error('Supabase createEvent error:', error.message);
      return { error: error.message };
    }

    return { error: null };
  } catch (error) {
    console.error('Unexpected createEvent error:', error);

    return {
      error:
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred while creating the event.',
    };
  }
}

export async function getEventsByTeacher(
  teacherId: string
): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    if (error) {
      console.error('Unable to load teacher events:', error.message);
    }

    return [];
  }

  return data as CloudEvent[];
}

export async function getEventByCode(
  code: string
): Promise<CloudEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('event_code', code.trim())
    .maybeSingle();

  if (error) {
    console.error('Unable to load event:', error.message);
    return null;
  }

  return data as CloudEvent | null;
}
