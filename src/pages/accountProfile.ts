import type { User } from '@supabase/supabase-js';

export type Profile = {
  email: string | null;
  full_name: string | null;
  status: string | null;
};

export type ProfileResult = {
  data: Profile | null;
  error: {
    code?: string;
    details?: string;
    hint?: string;
    message?: string;
  } | null;
};

export async function ensureProfile(
  user: User,
  client: any,
): Promise<ProfileResult> {
  const profileResult = await client
    .from('profiles')
    .select('full_name, email, status')
    .eq('id', user.id)
    .maybeSingle();

  if (profileResult.error || profileResult.data) {
    return {
      data: profileResult.data ? toProfile(profileResult.data as Profile) : null,
      error: profileResult.error,
    };
  }

  const fallbackName =
    typeof user.user_metadata.full_name === 'string' && user.user_metadata.full_name.trim()
      ? user.user_metadata.full_name.trim()
      : user.email ?? '';

  const createResult = await client
    .from('profiles')
    .insert({
      email: user.email ?? null,
      full_name: fallbackName,
      id: user.id,
      role: 'player',
      status: 'pending',
    })
    .select('full_name, email, status')
    .maybeSingle();

  if (createResult.error) {
    console.error('Account profile creation error:', createResult.error);
  }

  return {
    data: createResult.data ? toProfile(createResult.data as Profile) : null,
    error: createResult.error,
  };
}

export function toProfile(row: unknown): Profile {
  const profileRow = row as Partial<Profile>;

  return {
    email: profileRow.email ?? null,
    full_name: profileRow.full_name ?? null,
    status: profileRow.status ?? null,
  };
}

export function formatSupabaseError(error: {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
}) {
  return [error.message, error.details, error.hint, error.code]
    .filter(Boolean)
    .join(' ');
}
