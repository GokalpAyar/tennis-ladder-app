import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type ProfileRole = 'player' | 'admin';

type Profile = {
  id: string;
  full_name: string | null;
  email?: string | null;
  role: ProfileRole | null;
  status: 'pending' | 'approved' | 'rejected' | 'inactive' | null;
};

type LadderRanking = {
  id: string;
  player_id: string;
  rank_position: number;
  wins: number;
  losses: number;
};

type MatchStatus =
  | 'pending'
  | 'accepted'
  | 'time_proposed'
  | 'declined'
  | 'scheduled'
  | 'cancellation_requested'
  | 'completed'
  | 'canceled'
  | 'expired';

type Match = {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: MatchStatus;
  proposed_match_at: string | null;
  proposed_by_player_id: string | null;
  scheduled_match_ends_at: string | null;
  cancel_reason?: string | null;
  canceled_at?: string | null;
  canceled_by?: string | null;
  cancellation_requested_by?: string | null;
  cancellation_reason?: string | null;
  cancellation_requested_at?: string | null;
  winner_id?: string | null;
  created_at: string;
};

type RankingDraft = {
  rank_position: number;
  wins: number;
  losses: number;
};

type AdminTab =
  | 'pending'
  | 'players'
  | 'ladder'
  | 'matches'
  | 'settings';
type MatchFilter = 'all' | 'needs_action' | 'scheduled' | 'completed' | 'problems';

type StatusTone = 'yellow' | 'green' | 'blue' | 'purple' | 'gray' | 'red';

type StatusInfo = {
  label: string;
  tone: StatusTone;
};

type PlayerStatusKey =
  | 'pending_approval'
  | 'available'
  | 'active_match'
  | 'scheduled_match'
  | 'inactive';

type PlayerAdminRow = {
  profile: Profile;
  ranking: LadderRanking | undefined;
  status: StatusInfo;
  statusKey: PlayerStatusKey;
};

type ProfileConfirmAction = { type: 'deactivate'; profile: Profile };

