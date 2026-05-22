import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type MatchRow = {
  id: string;
  status: string;
};

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

const activeStatuses = ['pending', 'accepted', 'time_proposed', 'scheduled'];

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
    status,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Server is missing Supabase admin configuration.' }, 500);
  }

  const authorization = req.headers.get('Authorization');
  const accessToken = authorization?.replace('Bearer ', '').trim();

  if (!accessToken) {
    return jsonResponse({ error: 'You must be logged in as an admin.' }, 401);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user: currentUser },
    error: userError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError || !currentUser) {
    return jsonResponse({ error: 'Your admin session could not be verified.' }, 401);
  }

  const { data: adminProfile, error: adminProfileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (adminProfileError) {
    return jsonResponse({ error: adminProfileError.message }, 500);
  }

  if (adminProfile?.role !== 'admin') {
    return jsonResponse({ error: 'Admin access required.' }, 403);
  }

  let body: { targetProfileId?: string };

  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Missing request body.' }, 400);
  }

  const targetProfileId = body.targetProfileId;

  if (!targetProfileId) {
    return jsonResponse({ error: 'Player profile is required.' }, 400);
  }

  if (targetProfileId === currentUser.id) {
    return jsonResponse({ error: 'Admins cannot permanently delete their own account.' }, 400);
  }

  const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', targetProfileId)
    .maybeSingle();

  if (targetProfileError) {
    return jsonResponse({ error: targetProfileError.message }, 500);
  }

  if (!targetProfile) {
    return jsonResponse({ error: 'Player profile was not found.' }, 404);
  }

  const { data: matchRows, error: matchesError } = await supabaseAdmin
    .from('matches')
    .select('id, status')
    .or(
      [
        `challenger_id.eq.${targetProfileId}`,
        `opponent_id.eq.${targetProfileId}`,
        `winner_id.eq.${targetProfileId}`,
        `canceled_by.eq.${targetProfileId}`,
        `proposed_by_player_id.eq.${targetProfileId}`,
      ].join(','),
    );

  if (matchesError) {
    return jsonResponse({ error: matchesError.message }, 500);
  }

  const matches = (matchRows ?? []) as MatchRow[];
  const hasCompletedHistory = matches.some((match) => match.status === 'completed');

  if (hasCompletedHistory) {
    return jsonResponse(
      {
        error:
          'This player has completed match history. Deactivate Account instead to preserve match history.',
      },
      409,
    );
  }

  const { error: ladderError } = await supabaseAdmin
    .from('ladder_rankings')
    .delete()
    .eq('player_id', targetProfileId);

  if (ladderError) {
    return jsonResponse({ error: ladderError.message }, 500);
  }

  const { error: matchesUpdateError } = await supabaseAdmin
    .from('matches')
    .update({
      cancel_reason: 'Account permanently deleted by admin',
      canceled_at: new Date().toISOString(),
      canceled_by: currentUser.id,
      status: 'canceled',
    })
    .or(`challenger_id.eq.${targetProfileId},opponent_id.eq.${targetProfileId}`)
    .in('status', activeStatuses);

  if (matchesUpdateError) {
    return jsonResponse({ error: matchesUpdateError.message }, 500);
  }

  const { error: profileDeleteError } = await supabaseAdmin
    .from('profiles')
    .delete()
    .eq('id', targetProfileId);

  if (profileDeleteError) {
    if (profileDeleteError.code === '23503') {
      return jsonResponse(
        {
          error:
            'This player has match history. Deactivate Account instead, or archive their profile.',
        },
        409,
      );
    }

    return jsonResponse({ error: profileDeleteError.message }, 500);
  }

  const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(targetProfileId);

  if (authDeleteError) {
    return jsonResponse(
      {
        error: `Profile was deleted, but Supabase Auth deletion failed: ${authDeleteError.message}`,
      },
      500,
    );
  }

  return jsonResponse({
    message: `${targetProfile.full_name ?? targetProfile.email ?? 'User'} was permanently deleted.`,
  });
});
