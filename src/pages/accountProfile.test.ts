import type { User } from '@supabase/supabase-js';
import { deepEqual, equal } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ensureProfile } from './accountProfile.js';

function createUser(overrides: Partial<User> = {}) {
  return {
    app_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00.000Z',
    email: 'member@example.com',
    id: 'user-123',
    user_metadata: { full_name: 'Club Member' },
    ...overrides,
  } as User;
}

function createProfileClient({
  createdProfile = {
    email: 'member@example.com',
    full_name: 'Club Member',
    status: 'pending',
  },
  existingProfile = null,
}: {
  createdProfile?: Record<string, unknown>;
  existingProfile?: Record<string, unknown> | null;
}) {
  const calls = {
    insertPayload: null as Record<string, unknown> | null,
    insertWasCalled: false,
  };
  const client = {
    from: () => ({
      insert: (payload: Record<string, unknown>) => {
        calls.insertWasCalled = true;
        calls.insertPayload = payload;

        return {
          select: () => ({
            maybeSingle: async () => ({
              data: createdProfile,
              error: null,
            }),
          }),
        };
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: existingProfile,
            error: null,
          }),
        }),
      }),
    }),
  } as Parameters<typeof ensureProfile>[1];

  return { calls, client };
}

describe('account profile safety', () => {
  it('creates a pending player profile when the auth user has no profile row', async () => {
    const { calls, client } = createProfileClient({ existingProfile: null });

    const result = await ensureProfile(createUser(), client);

    equal(calls.insertWasCalled, true);
    deepEqual(calls.insertPayload, {
      email: 'member@example.com',
      full_name: 'Club Member',
      id: 'user-123',
      role: 'player',
      status: 'pending',
    });
    deepEqual(result, {
      data: {
        email: 'member@example.com',
        full_name: 'Club Member',
        status: 'pending',
      },
      error: null,
    });
  });

  it('uses the existing profile when one is found', async () => {
    const { calls, client } = createProfileClient({
      existingProfile: {
        email: 'member@example.com',
        full_name: 'Existing Name',
        status: 'approved',
      },
    });

    const result = await ensureProfile(createUser(), client);

    equal(calls.insertWasCalled, false);
    equal(result.data?.full_name, 'Existing Name');
    equal(result.data?.status, 'approved');
  });
});