function AdminPage() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rankings, setRankings] = useState<LadderRanking[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [rankingDrafts, setRankingDrafts] = useState<Record<string, RankingDraft>>({});
  const [approvalRankDrafts, setApprovalRankDrafts] = useState<Record<string, number>>({});
  const [profileNameDrafts, setProfileNameDrafts] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('pending');
  const [playerSearch, setPlayerSearch] = useState('');
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('needs_action');
  const [activityPlayerId, setActivityPlayerId] = useState<string | null>(null);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [profileConfirmAction, setProfileConfirmAction] =
    useState<ProfileConfirmAction | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    loadAdminData();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  const profilesById = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.id, profile]));
  }, [profiles]);

  const rankingByPlayerId = useMemo(() => {
    return new Map(rankings.map((ranking) => [ranking.player_id, ranking]));
  }, [rankings]);

  const rankedPlayerIds = useMemo(() => {
    return new Set(rankings.map((ranking) => ranking.player_id));
  }, [rankings]);

  const unrankedProfiles = useMemo(() => {
    return profiles.filter(
      (profile) => profile.status === 'approved' && !rankedPlayerIds.has(profile.id),
    );
  }, [profiles, rankedPlayerIds]);

  const pendingProfiles = useMemo(() => {
    return profiles.filter(
      (profile) => profile.status === 'pending' && !rankedPlayerIds.has(profile.id),
    );
  }, [profiles, rankedPlayerIds]);

  const scheduledMatches = useMemo(() => {
    return matches.filter(
      (match) => match.status === 'scheduled' || match.status === 'cancellation_requested',
    );
  }, [matches]);

  const completedMatches = useMemo(() => {
    return matches.filter((match) => match.status === 'completed');
  }, [matches]);

  const openMatches = useMemo(() => {
    return matches.filter(isOpenMatch);
  }, [matches]);

  const waitingForTimeSelectionMatches = useMemo(() => {
    return matches.filter(
      (match) => match.status === 'accepted' || match.status === 'time_proposed',
    );
  }, [matches]);

  const scheduledTodayMatches = useMemo(() => {
    return scheduledMatches.filter((match) => isToday(match.proposed_match_at));
  }, [scheduledMatches]);

  const completedThisWeekMatches = useMemo(() => {
    return completedMatches.filter((match) => isThisWeek(getMatchTimelineDate(match)));
  }, [completedMatches]);

  const activeMatchPlayerIds = useMemo(() => {
    return new Set(
      matches
        .filter((match) => ['pending', 'accepted', 'time_proposed'].includes(match.status))
        .flatMap((match) => [match.challenger_id, match.opponent_id]),
    );
  }, [matches]);

  const scheduledMatchPlayerIds = useMemo(() => {
    return new Set(
      scheduledMatches.flatMap((match) => [match.challenger_id, match.opponent_id]),
    );
  }, [scheduledMatches]);

  const playerRows = useMemo<PlayerAdminRow[]>(() => {
    return profiles
      .map((profile) => {
        const ranking = rankingByPlayerId.get(profile.id);
        const statusKey = getPlayerStatusKey({
          hasActiveMatch: activeMatchPlayerIds.has(profile.id),
          hasScheduledMatch: scheduledMatchPlayerIds.has(profile.id),
          isRanked: Boolean(ranking),
          profile,
        });

        return {
          profile,
          ranking,
          status: getPlayerStatusInfo(statusKey),
          statusKey,
        };
      })
      .sort(comparePlayerRows);
  }, [activeMatchPlayerIds, profiles, rankingByPlayerId, scheduledMatchPlayerIds]);

  const filteredPlayerRows = useMemo(() => {
    const query = playerSearch.trim().toLowerCase();

    if (!query) {
      return playerRows;
    }

    return playerRows.filter(({ profile, ranking, status }) =>
      [
        profile.full_name ?? '',
        profile.email ?? '',
        profile.role ?? '',
        profile.status ?? '',
        profile.id,
        status.label,
        ranking ? `rank ${ranking.rank_position}` : 'unassigned',
        ranking ? `${ranking.wins}-${ranking.losses}` : '0-0',
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [playerRows, playerSearch]);

  const filteredRankings = useMemo(() => {
    const query = playerSearch.trim().toLowerCase();

    if (!query) {
      return rankings;
    }

    return rankings.filter((ranking) => {
      const profile = profilesById.get(ranking.player_id);
      const searchableText = [
        profile?.full_name ?? '',
        profile?.email ?? '',
        profile?.role ?? '',
        profile?.status ?? '',
        ranking.player_id,
        String(ranking.rank_position),
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [playerSearch, profilesById, rankings]);

  const filteredUnrankedProfiles = useMemo(() => {
    const query = playerSearch.trim().toLowerCase();

    if (!query) {
      return unrankedProfiles;
    }

    return unrankedProfiles.filter((profile) =>
      [profile.full_name ?? '', profile.email ?? '', profile.role ?? '', profile.status ?? '', profile.id]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [playerSearch, unrankedProfiles]);

  const matchesForActivityPlayer = useMemo(() => {
    if (!activityPlayerId) {
      return matches;
    }

    return matches.filter(
      (match) =>
        match.challenger_id === activityPlayerId || match.opponent_id === activityPlayerId,
    );
  }, [activityPlayerId, matches]);

  const filteredMatches = useMemo(() => {
    if (matchFilter === 'all') {
      return matchesForActivityPlayer;
    }

    if (matchFilter === 'needs_action') {
      return matchesForActivityPlayer
        .filter(isMatchNeedsAdminAttention)
        .sort(compareNeedsActionMatches);
    }

    if (matchFilter === 'problems') {
      return matchesForActivityPlayer.filter(isProblemMatch);
    }

    if (matchFilter === 'scheduled') {
      return matchesForActivityPlayer.filter(
        (match) => match.status === 'scheduled' || match.status === 'cancellation_requested',
      );
    }

    return matchesForActivityPlayer.filter((match) => match.status === matchFilter);
  }, [matchFilter, matchesForActivityPlayer]);

  const visibleAdminMatches = useMemo(() => {
    return filteredMatches;
  }, [filteredMatches]);

  const activityPlayer = activityPlayerId ? profilesById.get(activityPlayerId) : undefined;

  const matchFilterOptions = useMemo<Array<{ id: MatchFilter; label: string; count: number }>>(
    () => [
      { id: 'all', label: 'All', count: matchesForActivityPlayer.length },
      {
        id: 'needs_action',
        label: 'Needs Action',
        count:
          matchesForActivityPlayer.filter(isMatchNeedsAdminAttention).length +
          (activityPlayerId ? 0 : pendingProfiles.length),
      },
      {
        id: 'scheduled',
        label: 'Scheduled',
        count: matchesForActivityPlayer.filter(
          (match) => match.status === 'scheduled' || match.status === 'cancellation_requested',
        ).length,
      },
      {
        id: 'completed',
        label: 'Completed',
        count: matchesForActivityPlayer.filter((match) => match.status === 'completed').length,
      },
      {
        id: 'problems',
        label: 'Problems',
        count: matchesForActivityPlayer.filter(isProblemMatch).length,
      },
    ],
    [activityPlayerId, matchesForActivityPlayer, pendingProfiles.length],
  );

  async function loadAdminData() {
    setIsLoading(true);
    setErrorMessage('');

    const [
      { data: profileRows, error: profilesError },
      { data: rankingRows, error: rankingsError },
      { data: matchRows, error: matchesError },
    ] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role, status').order('full_name'),
      supabase
        .from('ladder_rankings')
        .select('id, player_id, rank_position, wins, losses')
        .order('rank_position', { ascending: true }),
      supabase
        .from('matches')
        .select('id, challenger_id, opponent_id, status, proposed_match_at, proposed_by_player_id, scheduled_match_ends_at, cancel_reason, canceled_at, canceled_by, cancellation_requested_by, cancellation_reason, cancellation_requested_at, winner_id, created_at')
        .order('created_at', { ascending: false }),
    ]);

    if (profilesError || rankingsError || matchesError) {
      setErrorMessage(
        profilesError?.message ??
          rankingsError?.message ??
          matchesError?.message ??
          'Unable to load admin data.',
      );
      setIsLoading(false);
      return;
    }

    const nextRankings = (rankingRows ?? []) as LadderRanking[];
    setProfiles((profileRows ?? []) as Profile[]);
    setRankings(nextRankings);
    setMatches((matchRows ?? []) as Match[]);
    setProfileNameDrafts(
      Object.fromEntries(
        ((profileRows ?? []) as Profile[]).map((profile) => [
          profile.id,
          profile.full_name ?? '',
        ]),
      ),
    );
    setRankingDrafts(
      Object.fromEntries(
        nextRankings.map((ranking) => [
          ranking.id,
          {
            rank_position: ranking.rank_position,
            wins: ranking.wins ?? 0,
            losses: ranking.losses ?? 0,
          },
        ]),
      ),
    );
    setApprovalRankDrafts((current) => {
      const highestRank = nextRankings.reduce(
        (highest, ranking) => Math.max(highest, ranking.rank_position),
        0,
      );
      const nextDrafts = { ...current };

      ((profileRows ?? []) as Profile[])
        .filter((profile) => profile.status === 'pending')
        .forEach((profile, index) => {
          nextDrafts[profile.id] = nextDrafts[profile.id] ?? highestRank + index + 1;
        });

      return nextDrafts;
    });
    setIsLoading(false);
  }

  async function addPlayerToLadder(playerId: string) {
    setActionId(playerId);
    setMessage('');
    setErrorMessage('');

    const nextRank =
      rankings.reduce(
        (highestRank, ranking) => Math.max(highestRank, ranking.rank_position),
        0,
      ) + 1;

    const { error } = await supabase.from('ladder_rankings').insert({
      player_id: playerId,
      rank_position: nextRank,
      wins: 0,
      losses: 0,
    });

    setActionId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage('Player added to the ladder.');
    await loadAdminData();
  }

  async function approvePlayer(profileId: string) {
    const rankPosition = approvalRankDrafts[profileId];

    if (!rankPosition || rankPosition < 1) {
      setErrorMessage('Enter a valid rank before approving this player.');
      return;
    }

    setActionId(`approve-${profileId}`);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase.rpc('admin_approve_player_with_rank', {
      target_profile_id: profileId,
      target_rank_position: rankPosition,
    });

    setActionId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage('Player approved and added to the ladder.');
    await loadAdminData();
  }

  async function rejectPlayer(profileId: string) {
    const confirmed = window.confirm('Reject this pending registration?');

    if (!confirmed) {
      return;
    }

    setActionId(`reject-${profileId}`);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase
      .from('profiles')
      .update({ status: 'rejected' })
      .eq('id', profileId);

    setActionId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage('Pending registration rejected.');
    await loadAdminData();
  }

  async function removePlayerFromLadder(playerId: string) {
    const confirmed = window.confirm('Remove this player from the ladder? Their profile will remain.');

    if (!confirmed) {
      return;
    }

    setActionId(playerId);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase
      .from('ladder_rankings')
      .delete()
      .eq('player_id', playerId);

    setActionId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage('Player removed from the ladder.');
    await loadAdminData();
  }

  function requestDeactivatePlayer(profile: Profile) {
    setProfileConfirmAction({ type: 'deactivate', profile });
  }

  async function confirmProfileManagementAction() {
    if (!profileConfirmAction) {
      return;
    }

    const { profile } = profileConfirmAction;
    const actionKey = `deactivate-${profile.id}`;

    setActionId(actionKey);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase.rpc('admin_deactivate_player', {
      target_profile_id: profile.id,
    });

    setActionId(null);
    setProfileConfirmAction(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage('Player deactivated and removed from the ladder.');
    await loadAdminData();
  }

  async function updatePlayerManagementRow(ranking: LadderRanking) {
    const draft = rankingDrafts[ranking.id];

    if (!draft) {
      return;
    }

    const rowActionId = `player-row-${ranking.player_id}`;
    const fullName = profileNameDrafts[ranking.player_id]?.trim() || null;

    setActionId(rowActionId);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase.rpc('admin_update_player_ladder_row', {
      target_full_name: fullName,
      target_losses: draft.losses,
      target_rank_position: draft.rank_position,
      target_ranking_id: ranking.id,
      target_wins: draft.wins,
    });

    setActionId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage('Player and ranking updated.');
    await loadAdminData();
  }

  async function saveProfileName(profileId: string) {
    const rowActionId = `profile-${profileId}`;
    const fullName = profileNameDrafts[profileId]?.trim() || null;

    setActionId(rowActionId);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', profileId);

    setActionId(null);

    if (error) {
      setErrorMessage(error.message);
      return false;
    }

    setMessage('Player name updated.');
    await loadAdminData();
    return true;
  }

  async function togglePlayerEdit(profileId: string) {
    if (editingPlayerId !== profileId) {
      setEditingPlayerId(profileId);
      return;
    }

    const wasSaved = await saveProfileName(profileId);

    if (wasSaved) {
      setEditingPlayerId(null);
    }
  }

  function viewPlayerActivity(profileId: string) {
    setActivityPlayerId(profileId);
    setMatchFilter('all');
    setActiveTab('matches');
  }

  function openPlayerRankEditor(profile: Profile) {
    setPlayerSearch(getProfileName(profile));
    setActiveTab('ladder');
  }

  async function updateProfileRole(profileId: string, role: ProfileRole) {
    const confirmed = window.confirm(`Change this user's role to ${role}?`);

    if (!confirmed) {
      return;
    }

    setActionId(profileId);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase.from('profiles').update({ role }).eq('id', profileId);

    setActionId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage('Profile role updated.');
    await loadAdminData();
  }

  async function updateMatchStatus(matchId: string, status: MatchStatus) {
    if (status === 'completed') {
      setErrorMessage('Completed matches require a winner. Use the player winner submission flow.');
      return;
    }

    if (status === 'canceled') {
      const confirmed = window.confirm('Cancel this match?');

      if (!confirmed) {
        return;
      }
    }

    setActionId(matchId);
    setMessage('');
    setErrorMessage('');

    const update =
      status === 'canceled'
        ? {
            status,
            canceled_at: new Date().toISOString(),
            canceled_by: (await supabase.auth.getUser()).data.user?.id ?? null,
          }
        : { status };

    const { error } = await supabase.from('matches').update(update).eq('id', matchId);

    setActionId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage('Match status updated.');
    await loadAdminData();
  }

  async function cancelMatch(matchId: string) {
    await updateMatchStatus(matchId, 'canceled');
  }

  async function resetSeason() {
    const confirmed = window.confirm(
      'Reset the ladder season? This sets all wins/losses to 0 and cancels active or scheduled matches. Player ranks remain unchanged.',
    );

    if (!confirmed) {
      return;
    }

    setActionId('reset-season');
    setMessage('');
    setErrorMessage('');

    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const [{ error: rankingsError }, { error: matchesError }] = await Promise.all([
      supabase.from('ladder_rankings').update({ wins: 0, losses: 0 }).gte('rank_position', 1),
      supabase
        .from('matches')
        .update({
          status: 'canceled',
          cancel_reason: 'Season reset',
          canceled_at: new Date().toISOString(),
          canceled_by: userId,
        })
        .in('status', ['pending', 'accepted', 'time_proposed', 'scheduled', 'cancellation_requested']),
    ]);

    setActionId(null);

    if (rankingsError || matchesError) {
      setErrorMessage(rankingsError?.message ?? matchesError?.message ?? 'Unable to reset season.');
      return;
    }

    setMessage('Season reset. Records are 0-0 and active matches were canceled.');
    await loadAdminData();
  }

  function updateDraft(rankingId: string, field: keyof RankingDraft, value: number) {
    setRankingDrafts((current) => ({
      ...current,
      [rankingId]: {
        ...current[rankingId],
        [field]: value,
      },
    }));
  }

  function updateProfileNameDraft(profileId: string, value: string) {
    setProfileNameDrafts((current) => ({
      ...current,
      [profileId]: value,
    }));
  }

  function updateApprovalRankDraft(profileId: string, value: number) {
    setApprovalRankDrafts((current) => ({
      ...current,
      [profileId]: value,
    }));
  }

  return (
    <main className="min-h-screen bg-[#f7f8fc] px-4 py-5 text-[#071a3d] sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-[88rem] space-y-5">
        <header className="relative overflow-hidden rounded-[1.75rem] border border-[#102a5c] bg-[#071a3d] px-5 py-6 text-white shadow-lg shadow-slate-900/15 sm:px-7">
          <div className="absolute inset-x-0 top-0 h-1 bg-red-600" />
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-red-600 text-white shadow-sm shadow-red-950/20">
                <AdminIcon />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white/55">
                  Staff Workspace
                </p>
                <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
                  Admin Control Center
                </h1>
                <p className="mt-2 text-sm font-medium text-white/70">
                  Manage players, rankings, and matches
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="admin-soft-button border-white/20 bg-white/10 text-white hover:bg-white/15" to="/dashboard">
                Preview Dashboard
              </Link>
              <Link className="admin-soft-button border-white/20 bg-white/10 text-white hover:bg-white/15" to="/ladder">
                Preview Ladder
              </Link>
              <button
                className="admin-soft-button border-white/20 bg-transparent text-white hover:bg-white/10"
                type="button"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        {(message || errorMessage) && (
          <div
            className={`whitespace-pre-line rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm ${
              errorMessage
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-blue-200 bg-blue-50 text-court-900'
            }`}
            role={errorMessage ? 'alert' : 'status'}
          >
            {errorMessage || message}
          </div>
        )}

        {profileConfirmAction && (
          <ProfileActionModal
            action={profileConfirmAction}
            isSaving={actionId === `${profileConfirmAction.type}-${profileConfirmAction.profile.id}`}
            onCancel={() => setProfileConfirmAction(null)}
            onConfirm={confirmProfileManagementAction}
          />
        )}

        {isLoading ? (
          <div className="rounded-3xl border border-line-200 bg-white p-8 text-sm font-semibold text-ink-700 shadow-sm">
            Loading admin data...
          </div>
        ) : (
          <>
            <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <AdminStatCard
                label="Pending Players"
                tone="red"
                value={pendingProfiles.length}
              />
              <AdminStatCard
                label="Active Matches"
                tone="blue"
                value={openMatches.length}
              />
              <AdminStatCard
                label="Scheduled Today"
                tone="purple"
                value={scheduledTodayMatches.length}
              />
              <AdminStatCard
                label="Waiting For Time Selection"
                tone="gray"
                value={waitingForTimeSelectionMatches.length}
              />
              <AdminStatCard
                label="Completed This Week"
                tone="green"
                value={completedThisWeekMatches.length}
              />
            </section>

            <nav className="grid gap-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-5">
              {([
                ['pending', 'Pending'],
                ['players', 'Players'],
                ['ladder', 'Ladder'],
                ['matches', 'Matches'],
                ['settings', 'Settings'],
              ] as const).map(([tab, label]) => (
                <button
                  className={`rounded-2xl px-3 py-2.5 text-sm font-black transition ${
                    activeTab === tab
                      ? 'bg-[#071a3d] text-white shadow-sm'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-[#071a3d]'
                  }`}
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                >
                  {label}
                </button>
              ))}
            </nav>

            {activeTab === 'pending' && (
              <section className="admin-panel">
                <SectionHeader
                  title="Pending Players"
                  description="Review new registrations and assign a starting ladder rank."
                />
                <div className="mt-5 grid gap-3">
                  {pendingProfiles.length === 0 ? (
                    <AdminEmptyState message="No players are waiting for approval." />
                  ) : (
                    pendingProfiles.map((profile) => {
                      const approveKey = `approve-${profile.id}`;
                      const rejectKey = `reject-${profile.id}`;

                      return (
                        <article
                          className="grid gap-4 rounded-2xl border border-line-200 bg-white px-4 py-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_8rem_auto_auto] lg:items-end"
                          key={profile.id}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-base font-black text-ink-900">
                                {getProfileName(profile)}
                              </p>
                              <StatusBadge label="Pending Approval" tone="yellow" />
                            </div>
                            <p className="mt-1 truncate text-sm font-semibold text-ink-700">
                              {profile.email ?? 'Email not stored'}
                            </p>
                            <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-ink-500">
                              Signup date unavailable
                            </p>
                          </div>
                          <NumberInput
                            label="Rank"
                            min={1}
                            value={approvalRankDrafts[profile.id] ?? rankings.length + 1}
                            onChange={(value) => updateApprovalRankDraft(profile.id, value)}
                          />
                          <button
                            className="admin-primary-button"
                            type="button"
                            onClick={() => approvePlayer(profile.id)}
                            disabled={actionId === approveKey}
                          >
                            {actionId === approveKey ? 'Approving...' : 'Approve'}
                          </button>
                          <button
                            className="admin-danger-button"
                            type="button"
                            onClick={() => rejectPlayer(profile.id)}
                            disabled={actionId === rejectKey}
                          >
                            {actionId === rejectKey ? 'Rejecting...' : 'Reject'}
                          </button>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            )}

            {activeTab === 'players' && (
              <section className="admin-panel">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <SectionHeader
                    title="Players"
                    description="Search, edit names, review status, and manage roles."
                  />
                  <AdminSearchInput
                    value={playerSearch}
                    onChange={setPlayerSearch}
                    placeholder="Search name, email, status, or role"
                  />
                </div>
                <div className="mt-5 grid gap-3">
                  {filteredPlayerRows.length === 0 ? (
                    <AdminEmptyState message="No players match this search." />
                  ) : (
                    filteredPlayerRows.map(({ profile, ranking, status }) => {
                      const isRanked = Boolean(ranking);
                      const saveKey = `profile-${profile.id}`;
                      const isEditing = editingPlayerId === profile.id;

                      return (
                        <article
                          className="rounded-2xl border border-line-200 bg-white px-4 py-3 shadow-sm"
                          key={profile.id}
                        >
                          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="min-w-0 xl:flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-black text-ink-900 sm:text-base">
                                  {getProfileName(profile)}
                                </p>
                                <StatusBadge label={status.label} tone={status.tone} />
                              </div>
                              <p className="mt-1 truncate text-xs font-semibold text-ink-600">
                                {profile.email ?? 'Email not stored'}
                              </p>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-3 xl:w-[26rem]">
                              <CompactMetric
                                label="Rank"
                                value={ranking ? `#${ranking.rank_position}` : 'Unassigned'}
                              />
                              <CompactMetric
                                label="Record"
                                value={ranking ? `${ranking.wins}-${ranking.losses}` : '0-0'}
                              />
                              <CompactMetric label="Role" value={profile.role ?? 'player'} />
                            </div>

                            <div className="flex flex-wrap gap-2 xl:justify-end">
                              <button
                                className={isEditing ? 'admin-primary-button' : 'admin-secondary-button'}
                                type="button"
                                onClick={() => togglePlayerEdit(profile.id)}
                                disabled={actionId === saveKey}
                              >
                                {actionId === saveKey ? 'Saving...' : isEditing ? 'Save' : 'Edit'}
                              </button>
                              <button
                                className="admin-secondary-button"
                                type="button"
                                onClick={() => viewPlayerActivity(profile.id)}
                              >
                                View Activity
                              </button>
                              <button
                                className="admin-danger-button"
                                type="button"
                                onClick={() => removePlayerFromLadder(profile.id)}
                                disabled={!isRanked || actionId === profile.id}
                              >
                                Remove
                              </button>
                              <button
                                className="admin-secondary-button"
                                type="button"
                                onClick={() => requestDeactivatePlayer(profile)}
                                disabled={
                                  (profile.status === 'inactive' && !isRanked) ||
                                  actionId === `deactivate-${profile.id}`
                                }
                              >
                                Deactivate Player
                              </button>
                              <button
                                className="admin-secondary-button"
                                type="button"
                                onClick={() => openPlayerRankEditor(profile)}
                                disabled={!isRanked}
                              >
                                Change Rank
                              </button>
                            </div>
                          </div>
                          {isEditing && (
                            <div className="mt-3 grid gap-3 border-t border-line-200 pt-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
                              <label className="block">
                                <span className="admin-label">Full Name</span>
                                <input
                                  className="admin-input mt-1"
                                  value={profileNameDrafts[profile.id] ?? ''}
                                  onChange={(event) =>
                                    updateProfileNameDraft(profile.id, event.target.value)
                                  }
                                />
                              </label>
                              <label className="block">
                                <span className="admin-label">Role</span>
                                <select
                                  className="admin-input mt-1"
                                  value={profile.role ?? 'player'}
                                  onChange={(event) =>
                                    updateProfileRole(profile.id, event.target.value as ProfileRole)
                                  }
                                  disabled={actionId === profile.id}
                                >
                                  <option value="player">Player</option>
                                  <option value="admin">Admin</option>
                                </select>
                              </label>
                            </div>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            )}

            {activeTab === 'ladder' && (
              <section className="admin-panel">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <SectionHeader
                    title="Ladder Rankings"
                    description="Adjust ranks, records, and ladder placement."
                  />
                  <AdminSearchInput
                    value={playerSearch}
                    onChange={setPlayerSearch}
                    placeholder="Search ranked players"
                  />
                </div>
                <div className="mt-5 overflow-hidden rounded-2xl border border-line-200 bg-white">
                  <div className="hidden grid-cols-[6rem_minmax(0,1fr)_9rem_18rem] gap-3 border-b border-line-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-ink-600 lg:grid">
                    <span>Rank</span>
                    <span>Player</span>
                    <span>Record</span>
                    <span className="text-right">Actions</span>
                  </div>
                  <div className="divide-y divide-line-200">
                    {filteredRankings.length === 0 ? (
                      <AdminEmptyState message="No ranked players match this search." />
                    ) : (
                      filteredRankings.map((ranking) => {
                        const profile = profilesById.get(ranking.player_id);
                        const rowActionId = `player-row-${ranking.player_id}`;
                        const statusKey = profile
                          ? getPlayerStatusKey({
                              hasActiveMatch: activeMatchPlayerIds.has(profile.id),
                              hasScheduledMatch: scheduledMatchPlayerIds.has(profile.id),
                              isRanked: true,
                              profile,
                            })
                          : 'inactive';
                        const status = getPlayerStatusInfo(statusKey);
                        const draft = rankingDrafts[ranking.id] ?? {
                          rank_position: ranking.rank_position,
                          wins: ranking.wins,
                          losses: ranking.losses,
                        };
                        const rankTaken = rankings.some(
                          (otherRanking) =>
                            otherRanking.id !== ranking.id &&
                            otherRanking.rank_position === draft.rank_position,
                        );

                        return (
                          <article
                            className="grid gap-4 px-4 py-4 lg:grid-cols-[6rem_minmax(0,1fr)_9rem_18rem] lg:items-center"
                            key={ranking.id}
                          >
                            <div>
                              <NumberInput
                                label="Rank"
                                min={1}
                                value={draft.rank_position}
                                onChange={(value) => updateDraft(ranking.id, 'rank_position', value)}
                              />
                              {rankTaken && (
                                <p className="mt-1 text-xs font-bold text-amber-700">
                                  Rank is taken. Saving will reorder players.
                                </p>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-ink-900">
                                {getProfileName(profile)}
                              </p>
                              <p className="mt-1 truncate text-xs font-semibold text-ink-600">
                                {profile?.email ?? 'Email not stored'}
                              </p>
                              <div className="mt-2">
                                <StatusBadge label={status.label} tone={status.tone} />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                              <NumberInput
                                label="Wins"
                                min={0}
                                value={draft.wins}
                                onChange={(value) => updateDraft(ranking.id, 'wins', value)}
                              />
                              <NumberInput
                                label="Losses"
                                min={0}
                                value={draft.losses}
                                onChange={(value) => updateDraft(ranking.id, 'losses', value)}
                              />
                            </div>
                            <div className="flex flex-wrap gap-2 lg:justify-end">
                              <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-ink-700">
                                {draft.wins}-{draft.losses}
                              </span>
                              <button
                                className="admin-primary-button"
                                type="button"
                                onClick={() => updatePlayerManagementRow(ranking)}
                                disabled={actionId === rowActionId}
                              >
                                {actionId === rowActionId ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                className="admin-danger-button"
                                type="button"
                                onClick={() => removePlayerFromLadder(ranking.player_id)}
                                disabled={actionId === ranking.player_id}
                              >
                                Remove
                              </button>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>
                {filteredUnrankedProfiles.length > 0 && (
                  <div className="mt-5 rounded-2xl border border-dashed border-line-200 bg-slate-50 p-4">
                    <p className="text-sm font-black text-ink-900">Approved players not on ladder</p>
                    <div className="mt-3 grid gap-2">
                      {filteredUnrankedProfiles.map((profile) => (
                        <div
                          className="flex flex-col gap-3 rounded-xl bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                          key={profile.id}
                        >
                          <div>
                            <p className="text-sm font-bold text-ink-900">{getProfileName(profile)}</p>
                            <p className="text-xs text-ink-600">{profile.email ?? 'Email not stored'}</p>
                            <div className="mt-2">
                              <StatusBadge label="Inactive" tone="gray" />
                            </div>
                          </div>
                          <button
                            className="admin-secondary-button"
                            type="button"
                            onClick={() => addPlayerToLadder(profile.id)}
                            disabled={actionId === profile.id}
                          >
                            Add to Bottom
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {activeTab === 'matches' && (
              <section className="admin-panel">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <SectionHeader
                    title="Matches"
                    description="Scan who is waiting, what is scheduled, and what needs admin attention."
                  />
                  <div className="flex flex-wrap gap-2">
                    {matchFilterOptions.map(({ count, id, label }) => (
                      <button
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black transition ${
                          matchFilter === id
                            ? 'bg-[#071a3d] text-white'
                            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                        key={id}
                        type="button"
                        onClick={() => setMatchFilter(id)}
                      >
                        {label}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[0.68rem] ${
                            matchFilter === id ? 'bg-white/20 text-white' : 'bg-slate-100 text-ink-700'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {activityPlayer && (
                  <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-bold text-court-900">
                      Showing match activity for {getProfileName(activityPlayer)}
                    </p>
                    <button
                      className="admin-secondary-button bg-white"
                      type="button"
                      onClick={() => setActivityPlayerId(null)}
                    >
                      Show All Matches
                    </button>
                  </div>
                )}

                {matchFilter === 'needs_action' && pendingProfiles.length > 0 && !activityPlayer && (
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge label="Pending Approval" tone="yellow" />
                          <p className="text-sm font-black text-amber-950">
                            {pendingProfiles.length} player
                            {pendingProfiles.length === 1 ? '' : 's'} waiting for approval
                          </p>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-amber-900">
                          Review these before match follow-ups.
                        </p>
                      </div>
                      <button
                        className="admin-primary-button"
                        type="button"
                        onClick={() => setActiveTab('pending')}
                      >
                        Review Pending
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-5 grid gap-3">
                  {visibleAdminMatches.length === 0 ? (
                    <AdminEmptyState message="No matches match this filter." />
                  ) : (
                    visibleAdminMatches.map((match) => {
                      const status = getMatchStatusInfo(match.status);
                      const details = getMatchDetailItems(match, profilesById);

                      return (
                        <article
                          className="rounded-2xl border border-line-200 bg-white px-4 py-4 shadow-sm"
                          key={match.id}
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-black text-ink-900 sm:text-base">
                                  {getProfileName(profilesById.get(match.challenger_id))} vs{' '}
                                  {getProfileName(profilesById.get(match.opponent_id))}
                                </p>
                                <StatusBadge label={status.label} tone={status.tone} />
                              </div>
                              <p className="mt-1 text-sm font-semibold text-ink-700">
                                {getMatchActionText(match, profilesById)}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2 lg:justify-end">
                              <select
                                className="admin-input w-full sm:w-48"
                                value={match.status}
                                onChange={(event) =>
                                  updateMatchStatus(match.id, event.target.value as MatchStatus)
                                }
                                disabled={actionId === match.id}
                              >
                                <option value="pending">Pending</option>
                                <option value="accepted">Accepted</option>
                                <option value="time_proposed">Time Proposed</option>
                                <option value="declined">Declined</option>
                                <option value="scheduled">Scheduled</option>
                                <option value="cancellation_requested">Cancellation Requested</option>
                                <option value="completed" disabled>
                                  Completed (winner required)
                                </option>
                                <option value="canceled">Canceled</option>
                                <option value="expired">Expired</option>
                              </select>
                              <button
                                className="admin-danger-button"
                                type="button"
                                onClick={() => cancelMatch(match.id)}
                                disabled={actionId === match.id || match.status === 'canceled'}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            {details.map((detail) => (
                              <CompactMetric
                                key={detail.label}
                                label={detail.label}
                                value={detail.value}
                              />
                            ))}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            )}

            {activeTab === 'settings' && (
              <section className="admin-panel">
                <SectionHeader
                  title="Settings"
                  description="Season controls and dangerous actions."
                />
                <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-base font-black text-red-900">Reset Season</h3>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-red-800">
                        Sets all records to 0-0 and cancels active or scheduled matches.
                        Player ranks stay unchanged.
                      </p>
                    </div>
                    <button
                      className="admin-danger-solid-button"
                      type="button"
                      onClick={resetSeason}
                      disabled={actionId === 'reset-season'}
                    >
                      {actionId === 'reset-season' ? 'Resetting...' : 'Reset Season'}
                    </button>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight text-ink-900">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-700">{description}</p>
    </div>
  );
}

function AdminSearchInput({
  onChange,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="block w-full lg:max-w-sm">
      <span className="admin-label">Search</span>
      <input
        className="admin-input mt-1"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function AdminEmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-line-200 bg-slate-50 px-5 py-8 text-center text-sm font-semibold text-ink-700">
      {message}
    </p>
  );
}

function ProfileActionModal({
  action,
  isSaving,
  onCancel,
  onConfirm,
}: {
  action: ProfileConfirmAction;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const title = 'Deactivate Player';
  const confirmLabel = 'Deactivate Player';
  const body =
    'This will mark the player inactive and remove their ladder entry. Their profile, login account, and match history will stay in place.';

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-action-title"
    >
      <div className="w-full max-w-lg rounded-3xl border border-line-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-ink-500">
              Admin action
            </p>
            <h3 id="profile-action-title" className="mt-1 text-2xl font-black text-ink-900">
              {title}
            </h3>
          </div>
          <button
            className="rounded-full border border-line-200 px-3 py-1.5 text-sm font-black text-ink-600 hover:bg-slate-100"
            type="button"
            onClick={onCancel}
            disabled={isSaving}
          >
            Close
          </button>
        </div>
        <div className="mt-4 rounded-2xl border border-line-200 bg-slate-50 p-4">
          <p className="text-sm font-black text-ink-900">
            {getProfileName(action.profile)}
          </p>
          <p className="mt-1 text-sm font-semibold text-ink-600">
            {action.profile.email ?? 'Email not stored'}
          </p>
        </div>
        <p className="mt-4 text-sm leading-6 text-ink-700">{body}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            className="admin-secondary-button"
            type="button"
            onClick={onCancel}
            disabled={isSaving}
          >
            Keep Player
          </button>
          <button
            className="admin-primary-button"
            type="button"
            onClick={onConfirm}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line-200 bg-slate-50 px-3 py-2">
      <p className="text-[0.68rem] font-black uppercase tracking-[0.1em] text-ink-600">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-black text-ink-900">{value}</p>
    </div>
  );
}

const statusToneClasses: Record<StatusTone, { badge: string; dot: string }> = {
  blue: {
    badge: 'border-blue-200 bg-blue-50 text-blue-800',
    dot: 'bg-blue-500',
  },
  gray: {
    badge: 'border-slate-200 bg-slate-100 text-slate-700',
    dot: 'bg-slate-400',
  },
  green: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    dot: 'bg-emerald-500',
  },
  purple: {
    badge: 'border-violet-200 bg-violet-50 text-violet-800',
    dot: 'bg-violet-500',
  },
  red: {
    badge: 'border-red-200 bg-red-50 text-red-700',
    dot: 'bg-red-500',
  },
  yellow: {
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
    dot: 'bg-amber-400',
  },
};

function StatusBadge({ label, tone }: StatusInfo) {
  const classes = statusToneClasses[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black ${classes.badge}`}
    >
      <span className={`size-2 rounded-full ${classes.dot}`} />
      {label}
    </span>
  );
}

function AdminStatCard({
  label,
  tone,
  value,
}: {
  label: string;
  tone: StatusTone;
  value: number;
}) {
  const classes = statusToneClasses[tone];

  return (
    <div className="rounded-2xl border border-line-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-ink-600">
          {label}
        </p>
        <span className={`mt-0.5 size-2.5 rounded-full ${classes.dot}`} />
      </div>
      <p className="mt-1 text-2xl font-black text-ink-900">{value}</p>
    </div>
  );
}

function getMatchStatusInfo(status: MatchStatus): StatusInfo {
  const labels: Record<MatchStatus, StatusInfo> = {
    accepted: { label: 'Time proposal needed', tone: 'blue' },
    canceled: { label: 'Canceled', tone: 'red' },
    cancellation_requested: { label: 'Cancellation requested', tone: 'yellow' },
    completed: { label: 'Completed', tone: 'green' },
    declined: { label: 'Canceled', tone: 'red' },
    expired: { label: 'Canceled', tone: 'red' },
    pending: { label: 'Waiting for response', tone: 'yellow' },
    scheduled: { label: 'Scheduled', tone: 'purple' },
    time_proposed: { label: 'Time proposal needed', tone: 'blue' },
  };

  return labels[status];
}

function AdminIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 3 5 6v5c0 4.6 2.9 8.4 7 10 4.1-1.6 7-5.4 7-10V6l-7-3Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M9 12.5 11 14l4-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function NumberInput({
  label,
  min,
  value,
  onChange,
}: {
  label: string;
  min: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const [displayValue, setDisplayValue] = useState(String(value));

  useEffect(() => {
    setDisplayValue(String(value));
  }, [value]);

  function setNextValue(nextValue: number) {
    const clampedValue = Math.max(min, Math.floor(nextValue));

    setDisplayValue(String(clampedValue));
    onChange(clampedValue);
  }

  function handleInputChange(rawValue: string) {
    if (!/^\d*$/.test(rawValue)) {
      return;
    }

    setDisplayValue(rawValue);

    if (rawValue.trim() === '') {
      return;
    }

    const nextValue = Number(rawValue);

    if (!Number.isFinite(nextValue)) {
      return;
    }

    setNextValue(Math.floor(nextValue));
  }

  function handleBlur() {
    if (displayValue.trim() === '') {
      setDisplayValue(String(value));
      return;
    }

    setNextValue(Number(displayValue));
  }

  return (
    <label className="block">
      <span className="text-xs font-bold uppercase text-ink-700">{label}</span>
      <input
        className="mt-1 w-full rounded-xl border border-line-200 bg-white px-4 py-3 text-base font-black text-ink-900 outline-none [appearance:textfield] focus:border-court-500 focus:ring-2 focus:ring-court-100 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        inputMode="numeric"
        min={min}
        pattern="[0-9]*"
        type="text"
        value={displayValue}
        onChange={(event) => handleInputChange(event.target.value)}
        onBlur={handleBlur}
      />
    </label>
  );
}

function getProfileName(profile: Profile | undefined) {
  return profile?.full_name || 'Unnamed player';
}

function getPlayerStatusKey({
  hasActiveMatch,
  hasScheduledMatch,
  isRanked,
  profile,
}: {
  hasActiveMatch: boolean;
  hasScheduledMatch: boolean;
  isRanked: boolean;
  profile: Profile;
}): PlayerStatusKey {
  if (profile.status === 'pending') {
    return 'pending_approval';
  }

  if (profile.status !== 'approved' || !isRanked) {
    return 'inactive';
  }

  if (hasScheduledMatch) {
    return 'scheduled_match';
  }

  if (hasActiveMatch) {
    return 'active_match';
  }

  return 'available';
}

function getPlayerStatusInfo(status: PlayerStatusKey): StatusInfo {
  const statuses: Record<PlayerStatusKey, StatusInfo> = {
    active_match: { label: 'Active Match', tone: 'blue' },
    available: { label: 'Available', tone: 'green' },
    inactive: { label: 'Inactive', tone: 'gray' },
    pending_approval: { label: 'Pending Approval', tone: 'yellow' },
    scheduled_match: { label: 'Scheduled Match', tone: 'purple' },
  };

  return statuses[status];
}

function comparePlayerRows(first: PlayerAdminRow, second: PlayerAdminRow) {
  const statusPriority: Record<PlayerStatusKey, number> = {
    pending_approval: 0,
    active_match: 1,
    scheduled_match: 2,
    available: 3,
    inactive: 4,
  };
  const priorityDifference =
    statusPriority[first.statusKey] - statusPriority[second.statusKey];

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  if (first.ranking && second.ranking) {
    return first.ranking.rank_position - second.ranking.rank_position;
  }

  if (first.ranking) {
    return -1;
  }

  if (second.ranking) {
    return 1;
  }

  return getProfileName(first.profile).localeCompare(getProfileName(second.profile));
}

function isOpenMatch(match: Match) {
  return ['pending', 'accepted', 'time_proposed', 'scheduled', 'cancellation_requested'].includes(match.status);
}

function isMatchNeedsAdminAttention(match: Match) {
  return ['pending', 'accepted', 'time_proposed', 'cancellation_requested'].includes(match.status);
}

function isProblemMatch(match: Match) {
  return ['canceled', 'declined', 'expired'].includes(match.status);
}

function compareNeedsActionMatches(first: Match, second: Match) {
  const priority: Record<MatchStatus, number> = {
    accepted: 1,
    canceled: 5,
    cancellation_requested: 3,
    completed: 5,
    declined: 5,
    expired: 5,
    pending: 0,
    scheduled: 5,
    time_proposed: 2,
  };
  const priorityDifference = priority[first.status] - priority[second.status];

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
}

function getMatchActionText(match: Match, profilesById: Map<string, Profile>) {
  if (match.status === 'pending') {
    return `Waiting for ${getProfileName(profilesById.get(match.opponent_id))} to accept`;
  }

  if (match.status === 'accepted') {
    return 'Waiting for time selection';
  }

  if (match.status === 'time_proposed') {
    const nextPlayerId =
      match.proposed_by_player_id === match.challenger_id
        ? match.opponent_id
        : match.challenger_id;

    if (match.proposed_by_player_id) {
      return `Waiting for ${getProfileName(profilesById.get(nextPlayerId))} to choose a time`;
    }

    return 'Waiting for time selection';
  }

  if (match.status === 'scheduled') {
    return `Scheduled: ${formatCompactDateTime(match.proposed_match_at)}`;
  }

  if (match.status === 'cancellation_requested') {
    return match.cancellation_reason
      ? `Cancellation requested: ${match.cancellation_reason}`
      : 'Cancellation requested';
  }

  if (match.status === 'completed') {
    return `Completed: Winner ${getProfileName(profilesById.get(match.winner_id ?? ''))}`;
  }

  if (match.status === 'declined') {
    return 'Challenge declined';
  }

  if (match.status === 'expired') {
    return 'Expired without scheduling';
  }

  return match.cancel_reason ? `Canceled: ${match.cancel_reason}` : 'Canceled';
}

function getMatchDetailItems(match: Match, profilesById: Map<string, Profile>) {
  const details = [{ label: 'Next', value: getMatchActionText(match, profilesById) }];

  if (match.proposed_match_at && match.status !== 'scheduled') {
    details.push({
      label: match.status === 'completed' ? 'Played' : 'Proposed',
      value: formatCompactDateTime(match.proposed_match_at),
    });
  }

  if (match.status === 'scheduled' || match.status === 'cancellation_requested') {
    details.push({
      label: 'Scheduled Time',
      value: formatMatchTimeRange(match),
    });
  }

  if (match.status === 'completed' && match.winner_id) {
    details.push({
      label: 'Winner',
      value: getProfileName(profilesById.get(match.winner_id)),
    });
  }

  if (match.cancel_reason && isProblemMatch(match)) {
    details.push({ label: 'Reason', value: match.cancel_reason });
  }

  details.push({
    label: 'Created',
    value: formatCompactDateTime(match.created_at),
  });

  return details;
}

function getMatchTimelineDate(match: Match) {
  return match.proposed_match_at ?? match.created_at;
}

function isToday(value: string | null) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function isThisWeek(value: string | null) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());

  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  return date >= start && date < end;
}

function formatCompactDateTime(value: string | null) {
  if (!value) {
    return 'No time selected';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    weekday: 'short',
  }).format(new Date(value));
}

function formatMatchTimeRange(match: Match) {
  if (!match.proposed_match_at) {
    return 'No time selected';
  }

  if (!match.scheduled_match_ends_at) {
    return formatCompactDateTime(match.proposed_match_at);
  }

  const start = new Date(match.proposed_match_at);
  const end = new Date(match.scheduled_match_ends_at);
  const startLabel = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    weekday: 'short',
  }).format(start);
  const endLabel = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(end);

  return `${startLabel} - ${endLabel}`;
}

export default AdminPage;
