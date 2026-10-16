
import { supabase } from './supabase';

export type Role = 'student' | 'teacher' | 'admin';

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
};

export async function getProfile(
  userId: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Failed to load profile:', error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  const role = data.role;

  // Reject unexpected role values instead of silently granting access.
  if (
    role !== 'student' &&
    role !== 'teacher' &&
    role !== 'admin'
  ) {
    console.error('Invalid profile role:', role);
    return null;
  }

  return {
    id: data.id,
    email: data.email,
    full_name: data.full_name,
    role,
  };
}

export async function updateProfile(
  userId: string,
  updates: { full_name?: string }
): Promise<{ error: string | null }> {
  const cleanUpdates: { full_name?: string } = {};

  if (updates.full_name !== undefined) {
    cleanUpdates.full_name = updates.full_name.trim();
  }

  if (Object.keys(cleanUpdates).length === 0) {
    return { error: null };
  }

  const { error } = await supabase
    .from('profiles')
    .update(cleanUpdates)
    .eq('id', userId);

  if (error) {
    console.error('Failed to update profile:', error.message);
  }

  return { error: error?.message ?? null };
}
