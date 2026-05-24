import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: 'player' | 'admin' | null;
  status: 'pending' | 'approved' | 'rejected' | 'inactive' | null;
};

type LadderRanking = {
  id: number | string;
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
  scheduled_match_ends_at: string | null;
  cancel_reason: string | null;
  canceled_at: string | null;
  winner_id: string | null;
  created_at: string;
};

type RankingDraft = {
  rank_position: number;
  wins: number;
  losses: number;
};

type AdminSection = 'pending' | 'ladder' | 'matches' | 'settings';
type MatchFilter = 'active' | 'time' | 'scheduled' | 'completed' | 'canceled';

const matchFilters: Array<{ id: MatchFilter; label: string }> = [
  { id: 'active', label: 'Active Challenges' },
  { id: 'time', label: 'Time Proposals' },
  { id: 'scheduled', label: 'Scheduled Matches' },
  { id: 'completed', label: 'Completed Matches' },
  { id: 'canceled', label: 'Canceled Matches' },
];

function AdminPage() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rankings, setRankings] = useState<LadderRanking[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [rankingDrafts, setRankingDrafts] = useState<Record<string, RankingDraft>>({});
  const [approvalRankDrafts, setApprovalRankDrafts] = useState<Record<string, number>>({});
  const [profileNameDrafts, setProfileNameDrafts] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState<AdminSection>('pending');
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('active');
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    loadAdminData();
  }, []);

  const profilesById = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.id, profile]));
  }, [profiles]);

  const rankedPlayerIds = useMemo(() => {
    return new Set(rankings.map((ranking) => ranking.player_id));
  }, [rankings]);

  const pendingProfiles = useMemo(() => {
    return profiles
      .filter((profile) => profile.status === 'pending')
      .sort((first, second) => getProfileName(first).localeCompare(getProfileName(second)));
  }, [profiles]);

  const approvedUnrankedProfiles = useMemo(() => {
    return profiles
      .filter((profile) => profile.status === 'approved' && !rankedPlayerIds.has(profile.id))
      .sort((first, second) => getProfileName(first).localeCompare(getProfileName(second)));
  }, [profiles, rankedPlayerIds]);

  const sortedRankings = useMemo(() => {
    return [...rankings].sort((first, second) => first.rank_position - second.rank_position);
  }, [rankings]);

  const filteredMatches = useMemo(() => {
    return matches
      .filter((match) => matchMatchesFilter(match, matchFilter))
      .sort(compareMatchesNewestFirst);
  }, [matchFilter, matches]);

  const matchCounts = useMemo(() => {
    return Object.fromEntries(
      matchFilters.map((filter) => [
        filter.id,
        matches.filter((match) => matchMatchesFilter(match, filter.id)).length,
      ]),
    ) as Record<MatchFilter, number>;
  }, [matches]);

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
    const nextProfiles = (profileRows ?? []) as Profile[];
    const highestRank = nextRankings.reduce(
      (highest, ranking) => Math.max(highest, ranking.rank_position),
      0,
    );

    setProfiles(nextProfiles);
    setRankings(nextRankings);
    setMatches((matchRows ?? []) as Match[]);
    setRankingDrafts(
      Object.fromEntries(
        nextRankings.map((ranking) => [
          getRankingKey(ranking),
          {
            rank_position: ranking.rank_position,
            wins: ranking.wins ?? 0,
            losses: ranking.losses ?? 0,
          },
        ]),
      ),
    );
    setProfileNameDrafts(
      Object.fromEntries(
        nextProfiles.map((profile) => [profile.id, profile.full_name ?? '']),
      ),
    );
    setApprovalRankDrafts((current) => {
      const nextDrafts = { ...current };

      nextProfiles
        .filter((profile) => profile.status === 'pending')
        .forEach((profile, index) => {
          nextDrafts[profile.id] = nextDrafts[profile.id] ?? highestRank + index + 1;
        });

      return nextDrafts;
    });
    setIsLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  async function approvePlayer(profileId: string) {
    const rankPosition = approvalRankDrafts[profileId];

    if (!rankPosition || rankPosition < 1) {
      setErrorMessage('Enter a valid rank before approving this player.');
      return;
    }

    if (isRankOccupied(rankings, rankPosition)) {
      setErrorMessage(`Rank ${rankPosition} is already occupied. Choose an empty rank.`);
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

    setMessage('Registration rejected.');
    await loadAdminData();
  }

  async function addPlayerToLadder(playerId: string) {
    const nextRank =
      rankings.reduce((highest, ranking) => Math.max(highest, ranking.rank_position), 0) + 1;

    setActionId(`add-${playerId}`);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase.from('ladder_rankings').insert({
      losses: 0,
      player_id: playerId,
      rank_position: nextRank,
      wins: 0,
    });

    setActionId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage('Player added to the bottom of the ladder.');
    await loadAdminData();
  }

  async function removePlayerFromLadder(playerId: string) {
    const confirmed = window.confirm('Remove this player from the ladder? Their profile stays active.');

    if (!confirmed) {
      return;
    }

    setActionId(`remove-${playerId}`);
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

  async function saveRanking(ranking: LadderRanking) {
    const rankingKey = getRankingKey(ranking);
    const draft = rankingDrafts[rankingKey];
    const profile = profilesById.get(ranking.player_id);
    const fullName = profileNameDrafts[ranking.player_id]?.trim() || null;

    if (!draft) {
      return;
    }

    if (isRankOccupied(rankings, draft.rank_position, ranking.player_id)) {
      setErrorMessage(`Rank ${draft.rank_position} is already occupied. Choose an empty rank.`);
      return;
    }

    setActionId(`ranking-${rankingKey}`);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase.rpc('admin_update_player_ladder_row', {
      target_full_name: fullName ?? profile?.full_name ?? null,
      target_losses: draft.losses,
      target_player_id: ranking.player_id,
      target_rank_position: draft.rank_position,
      target_wins: draft.wins,
    });

    setActionId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage('Ladder row updated.');
    await loadAdminData();
  }

  async function cancelMatch(match: Match) {
    const confirmed = window.confirm('Cancel this match?');

    if (!confirmed) {
      return;
    }

    setActionId(`match-${match.id}`);
    setMessage('');
    setErrorMessage('');

    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const { error } = await supabase
      .from('matches')
      .update({
        cancel_reason: 'Canceled by admin',
        canceled_at: new Date().toISOString(),
        canceled_by: userId,
        status: 'canceled',
      })
      .eq('id', match.id);

    setActionId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage('Match canceled.');
    await loadAdminData();
  }

  async function updateMatchStatus(match: Match, status: MatchStatus) {
    if (status === 'completed') {
      setErrorMessage('Completed matches are recorded by players. Correct records in Ladder Management.');
      return;
    }

    if (status === 'canceled') {
      await cancelMatch(match);
      return;
    }

    setActionId(`match-${match.id}`);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase.from('matches').update({ status }).eq('id', match.id);

    setActionId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage('Match status updated.');
    await loadAdminData();
  }

  async function resetSeason() {
    const confirmed = window.confirm(
      'Reset the season? Wins and losses become 0-0, and active/scheduled matches are canceled.',
    );

    if (!confirmed) {
      return;
    }

    setActionId('reset-season');
    setMessage('');
    setErrorMessage('');

    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const [{ error: rankingsError }, { error: matchesError }] = await Promise.all([
      supabase.from('ladder_rankings').update({ losses: 0, wins: 0 }).gte('rank_position', 1),
      supabase
        .from('matches')
        .update({
          cancel_reason: 'Season reset',
          canceled_at: new Date().toISOString(),
          canceled_by: userId,
          status: 'canceled',
        })
        .in('status', ['pending', 'accepted', 'time_proposed', 'scheduled', 'cancellation_requested']),
    ]);

    setActionId(null);

    if (rankingsError || matchesError) {
      setErrorMessage(rankingsError?.message ?? matchesError?.message ?? 'Unable to reset season.');
      return;
    }

    setMessage('Season reset.');
    await loadAdminData();
  }

  function updateRankingDraft(
    rankingId: string,
    field: keyof RankingDraft,
    value: number,
  ) {
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

  return (
    <main className="min-h-screen bg-[#f7f8fc] px-4 py-5 text-[#071a3d] sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-[82rem] space-y-5">
        <header className="relative overflow-hidden rounded-3xl border border-[#102a5c] bg-[#071a3d] px-5 py-6 text-white shadow-lg shadow-slate-900/15 sm:px-7">
          <div className="absolute inset-x-0 top-0 h-1 bg-red-600" />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-red-200">
                Roton Point
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
                Admin Control Center
              </h1>
              <p className="mt-2 text-sm font-semibold text-white/70">
                Manage pending players, ladder rankings, and matches.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="admin-soft-button border-white/20 bg-white/10 text-white hover:bg-white/15" to="/dashboard">
                Dashboard
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
            className={`rounded-2xl border px-4 py-3 text-sm font-bold shadow-sm ${
              errorMessage
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-blue-200 bg-blue-50 text-[#071a3d]'
            }`}
            role={errorMessage ? 'alert' : 'status'}
          >
            {errorMessage || message}
          </div>
        )}

        {isLoading ? (
          <div className="admin-panel text-sm font-bold text-slate-700">
            Loading admin data...
          </div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard label="Pending" value={pendingProfiles.length} />
              <SummaryCard label="Ranked" value={rankings.length} />
              <SummaryCard label="Scheduled" value={matchCounts.scheduled} />
              <SummaryCard label="Completed" value={matchCounts.completed} />
            </section>

            <nav className="grid gap-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-4">
              {([
                ['pending', 'Pending Players'],
                ['ladder', 'Ladder Management'],
                ['matches', 'Matches'],
                ['settings', 'Settings'],
              ] as const).map(([section, label]) => (
                <button
                  className={`rounded-2xl px-3 py-2.5 text-sm font-black transition ${
                    activeSection === section
                      ? 'bg-[#071a3d] text-white shadow-sm'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-[#071a3d]'
                  }`}
                  key={section}
                  type="button"
                  onClick={() => setActiveSection(section)}
                >
                  {label}
                </button>
              ))}
            </nav>

            {activeSection === 'pending' && (
              <AdminPanel title="Pending Players" description="Approve new members and assign a starting rank.">
                <div className="grid gap-3">
                  {pendingProfiles.length === 0 ? (
                    <AdminEmptyState message="No pending players." />
                  ) : (
                    pendingProfiles.map((profile) => {
                      const approvalRank =
                        approvalRankDrafts[profile.id] ?? rankings.length + 1;
                      const rankTaken = isRankOccupied(rankings, approvalRank);

                      return (
                        <article
                          className="grid gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 lg:grid-cols-[minmax(0,1fr)_8rem_auto_auto] lg:items-end"
                          key={profile.id}
                        >
                          <PlayerIdentity profile={profile} />
                          <div>
                            <NumberInput
                              label="Rank"
                              min={1}
                              value={approvalRank}
                              onChange={(value) =>
                                setApprovalRankDrafts((current) => ({
                                  ...current,
                                  [profile.id]: value,
                                }))
                              }
                            />
                            {rankTaken && (
                              <p className="mt-1 text-xs font-bold text-red-700">
                                Rank occupied
                              </p>
                            )}
                          </div>
                          <button
                            className="admin-primary-button"
                            type="button"
                            onClick={() => approvePlayer(profile.id)}
                            disabled={actionId === `approve-${profile.id}`}
                          >
                            {actionId === `approve-${profile.id}` ? 'Approving...' : 'Approve'}
                          </button>
                          <button
                            className="admin-danger-button"
                            type="button"
                            onClick={() => rejectPlayer(profile.id)}
                            disabled={actionId === `reject-${profile.id}`}
                          >
                            {actionId === `reject-${profile.id}` ? 'Rejecting...' : 'Reject'}
                          </button>
                        </article>
                      );
                    })
                  )}
                </div>
              </AdminPanel>
            )}

            {activeSection === 'ladder' && (
              <AdminPanel title="Ladder Management" description="Edit ranks and records without deleting player profiles.">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="hidden grid-cols-[5rem_minmax(0,1fr)_8rem_8rem_8rem_12rem] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-slate-600 lg:grid">
                    <span>Rank</span>
                    <span>Player</span>
                    <span>Wins</span>
                    <span>Losses</span>
                    <span>Record</span>
                    <span className="text-right">Actions</span>
                  </div>
                  <div className="divide-y divide-slate-200">
                    {sortedRankings.length === 0 ? (
                      <AdminEmptyState message="No ranked players yet." />
                    ) : (
                      sortedRankings.map((ranking) => {
                        const profile = profilesById.get(ranking.player_id);
                        const rankingKey = getRankingKey(ranking);
                        const draft = rankingDrafts[rankingKey] ?? {
                          losses: ranking.losses,
                          rank_position: ranking.rank_position,
                          wins: ranking.wins,
                        };
                        const rankTaken = rankings.some(
                          (other) =>
                            other.player_id !== ranking.player_id &&
                            other.rank_position === draft.rank_position,
                        );

                        return (
                          <article
                            className="grid gap-3 px-4 py-4 lg:grid-cols-[5rem_minmax(0,1fr)_8rem_8rem_8rem_12rem] lg:items-center"
                            key={rankingKey}
                          >
                            <div>
                              <NumberInput
                                label="Rank"
                                min={1}
                                value={draft.rank_position}
                                onChange={(value) =>
                                  updateRankingDraft(rankingKey, 'rank_position', value)
                                }
                              />
                              {rankTaken && (
                                <p className="mt-1 text-xs font-bold text-red-700">
                                  Rank occupied
                                </p>
                              )}
                            </div>
                            <PlayerNameEditor
                              email={profile?.email ?? null}
                              name={profileNameDrafts[ranking.player_id] ?? profile?.full_name ?? ''}
                              onChange={(value) =>
                                updateProfileNameDraft(ranking.player_id, value)
                              }
                            />
                            <NumberInput
                              label="Wins"
                              min={0}
                              value={draft.wins}
                              onChange={(value) => updateRankingDraft(rankingKey, 'wins', value)}
                            />
                            <NumberInput
                              label="Losses"
                              min={0}
                              value={draft.losses}
                              onChange={(value) => updateRankingDraft(rankingKey, 'losses', value)}
                            />
                            <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-black text-[#071a3d]">
                              {draft.wins}-{draft.losses}
                            </p>
                            <div className="flex flex-wrap gap-2 lg:justify-end">
                              <button
                                className="admin-primary-button"
                                type="button"
                                onClick={() => saveRanking(ranking)}
                                disabled={actionId === `ranking-${rankingKey}`}
                              >
                                {actionId === `ranking-${rankingKey}` ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                className="admin-danger-button"
                                type="button"
                                onClick={() => removePlayerFromLadder(ranking.player_id)}
                                disabled={actionId === `remove-${ranking.player_id}`}
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

                {approvedUnrankedProfiles.length > 0 && (
                  <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                    <h3 className="text-sm font-black text-[#071a3d]">Approved but not ranked</h3>
                    <div className="mt-3 grid gap-2">
                      {approvedUnrankedProfiles.map((profile) => (
                        <div
                          className="flex flex-col gap-3 rounded-xl bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                          key={profile.id}
                        >
                          <PlayerIdentity profile={profile} />
                          <button
                            className="admin-secondary-button"
                            type="button"
                            onClick={() => addPlayerToLadder(profile.id)}
                            disabled={actionId === `add-${profile.id}`}
                          >
                            Add to Bottom
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </AdminPanel>
            )}

            {activeSection === 'matches' && (
              <AdminPanel title="Matches" description="Review match status, scheduled times, and completed results.">
                <div className="flex flex-wrap gap-2">
                  {matchFilters.map((filter) => (
                    <button
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black transition ${
                        matchFilter === filter.id
                          ? 'bg-[#071a3d] text-white'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                      key={filter.id}
                      type="button"
                      onClick={() => setMatchFilter(filter.id)}
                    >
                      {filter.label}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.68rem] ${
                          matchFilter === filter.id ? 'bg-white/20 text-white' : 'bg-slate-100'
                        }`}
                      >
                        {matchCounts[filter.id]}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="mt-5 grid gap-3">
                  {filteredMatches.length === 0 ? (
                    <AdminEmptyState message="No matches in this view." />
                  ) : (
                    filteredMatches.map((match) => (
                      <MatchAdminCard
                        actionId={actionId}
                        key={match.id}
                        match={match}
                        playersById={profilesById}
                        onCancel={() => cancelMatch(match)}
                        onStatusChange={(status) => updateMatchStatus(match, status)}
                      />
                    ))
                  )}
                </div>
              </AdminPanel>
            )}

            {activeSection === 'settings' && (
              <AdminPanel title="Settings" description="Season controls. No player profiles or auth users are deleted.">
                <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-base font-black text-red-900">Reset Season</h3>
                      <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-red-800">
                        Sets all wins/losses to 0-0 and cancels active or scheduled matches.
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
              </AdminPanel>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function AdminPanel({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="admin-panel">
      <div className="mb-5">
        <h2 className="text-2xl font-black tracking-tight text-[#071a3d]">{title}</h2>
        <p className="mt-1 text-sm font-semibold text-slate-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-600">
          {label}
        </p>
        <span className="size-2.5 rounded-full bg-red-600" />
      </div>
      <p className="mt-1 text-2xl font-black text-[#071a3d]">{value}</p>
    </div>
  );
}

function PlayerIdentity({ profile }: { profile: Profile | undefined }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-black text-[#071a3d]">
        {getProfileName(profile)}
      </p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-600">
        {profile?.email ?? 'Email not stored'}
      </p>
    </div>
  );
}

function PlayerNameEditor({
  email,
  name,
  onChange,
}: {
  email: string | null;
  name: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="admin-label">Player</span>
      <input
        className="admin-input mt-1"
        value={name}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="mt-1 block truncate text-xs font-semibold text-slate-600">
        {email ?? 'Email not stored'}
      </span>
    </label>
  );
}

function MatchAdminCard({
  actionId,
  match,
  onCancel,
  onStatusChange,
  playersById,
}: {
  actionId: string | null;
  match: Match;
  onCancel: () => void;
  onStatusChange: (status: MatchStatus) => void;
  playersById: Map<string, Profile>;
}) {
  const challenger = playersById.get(match.challenger_id);
  const opponent = playersById.get(match.opponent_id);
  const isTerminal = ['completed', 'canceled', 'declined', 'expired'].includes(match.status);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-black text-[#071a3d] sm:text-base">
              {getProfileName(challenger)} vs {getProfileName(opponent)}
            </p>
            <StatusBadge status={match.status} />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <DetailPill label="Time" value={formatMatchTime(match)} />
            <DetailPill
              label="Winner"
              value={
                match.winner_id
                  ? getProfileName(playersById.get(match.winner_id))
                  : 'Not recorded'
              }
            />
            <DetailPill label="Created" value={formatDateTime(match.created_at)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          {!isTerminal && (
            <>
              <select
                className="admin-input w-full sm:w-48"
                value={match.status}
                onChange={(event) => onStatusChange(event.target.value as MatchStatus)}
                disabled={actionId === `match-${match.id}`}
              >
                {getSafeStatusOptions(match).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                className="admin-danger-button"
                type="button"
                onClick={onCancel}
                disabled={actionId === `match-${match.id}`}
              >
                Cancel
              </button>
            </>
          )}

          {match.status === 'completed' && (
            <p className="max-w-xs rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-700">
              If a result was entered incorrectly, adjust wins/losses and rankings
              manually in Ladder Management.
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function DetailPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[0.68rem] font-black uppercase tracking-[0.1em] text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-black text-[#071a3d]">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: MatchStatus }) {
  const isRed = ['canceled', 'declined', 'expired'].includes(status);
  const isGreen = ['scheduled', 'completed'].includes(status);
  const className = isRed
    ? 'border-red-200 bg-red-50 text-red-700'
    : isGreen
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-amber-200 bg-amber-50 text-amber-800';

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${className}`}>
      {getStatusLabel(status)}
    </span>
  );
}

function AdminEmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm font-semibold text-slate-600">
      {message}
    </p>
  );
}

function NumberInput({
  label,
  min,
  onChange,
  value,
}: {
  label: string;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  const [displayValue, setDisplayValue] = useState(String(value));

  useEffect(() => {
    setDisplayValue(String(value));
  }, [value]);

  function commitValue(rawValue: string) {
    if (rawValue.trim() === '') {
      setDisplayValue(String(value));
      return;
    }

    const nextValue = Math.max(min, Math.floor(Number(rawValue)));

    if (!Number.isFinite(nextValue)) {
      setDisplayValue(String(value));
      return;
    }

    setDisplayValue(String(nextValue));
    onChange(nextValue);
  }

  return (
    <label className="block">
      <span className="admin-label">{label}</span>
      <input
        className="admin-input mt-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        inputMode="numeric"
        pattern="[0-9]*"
        type="text"
        value={displayValue}
        onBlur={() => commitValue(displayValue)}
        onChange={(event) => {
          const nextValue = event.target.value;

          if (/^\d*$/.test(nextValue)) {
            setDisplayValue(nextValue);

            if (nextValue.trim() !== '') {
              onChange(Math.max(min, Math.floor(Number(nextValue))));
            }
          }
        }}
      />
    </label>
  );
}

function getSafeStatusOptions(match: Match) {
  const options: Array<{ label: string; value: MatchStatus }> = [
    { label: 'Pending', value: 'pending' },
    { label: 'Accepted', value: 'accepted' },
    { label: 'Declined', value: 'declined' },
    { label: 'Expired', value: 'expired' },
    { label: 'Canceled', value: 'canceled' },
  ];

  if (match.status === 'time_proposed') {
    options.splice(2, 0, { label: 'Time Proposed', value: 'time_proposed' });
  }

  if (match.proposed_match_at) {
    options.splice(3, 0, { label: 'Scheduled', value: 'scheduled' });
  }

  if (match.status === 'cancellation_requested') {
    options.splice(4, 0, {
      label: 'Cancellation Requested',
      value: 'cancellation_requested',
    });
  }

  return options;
}

function getProfileName(profile: Profile | undefined) {
  return profile?.full_name?.trim() || profile?.email || 'Unnamed player';
}

function getRankingKey(ranking: LadderRanking) {
  return String(ranking.id);
}

function isRankOccupied(
  rankings: LadderRanking[],
  rankPosition: number,
  excludedPlayerId?: string,
) {
  return rankings.some(
    (ranking) =>
      ranking.rank_position === rankPosition &&
      ranking.player_id !== excludedPlayerId,
  );
}

function getStatusLabel(status: MatchStatus) {
  const labels: Record<MatchStatus, string> = {
    accepted: 'Accepted',
    canceled: 'Canceled',
    cancellation_requested: 'Cancellation Requested',
    completed: 'Completed',
    declined: 'Declined',
    expired: 'Expired',
    pending: 'Pending',
    scheduled: 'Scheduled',
    time_proposed: 'Time Proposed',
  };

  return labels[status];
}

function matchMatchesFilter(match: Match, filter: MatchFilter) {
  if (filter === 'active') {
    return match.status === 'pending' || match.status === 'accepted';
  }

  if (filter === 'time') {
    return match.status === 'time_proposed';
  }

  if (filter === 'scheduled') {
    return match.status === 'scheduled' || match.status === 'cancellation_requested';
  }

  if (filter === 'completed') {
    return match.status === 'completed';
  }

  return ['canceled', 'declined', 'expired'].includes(match.status);
}

function compareMatchesNewestFirst(first: Match, second: Match) {
  return getMatchSortTime(second) - getMatchSortTime(first);
}

function getMatchSortTime(match: Match) {
  return new Date(match.proposed_match_at ?? match.created_at).getTime();
}

function formatMatchTime(match: Match) {
  if (!match.proposed_match_at) {
    return 'No time selected';
  }

  if (!match.scheduled_match_ends_at) {
    return formatDateTime(match.proposed_match_at);
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

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

export default AdminPage;
