import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type ProfileRole = 'player' | 'admin';

type Profile = {
  id: string;
  full_name: string | null;
  email?: string | null;
  role: ProfileRole | null;
  status: 'pending' | 'approved' | 'rejected' | null;
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
  | 'completed'
  | 'canceled'
  | 'expired';

type Match = {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: MatchStatus;
  proposed_match_at: string | null;
  scheduled_match_ends_at: string | null;
  cancel_reason?: string | null;
  canceled_at?: string | null;
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
type MatchFilter = 'all' | MatchStatus;

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
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    loadAdminData();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/admin-login', { replace: true });
  }

  const profilesById = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.id, profile]));
  }, [profiles]);

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

  const approvedProfiles = useMemo(() => {
    return profiles.filter((profile) => profile.status === 'approved');
  }, [profiles]);

  const filteredApprovedProfiles = useMemo(() => {
    const query = playerSearch.trim().toLowerCase();

    if (!query) {
      return approvedProfiles;
    }

    return approvedProfiles.filter((profile) =>
      [profile.full_name ?? '', profile.email ?? '', profile.role ?? '', profile.status ?? '', profile.id]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [approvedProfiles, playerSearch]);

  const activeChallengeMatches = useMemo(() => {
    return matches.filter((match) =>
      ['pending', 'accepted', 'time_proposed'].includes(match.status),
    );
  }, [matches]);

  const scheduledMatches = useMemo(() => {
    return matches.filter((match) => match.status === 'scheduled');
  }, [matches]);

  const completedMatches = useMemo(() => {
    return matches.filter((match) => match.status === 'completed');
  }, [matches]);

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

  const filteredMatches = useMemo(() => {
    if (matchFilter === 'all') {
      return matches;
    }

    return matches.filter((match) => match.status === matchFilter);
  }, [matchFilter, matches]);

  const matchStatusCounts = useMemo(() => {
    return matches.reduce<Record<MatchStatus, number>>(
      (counts, match) => ({
        ...counts,
        [match.status]: counts[match.status] + 1,
      }),
      {
        pending: 0,
        accepted: 0,
        time_proposed: 0,
        declined: 0,
        scheduled: 0,
        completed: 0,
        canceled: 0,
        expired: 0,
      },
    );
  }, [matches]);

  const visibleAdminMatches = useMemo(() => {
    return filteredMatches;
  }, [filteredMatches]);

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
        .select('id, challenger_id, opponent_id, status, proposed_match_at, scheduled_match_ends_at, cancel_reason, canceled_at, winner_id, created_at')
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
      return;
    }

    setMessage('Player name updated.');
    await loadAdminData();
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
        .in('status', ['pending', 'accepted', 'time_proposed', 'scheduled']),
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
    <main className="min-h-screen bg-[#f6f7fb] px-4 py-5 text-ink-900 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-[88rem] space-y-5">
        <header className="rounded-[1.75rem] border border-slate-800 bg-slate-950 px-5 py-6 text-white shadow-lg shadow-slate-900/15 sm:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-court-500 text-white shadow-sm">
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

        {isLoading ? (
          <div className="rounded-3xl border border-line-200 bg-white p-8 text-sm font-semibold text-ink-700 shadow-sm">
            Loading admin data...
          </div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <AdminStatCard label="Pending Players" value={pendingProfiles.length} />
              <AdminStatCard label="Approved Players" value={approvedProfiles.length} />
              <AdminStatCard label="Active Matches" value={activeChallengeMatches.length} />
              <AdminStatCard label="Scheduled Matches" value={scheduledMatches.length} />
            </section>

            <nav className="grid gap-2 rounded-3xl border border-line-200 bg-white p-2 shadow-sm sm:grid-cols-5">
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
                      ? 'bg-court-900 text-white shadow-sm'
                      : 'text-ink-700 hover:bg-slate-100 hover:text-ink-900'
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
                            <p className="truncate text-base font-black text-ink-900">
                              {getProfileName(profile)}
                            </p>
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
                  {filteredApprovedProfiles.length === 0 ? (
                    <AdminEmptyState message="No approved players match this search." />
                  ) : (
                    filteredApprovedProfiles.map((profile) => {
                      const isRanked = rankedPlayerIds.has(profile.id);
                      const saveKey = `profile-${profile.id}`;

                      return (
                        <article
                          className="grid gap-4 rounded-2xl border border-line-200 bg-white px-4 py-4 shadow-sm xl:grid-cols-[minmax(0,1fr)_minmax(12rem,1fr)_8rem_8rem_auto] xl:items-end"
                          key={profile.id}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-ink-900">
                              {getProfileName(profile)}
                            </p>
                            <p className="mt-1 truncate text-xs font-semibold text-ink-600">
                              {profile.email ?? 'Email not stored'}
                            </p>
                            <p className="mt-2">
                              <StatusPill label={isRanked ? 'On ladder' : 'Not ranked'} />
                            </p>
                          </div>
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
                          <ReadOnlyField label="Status" value={profile.status ?? 'unknown'} />
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
                          <div className="flex flex-wrap gap-2 xl:justify-end">
                            <button
                              className="admin-primary-button"
                              type="button"
                              onClick={() => saveProfileName(profile.id)}
                              disabled={actionId === saveKey}
                            >
                              {actionId === saveKey ? 'Saving...' : 'Save'}
                            </button>
                            {isRanked ? (
                              <button
                                className="admin-danger-button"
                                type="button"
                                onClick={() => removePlayerFromLadder(profile.id)}
                                disabled={actionId === profile.id}
                              >
                                Remove
                              </button>
                            ) : (
                              <button
                                className="admin-secondary-button"
                                type="button"
                                onClick={() => addPlayerToLadder(profile.id)}
                                disabled={actionId === profile.id}
                              >
                                Add to Bottom
                              </button>
                            )}
                          </div>
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
                    description="Review match status, scheduled times, and cancellations."
                  />
                  <div className="flex flex-wrap gap-2">
                    {([
                      ['all', 'All'],
                      ['pending', 'Pending'],
                      ['accepted', 'Accepted'],
                      ['time_proposed', 'Time Proposed'],
                      ['scheduled', 'Scheduled'],
                      ['completed', 'Completed'],
                      ['canceled', 'Canceled'],
                    ] as const).map(([filter, label]) => (
                      <button
                        className={`rounded-full px-3 py-2 text-xs font-black transition ${
                          matchFilter === filter
                            ? 'bg-court-900 text-white'
                            : 'border border-line-200 bg-white text-ink-700 hover:bg-slate-100'
                        }`}
                        key={filter}
                        type="button"
                        onClick={() => setMatchFilter(filter)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <AdminStatusCard label="Active" value={activeChallengeMatches.length} />
                  <AdminStatusCard label="Scheduled" value={scheduledMatches.length} />
                  <AdminStatusCard label="Completed" value={completedMatches.length} />
                </div>
                <div className="mt-5 grid gap-3">
                  {visibleAdminMatches.length === 0 ? (
                    <AdminEmptyState message="No matches match this filter." />
                  ) : (
                    visibleAdminMatches.map((match) => (
                      <article
                        className="grid gap-4 rounded-2xl border border-line-200 bg-white px-4 py-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_11rem_auto] lg:items-center"
                        key={match.id}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-black text-ink-900">
                              {getProfileName(profilesById.get(match.challenger_id))} vs{' '}
                              {getProfileName(profilesById.get(match.opponent_id))}
                            </p>
                            <StatusPill label={getMatchStatusLabel(match.status)} />
                          </div>
                          <p className="mt-1 text-sm font-semibold text-ink-700">
                            {formatMatchWindow(match)}
                          </p>
                          {match.winner_id && (
                            <p className="mt-1 text-xs font-bold text-ink-600">
                              Winner: {getProfileName(profilesById.get(match.winner_id))}
                            </p>
                          )}
                        </div>
                        <select
                          className="admin-input"
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
                      </article>
                    ))
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

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="admin-label">{label}</p>
      <p className="mt-1 rounded-xl border border-line-200 bg-slate-50 px-3 py-2 text-sm font-bold capitalize text-ink-800">
        {value}
      </p>
    </div>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-ink-700">
      {label}
    </span>
  );
}

function AdminStatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.5rem] border border-line-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-court-700">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-ink-900">{value}</p>
    </div>
  );
}

function AdminStatusCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-ink-700">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black text-ink-900">{value}</p>
    </div>
  );
}

function getMatchStatusLabel(status: MatchStatus) {
  const labels: Record<MatchStatus, string> = {
    pending: 'Pending',
    accepted: 'Accepted',
    time_proposed: 'Time Proposed',
    declined: 'Declined',
    scheduled: 'Scheduled',
    completed: 'Completed',
    canceled: 'Canceled',
    expired: 'Expired',
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

function formatDisplayDate(value: string | null) {
  if (!value) {
    return 'No time selected';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatMatchWindow(match: Match) {
  if (!match.proposed_match_at) {
    return 'No time selected';
  }

  const start = new Date(match.proposed_match_at);

  if (!match.scheduled_match_ends_at) {
    return formatDisplayDate(match.proposed_match_at);
  }

  const end = new Date(match.scheduled_match_ends_at);
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(start);
  const startTime = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(start);
  const endTime = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(end);

  return `${date}, ${startTime} - ${endTime}`;
}

export default AdminPage;
