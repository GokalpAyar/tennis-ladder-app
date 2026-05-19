import { memo, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

type Profile = {
  id: string;
  full_name: string | null;
  status: 'pending' | 'approved' | null;
};

type RankedPlayer = {
  id: string;
  name: string;
  rankPosition: number;
  wins: number;
  losses: number;
};

type PyramidSpot = {
  rankPosition: number;
  player: RankedPlayer | null;
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
  proposed_match_options: MatchTimeProposal[];
  scheduled_match_ends_at: string | null;
  proposed_by_player_id: string | null;
  challenger_agreed_at: string | null;
  opponent_agreed_at: string | null;
  cancel_reason: string | null;
  canceled_at: string | null;
  canceled_by: string | null;
  winner_id: string | null;
  stats_recorded: boolean;
  ranking_updated: boolean;
  created_at: string;
};

type ScheduledMatchSlot = {
  id: string;
  proposed_match_at: string | null;
  scheduled_match_ends_at: string | null;
};

type WinnerDraft = {
  winnerId: string;
};

type MatchTimeProposal = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  startAt: string;
  endAt: string;
};

type TimeProposalDraft = {
  date: string;
  slotId: string;
};

type ChallengePlayerSystemProps = {
  userId: string;
  variant?: 'full' | 'dashboard' | 'ladder';
};

const TOTAL_LADDER_POSITIONS = 50;
const MAX_TIME_PROPOSALS = 3;
const MATCH_TIME_SLOTS = [
  { id: '08:00', label: '8:00 AM - 9:30 AM', startTime: '08:00', endTime: '09:30' },
  { id: '09:30', label: '9:30 AM - 11:00 AM', startTime: '09:30', endTime: '11:00' },
  { id: '11:00', label: '11:00 AM - 12:30 PM', startTime: '11:00', endTime: '12:30' },
  { id: '12:30', label: '12:30 PM - 2:00 PM', startTime: '12:30', endTime: '14:00' },
  { id: '14:00', label: '2:00 PM - 3:30 PM', startTime: '14:00', endTime: '15:30' },
  { id: '15:30', label: '3:30 PM - 5:00 PM', startTime: '15:30', endTime: '17:00' },
  { id: '17:00', label: '5:00 PM - 6:30 PM', startTime: '17:00', endTime: '18:30' },
  { id: '18:30', label: '6:30 PM - 8:00 PM', startTime: '18:30', endTime: '20:00' },
];
const CANCELABLE_MATCH_STATUSES: MatchStatus[] = [
  'pending',
  'accepted',
  'time_proposed',
  'scheduled',
];
const ACTIVE_MATCH_MESSAGE =
  'You already have an active match. Complete or cancel it before starting another.';

function ChallengePlayerSystem({ userId, variant = 'full' }: ChallengePlayerSystemProps) {
  const [currentPlayer, setCurrentPlayer] = useState<RankedPlayer | null>(null);
  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [timeProposalDrafts, setTimeProposalDrafts] = useState<
    Record<string, TimeProposalDraft[]>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [cancelingMatchId, setCancelingMatchId] = useState<string | null>(null);
  const [submittingWinnerId, setSubmittingWinnerId] = useState<string | null>(null);
  const [winnerDrafts, setWinnerDrafts] = useState<Record<string, WinnerDraft>>({});
  const [reschedulingMatchIds, setReschedulingMatchIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [profileStatus, setProfileStatus] = useState<'pending' | 'approved'>('approved');
  const [ladderView, setLadderView] = useState<'pyramid' | 'list'>(() => {
    if (typeof window === 'undefined') {
      return 'pyramid';
    }

    return window.matchMedia('(max-width: 767px)').matches ? 'list' : 'pyramid';
  });
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const isDashboard = variant === 'dashboard';
  const isLadder = variant === 'ladder';
  const cardClass = isDashboard
    ? 'premium-card rounded-[1.5rem] p-4 sm:p-5'
    : 'premium-card rounded-[1.75rem] p-5 sm:p-6';

  useEffect(() => {
    loadChallengeData();
  }, [userId]);

  const playersById = useMemo(() => {
    return new Map(players.map((player) => [player.id, player]));
  }, [players]);

  const activeMatches = useMemo(() => {
    return matches.filter(
      (match) =>
        match.status === 'pending' ||
        match.status === 'accepted' ||
        match.status === 'time_proposed',
    );
  }, [matches]);

  const matchActivityMatches = useMemo(() => {
    return isDashboard
      ? matches.filter(
          (match) =>
            match.status === 'pending' ||
            match.status === 'accepted' ||
            match.status === 'time_proposed',
        )
      : activeMatches;
  }, [activeMatches, isDashboard, matches]);

  const blockingMatches = useMemo(() => {
    return matches.filter(
      (match) =>
        match.status === 'pending' ||
        match.status === 'accepted' ||
        match.status === 'time_proposed' ||
        match.status === 'scheduled',
    );
  }, [matches]);
  const hasActiveMatch = blockingMatches.length > 0;

  const scheduledMatches = useMemo(() => {
    return matches.filter((match) => match.status === 'scheduled');
  }, [matches]);

  const canceledMatches = useMemo(() => {
    return matches.filter((match) => match.status === 'canceled');
  }, [matches]);

  const completedMatches = useMemo(() => {
    return matches.filter((match) => match.status === 'completed');
  }, [matches]);

  const eligiblePlayerIds = useMemo(() => {
    if (!currentPlayer || currentPlayer.rankPosition === 1) {
      return new Set<string>();
    }

    const highestChallengeRank = Math.max(1, currentPlayer.rankPosition - 3);

    return new Set(
      players
        .filter(
          (player) =>
            player.rankPosition < currentPlayer.rankPosition &&
            player.rankPosition >= highestChallengeRank,
        )
        .map((player) => player.id),
    );
  }, [currentPlayer, players]);

  const eligiblePlayers = useMemo(() => {
    return players.filter((player) => eligiblePlayerIds.has(player.id));
  }, [eligiblePlayerIds, players]);

  async function loadChallengeData() {
    setIsLoading(true);
    setErrorMessage('');

    const { data: rankingRows, error: rankingsError } = await supabase
      .from('ladder_rankings')
      .select('player_id, rank_position, wins, losses')
      .order('rank_position', { ascending: true });

    if (rankingsError) {
      setErrorMessage(rankingsError.message);
      setIsLoading(false);
      return;
    }

    const profileIds = Array.from(
      new Set([userId, ...(rankingRows ?? []).map((ranking) => ranking.player_id)]),
    );
    const { data: profileRows, error: profilesError } =
      profileIds.length > 0
        ? await supabase.from('profiles').select('id, full_name, status').in('id', profileIds)
        : { data: [], error: null };

    if (profilesError) {
      setErrorMessage(profilesError.message);
      setIsLoading(false);
      return;
    }

    const profilesById = new Map(
      ((profileRows ?? []) as Profile[]).map((profile) => [profile.id, profile]),
    );
    const currentProfile = profilesById.get(userId);
    setProfileStatus(currentProfile?.status === 'approved' ? 'approved' : 'pending');
    const rankedPlayers = (rankingRows ?? []).map((ranking) => {
      const profile = profilesById.get(ranking.player_id);

      return {
        id: ranking.player_id,
        name: profile?.full_name ?? 'Unnamed player',
        rankPosition: ranking.rank_position,
        wins: ranking.wins ?? 0,
        losses: ranking.losses ?? 0,
      };
    });
    const nextCurrentPlayer = rankedPlayers.find(
      (player) => player.id === userId,
    );

    setCurrentPlayer(nextCurrentPlayer ?? null);
    setPlayers(rankedPlayers);

    if (!nextCurrentPlayer) {
      setMatches([]);
      setIsLoading(false);
      return;
    }

    const { data: matchRows, error: matchesError } = await supabase
      .from('matches')
      .select(
        'id, challenger_id, opponent_id, status, proposed_match_at, proposed_match_options, scheduled_match_ends_at, proposed_by_player_id, challenger_agreed_at, opponent_agreed_at, cancel_reason, canceled_at, canceled_by, winner_id, stats_recorded, ranking_updated, created_at',
      )
      .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (matchesError) {
      setErrorMessage(matchesError.message);
      setIsLoading(false);
      return;
    }

    setMatches(
      ((matchRows ?? []) as Match[]).map((match) => ({
        ...match,
        proposed_match_options: Array.isArray(match.proposed_match_options)
          ? match.proposed_match_options
          : [],
      })),
    );
    setIsLoading(false);
  }

  async function sendChallenge(opponentId: string) {
    if (profileStatus !== 'approved' || !currentPlayer || !eligiblePlayerIds.has(opponentId)) {
      return;
    }

    if (hasActiveMatch) {
      setErrorMessage(ACTIVE_MATCH_MESSAGE);
      return;
    }

    setActionId(opponentId);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase.from('matches').insert({
      challenger_id: currentPlayer.id,
      opponent_id: opponentId,
      status: 'pending',
    });

    setActionId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage('Challenge sent.');
    await loadChallengeData();
  }

  async function updateChallengeStatus(matchId: string, status: 'accepted' | 'declined') {
    if (status === 'accepted' && hasActiveMatchExcluding(matchId)) {
      setErrorMessage(ACTIVE_MATCH_MESSAGE);
      return;
    }

    setActionId(matchId);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase.from('matches').update({ status }).eq('id', matchId);

    setActionId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage(status === 'accepted' ? 'Challenge accepted.' : 'Challenge declined.');
    await loadChallengeData();
  }

  async function proposeMatchTime(match: Match, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentPlayer) {
      return;
    }

    const proposalResult = buildTimeProposals(timeProposalDrafts[match.id] ?? []);

    if (!proposalResult.ok) {
      setErrorMessage(proposalResult.message);
      return;
    }

    if (match.proposed_match_options.length > 0 || match.status === 'scheduled') {
      const confirmed = window.confirm(
        'Replace the previous proposed times with these new options?',
      );

      if (!confirmed) {
        return;
      }
    }

    const isChallenger = match.challenger_id === currentPlayer.id;

    setActionId(match.id);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase
      .from('matches')
      .update({
        status: 'time_proposed',
        proposed_match_at: proposalResult.proposals[0].startAt,
        proposed_match_options: proposalResult.proposals,
        proposed_by_player_id: currentPlayer.id,
        challenger_agreed_at: isChallenger ? new Date().toISOString() : null,
        opponent_agreed_at: isChallenger ? null : new Date().toISOString(),
        scheduled_match_ends_at: null,
      })
      .eq('id', match.id);

    setActionId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setReschedulingMatchIds((current) => {
      const next = new Set(current);
      next.delete(match.id);
      return next;
    });
    setMessage('Match time options sent.');
    await loadChallengeData();
  }

  async function chooseMatchTime(match: Match, proposal: MatchTimeProposal) {
    if (!currentPlayer || !proposal.startAt || !proposal.endAt) {
      return;
    }

    if (match.proposed_by_player_id === currentPlayer.id) {
      setErrorMessage('Waiting for your opponent to choose one of the proposed times.');
      return;
    }

    setActionId(match.id);
    setMessage('');
    setErrorMessage('');

    const { hasOverlap, error: overlapError } = await hasScheduledOverlap(match, proposal);

    if (overlapError) {
      setActionId(null);
      setErrorMessage(overlapError);
      return;
    }

    if (hasOverlap) {
      setActionId(null);
      setErrorMessage('One player already has a match during this time.');
      return;
    }

    const { error } = await supabase
      .from('matches')
      .update({
        status: 'scheduled',
        proposed_match_at: proposal.startAt,
        scheduled_match_ends_at: proposal.endAt,
        challenger_agreed_at: new Date().toISOString(),
        opponent_agreed_at: new Date().toISOString(),
      })
      .eq('id', match.id);

    setActionId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage('Match scheduled. Please call the tennis office to reserve the court.');
    await loadChallengeData();
  }

  async function hasScheduledOverlap(match: Match, proposal: MatchTimeProposal) {
    const { data, error } = await supabase
      .from('matches')
      .select('id, proposed_match_at, scheduled_match_ends_at')
      .eq('status', 'scheduled')
      .neq('id', match.id)
      .or(
        [
          `challenger_id.eq.${match.challenger_id}`,
          `opponent_id.eq.${match.challenger_id}`,
          `challenger_id.eq.${match.opponent_id}`,
          `opponent_id.eq.${match.opponent_id}`,
        ].join(','),
      );

    if (error) {
      return { hasOverlap: false, error: error.message };
    }

    const proposalStart = new Date(proposal.startAt);
    const proposalEnd = new Date(proposal.endAt);

    return {
      hasOverlap: ((data ?? []) as ScheduledMatchSlot[]).some((scheduledMatch) => {
        if (!scheduledMatch.proposed_match_at) {
          return false;
        }

        const scheduledStart = new Date(scheduledMatch.proposed_match_at);
        const scheduledEnd = scheduledMatch.scheduled_match_ends_at
          ? new Date(scheduledMatch.scheduled_match_ends_at)
          : new Date(scheduledStart.getTime() + 90 * 60_000);

        return proposalStart < scheduledEnd && scheduledStart < proposalEnd;
      }),
      error: null,
    };
  }

  async function cancelMatch(match: Match) {
    if (!currentPlayer || !CANCELABLE_MATCH_STATUSES.includes(match.status)) {
      return;
    }

    const confirmed = window.confirm(
      'Cancel this match? This removes it from active challenges and scheduled matches.',
    );

    if (!confirmed) {
      return;
    }

    const cancelReason =
      window.prompt('Optional: add a short cancellation reason.')?.trim() ?? '';

    setActionId(match.id);
    setCancelingMatchId(match.id);
    setMessage('');
    setErrorMessage('');

    const { data, error } = await supabase
      .from('matches')
      .update({
        status: 'canceled',
        cancel_reason: cancelReason || null,
        canceled_at: new Date().toISOString(),
        canceled_by: currentPlayer.id,
      })
      .eq('id', match.id)
      .select('id')
      .maybeSingle();

    setActionId(null);
    setCancelingMatchId(null);

    if (error) {
      console.error('Cancel match Supabase error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      setErrorMessage(formatSupabaseError(error));
      return;
    }

    if (!data) {
      setErrorMessage('This match could not be canceled because its status changed.');
      await loadChallengeData();
      return;
    }

    setMessage('Match canceled.');
    await loadChallengeData();
  }

  function requestReschedule(match: Match) {
    setErrorMessage('');
    setMessage('');
    setReschedulingMatchIds((current) => {
      const next = new Set(current);
      next.add(match.id);
      return next;
    });
  }

  function cancelReschedule(matchId: string) {
    setErrorMessage('');
    setReschedulingMatchIds((current) => {
      const next = new Set(current);
      next.delete(matchId);
      return next;
    });
  }

  async function submitWinner(match: Match, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentPlayer || match.status !== 'scheduled') {
      return;
    }

    const winnerDraft = winnerDrafts[match.id] ?? { winnerId: '' };
    const validWinnerIds = new Set([match.challenger_id, match.opponent_id]);

    if (!validWinnerIds.has(winnerDraft.winnerId)) {
      setErrorMessage('Choose who won the match before submitting.');
      return;
    }

    const winnerName = getPlayerName(winnerDraft.winnerId, currentPlayer, playersById);
    const confirmed = window.confirm(
      `Complete match and update ladder?\n\nWinner: ${winnerName}`,
    );

    if (!confirmed) {
      return;
    }

    setActionId(match.id);
    setSubmittingWinnerId(match.id);
    setMessage('');
    setErrorMessage('');

    const { data, error } = await supabase
      .from('matches')
      .update({
        winner_id: winnerDraft.winnerId,
        score: null,
        status: 'completed',
      })
      .eq('id', match.id)
      .select('id, winner_id, status, stats_recorded, ranking_updated')
      .maybeSingle();

    setActionId(null);
    setSubmittingWinnerId(null);

    if (error) {
      console.error('Submit winner Supabase error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      setErrorMessage(formatSupabaseError(error));
      return;
    }

    if (!data) {
      setErrorMessage('Winner could not be submitted because the match was not found.');
      await loadChallengeData();
      return;
    }

    if (!data.stats_recorded) {
      console.error('Winner submitted but stats were not recorded:', {
        matchId: match.id,
        challengerId: match.challenger_id,
        opponentId: match.opponent_id,
        winnerId: winnerDraft.winnerId,
        returnedMatch: data,
      });
      setErrorMessage(
        'Winner was saved, but wins/losses were not recorded. Check the Supabase stats trigger.',
      );
      await loadChallengeData();
      return;
    }

    if (!data.ranking_updated) {
      console.error('Winner submitted but ranking movement was not checked:', {
        matchId: match.id,
        challengerId: match.challenger_id,
        opponentId: match.opponent_id,
        winnerId: winnerDraft.winnerId,
        returnedMatch: data,
      });
      setErrorMessage(
        'Winner and records were saved, but ranking movement was not checked. Check the Supabase ranking trigger.',
      );
      await loadChallengeData();
      return;
    }

    setWinnerDrafts((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[match.id];
      return nextDrafts;
    });
    setMessage(`Winner submitted: ${winnerName}. Records updated and ladder movement checked.`);
    await loadChallengeData();
  }

  function updateWinnerDraft(matchId: string, nextDraft: Partial<WinnerDraft>) {
    setWinnerDrafts((current) => ({
      ...current,
      [matchId]: {
        winnerId: current[matchId]?.winnerId ?? '',
        ...nextDraft,
      },
    }));
  }

  function updateTimeProposalDraft(
    matchId: string,
    index: number,
    nextDraft: Partial<TimeProposalDraft>,
  ) {
    setTimeProposalDrafts((current) => {
      const existingDrafts = current[matchId] ?? getDefaultTimeProposalDrafts();
      const nextDrafts = existingDrafts.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, ...nextDraft } : draft,
      );

      return {
        ...current,
        [matchId]: nextDrafts,
      };
    });
  }

  function getBlockingMatchWith(playerId: string) {
    if (!currentPlayer) {
      return undefined;
    }

    return blockingMatches.find((match) => {
      const samePair =
        (match.challenger_id === currentPlayer.id && match.opponent_id === playerId) ||
        (match.challenger_id === playerId && match.opponent_id === currentPlayer.id);

      return samePair;
    });
  }

  function hasActiveMatchExcluding(matchId: string) {
    return blockingMatches.some((match) => match.id !== matchId);
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-line-200 bg-white px-5 py-4 text-sm font-medium text-ink-700 shadow-sm">
        Loading ladder challenge details...
      </div>
    );
  }

  if (profileStatus === 'pending') {
    return (
      <section className="rounded-[2rem] border border-line-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-black uppercase tracking-[0.14em] text-court-700">
          Registration Pending
        </p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-ink-900">
          Your registration is pending admin approval.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-700">
          You cannot challenge players or join the ladder until an admin approves
          your account and assigns your starting rank.
        </p>
        {isLadder && (
          <div className="mt-6">
            <FullLadderSection
              actionId={actionId}
              currentPlayer={null}
              eligiblePlayerIds={new Set<string>()}
              getBlockingMatchWith={getBlockingMatchWith}
              onChallenge={sendChallenge}
              players={players}
              showActions={false}
              showTable={false}
            />
          </div>
        )}
      </section>
    );
  }

  if (!currentPlayer) {
    return (
      <div className={isDashboard ? 'grid gap-4 lg:grid-cols-2' : 'space-y-6'}>
        {(message || errorMessage) && (
          <div
            className={`whitespace-pre-line rounded-2xl border px-5 py-4 text-sm font-medium shadow-sm ${
              errorMessage
                ? 'border-red-300 bg-red-50 text-red-700'
                : 'border-court-500 bg-court-100 text-court-700'
            } ${isDashboard ? 'lg:col-span-2' : ''}`}
            role={errorMessage ? 'alert' : 'status'}
          >
            {errorMessage || message}
          </div>
        )}

        <section className={cardClass}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-court-900 text-lime-300">
                <TrophyIcon />
              </div>
              <div>
                <p className="text-sm font-bold uppercase text-court-700">
                  Ladder Access
                </p>
                <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink-900">
                  You are not ranked yet.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-700">
                  An admin must approve your registration and assign your starting
                  rank before you can challenge players.
                </p>
              </div>
            </div>
          </div>
        </section>

        {isLadder && (
          <FullLadderSection
            actionId={actionId}
            currentPlayer={null}
            eligiblePlayerIds={eligiblePlayerIds}
            getBlockingMatchWith={getBlockingMatchWith}
            onChallenge={sendChallenge}
            players={players}
            showActions={false}
            showTable={false}
          />
        )}

        {!isDashboard && !isLadder && (
          <FullLadderSection
            currentPlayer={null}
            eligiblePlayerIds={eligiblePlayerIds}
            onChallenge={sendChallenge}
            players={players}
            getBlockingMatchWith={getBlockingMatchWith}
            actionId={actionId}
          />
        )}
      </div>
    );
  }

  if (isLadder) {
    return (
      <div className="space-y-4 sm:space-y-5">
        {(message || errorMessage) && (
          <div
            className={`whitespace-pre-line rounded-2xl border px-5 py-4 text-sm font-medium shadow-sm ${
              errorMessage
                ? 'border-red-300 bg-red-50 text-red-700'
                : 'border-court-500 bg-court-100 text-court-700'
            }`}
            role={errorMessage ? 'alert' : 'status'}
          >
            {errorMessage || message}
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-2xl border border-line-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="px-2 text-sm font-bold text-ink-700">
            Choose how you want to scan the ladder.
          </p>
          <div className="grid grid-cols-2 rounded-full bg-court-100 p-1">
            <button
              className={`rounded-full px-4 py-2 text-sm font-extrabold ${
                ladderView === 'pyramid'
                  ? 'bg-court-900 text-white'
                  : 'text-court-700 hover:bg-court-50'
              }`}
              type="button"
              onClick={() => setLadderView('pyramid')}
            >
              Pyramid View
            </button>
            <button
              className={`rounded-full px-4 py-2 text-sm font-extrabold ${
                ladderView === 'list'
                  ? 'bg-court-900 text-white'
                  : 'text-court-700 hover:bg-court-50'
              }`}
              type="button"
              onClick={() => setLadderView('list')}
            >
              List View
            </button>
          </div>
        </div>

        {ladderView === 'pyramid' ? (
          <FullLadderSection
            actionId={actionId}
            currentPlayer={currentPlayer}
            eligiblePlayerIds={eligiblePlayerIds}
            getBlockingMatchWith={getBlockingMatchWith}
            onChallenge={sendChallenge}
            players={players}
            showActions={false}
            showTable={false}
          />
        ) : (
          <LadderListView currentPlayer={currentPlayer} players={players} />
        )}
      </div>
    );
  }

  return (
    <div className={isDashboard ? 'grid gap-4 lg:grid-cols-2' : 'space-y-6'}>
      {(message || errorMessage) && (
        <div
          className={`whitespace-pre-line rounded-2xl border px-5 py-4 text-sm font-medium shadow-sm ${
            errorMessage
              ? 'border-red-300 bg-red-50 text-red-700'
              : 'border-court-500 bg-court-100 text-court-700'
          } ${isDashboard ? 'lg:col-span-2' : ''}`}
          role={errorMessage ? 'alert' : 'status'}
        >
          {errorMessage || message}
        </div>
      )}

      <section className={cardClass}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-court-900 text-lime-300">
              <TrophyIcon />
            </div>
            <div>
              <p className="text-sm font-bold uppercase text-court-700">My Ranking</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
                #{currentPlayer.rankPosition} {currentPlayer.name}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-700">
                You can challenge up to 3 spots above your rank.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <RecordPill label="Wins" value={currentPlayer.wins} />
                <RecordPill label="Losses" value={currentPlayer.losses} />
                <RecordPill label="Record" value={getRecord(currentPlayer)} />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-court-500 bg-court-900 px-4 py-3 text-white shadow-sm">
            <p className="text-xs font-bold uppercase">Current Rank</p>
            <p className="mt-1 text-3xl font-bold tracking-tight">
              #{currentPlayer.rankPosition}
            </p>
          </div>
        </div>
      </section>

      {isDashboard && (
        <section className={cardClass}>
          <SectionHeader
            icon={<PhoneIcon />}
            title="Court Reservations"
            description="Use this contact when your match time is scheduled and ready to reserve."
          />
          <CourtReservationsCard className="mt-5" />
        </section>
      )}

      {!isDashboard && (
        <FullLadderSection
          currentPlayer={currentPlayer}
          eligiblePlayerIds={eligiblePlayerIds}
          onChallenge={sendChallenge}
          players={players}
          getBlockingMatchWith={getBlockingMatchWith}
          actionId={actionId}
        />
      )}

      <section className={cardClass}>
        <SectionHeader
          icon={<TargetIcon />}
          title="Eligible Players to Challenge"
          description={
            hasActiveMatch
              ? ACTIVE_MATCH_MESSAGE
              : currentPlayer.rankPosition === 1
                ? 'Rank 1 cannot challenge anyone.'
                : 'Only players ranked up to 3 spots above you are available.'
          }
        />
        {hasActiveMatch && (
          <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-court-900">
            {ACTIVE_MATCH_MESSAGE}
          </p>
        )}
        {eligiblePlayers.length === 0 ? (
          <EmptyState message="No eligible players to challenge right now." />
        ) : (
          <div className="mt-5 grid gap-3">
            {eligiblePlayers.map((player) => {
              const blockingMatch = getBlockingMatchWith(player.id);

              return (
                <div
                  className="flex flex-col gap-3 rounded-xl border border-line-200 bg-white px-4 py-3 shadow-sm transition hover:border-court-500 sm:flex-row sm:items-center sm:justify-between"
                  key={player.id}
                >
                  <div>
                    <p className="text-sm font-bold text-ink-900">
                      #{player.rankPosition} {player.name}
                    </p>
                    <p className="mt-1 text-sm text-ink-700">
                      {currentPlayer.rankPosition - player.rankPosition} spot
                      {currentPlayer.rankPosition - player.rankPosition === 1 ? '' : 's'} above you
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink-700">
                      Record {player.wins}-{player.losses}
                    </p>
                  </div>
                  {blockingMatch ? (
                    <StatusBadge label={getStatusLabel(blockingMatch)} />
                  ) : hasActiveMatch ? (
                    <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-court-900">
                      Finish active match first
                    </span>
                  ) : (
                    <button
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-court-900 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-court-700 disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      onClick={() => sendChallenge(player.id)}
                      disabled={actionId === player.id}
                    >
                      <ChallengeIcon />
                      {actionId === player.id ? 'Sending...' : 'Challenge'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className={cardClass} id="match-activity">
        <SectionHeader
          icon={<MatchIcon />}
          title={isDashboard ? 'Match Activity' : 'My Active Challenges'}
          description="Pending challenges, accepted matches, time proposals, and waiting states."
        />
        {matchActivityMatches.length === 0 ? (
          <EmptyState message="No match activity yet." />
        ) : (
          <div className="mt-5 space-y-4">
            {matchActivityMatches.map((match) => (
              <ChallengeCard
                actionId={actionId}
                cancelingMatchId={cancelingMatchId}
                currentPlayer={currentPlayer}
                hasOtherActiveMatch={hasActiveMatchExcluding(match.id)}
                key={match.id}
                match={match}
                playersById={playersById}
                proposalDrafts={timeProposalDrafts[match.id] ?? getDefaultTimeProposalDrafts()}
                onAccept={() => updateChallengeStatus(match.id, 'accepted')}
                onDecline={() => updateChallengeStatus(match.id, 'declined')}
                onPropose={(event) => proposeMatchTime(match, event)}
                onChooseTime={(proposal) => chooseMatchTime(match, proposal)}
                onCancel={() => cancelMatch(match)}
                onProposalChange={(index, nextDraft) =>
                  updateTimeProposalDraft(match.id, index, nextDraft)
                }
              />
            ))}
          </div>
        )}
      </section>

      <ScheduledMatchesSection
        actionId={actionId}
        cancelingMatchId={cancelingMatchId}
        currentPlayer={currentPlayer}
        matches={scheduledMatches}
        playersById={playersById}
        proposalDraftsByMatchId={timeProposalDrafts}
        reschedulingMatchIds={reschedulingMatchIds}
        winnerDrafts={winnerDrafts}
        sectionClass={cardClass}
        submittingWinnerId={submittingWinnerId}
        onCancelReschedule={cancelReschedule}
        onCancel={cancelMatch}
        onProposalChange={updateTimeProposalDraft}
        onProposeTime={proposeMatchTime}
        onRequestReschedule={requestReschedule}
        onSubmitWinner={submitWinner}
        onWinnerChange={updateWinnerDraft}
      />

      <CompletedMatchesSection
        currentPlayer={currentPlayer}
        matches={completedMatches}
        playersById={playersById}
        sectionClass={cardClass}
      />

      {!isDashboard && (
        <section className={cardClass}>
          <SectionHeader
            icon={<XIcon />}
            title="Canceled Matches"
            description="Canceled matches are kept here for reference and no longer block new challenges."
          />
          {canceledMatches.length === 0 ? (
            <EmptyState message="No canceled matches." />
          ) : (
            <div className="mt-5 space-y-4">
              {canceledMatches.map((match) => (
                <div
                  className="rounded-lg border border-line-200 bg-white p-5 text-ink-700 shadow-sm"
                  key={match.id}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-bold text-ink-900">
                        {getMatchTitle(match, currentPlayer, playersById)}
                      </p>
                      <p className="mt-1 text-sm">
                        Previous time: {formatDisplayDate(match.proposed_match_at)}
                      </p>
                      <p className="mt-1 text-sm">
                        Canceled {formatDisplayDate(match.canceled_at)} by{' '}
                        {getCancelingPlayerName(match, currentPlayer, playersById)}.
                      </p>
                      {match.cancel_reason && (
                        <p className="mt-2 rounded-lg bg-court-50 px-3 py-2 text-sm">
                          Reason: {match.cancel_reason}
                        </p>
                      )}
                    </div>
                    <StatusBadge label="Canceled" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

type ChallengeCardProps = {
  actionId: string | null;
  cancelingMatchId: string | null;
  currentPlayer: RankedPlayer;
  hasOtherActiveMatch: boolean;
  match: Match;
  playersById: Map<string, RankedPlayer>;
  proposalDrafts: TimeProposalDraft[];
  onAccept: () => void;
  onDecline: () => void;
  onPropose: (event: FormEvent<HTMLFormElement>) => void;
  onChooseTime: (proposal: MatchTimeProposal) => void;
  onCancel: () => void;
  onProposalChange: (index: number, nextDraft: Partial<TimeProposalDraft>) => void;
};

type ScheduledMatchesSectionProps = {
  actionId: string | null;
  cancelingMatchId: string | null;
  currentPlayer: RankedPlayer;
  matches: Match[];
  playersById: Map<string, RankedPlayer>;
  proposalDraftsByMatchId: Record<string, TimeProposalDraft[]>;
  reschedulingMatchIds: Set<string>;
  sectionClass: string;
  submittingWinnerId: string | null;
  winnerDrafts: Record<string, WinnerDraft>;
  onCancelReschedule: (matchId: string) => void;
  onCancel: (match: Match) => void;
  onProposalChange: (
    matchId: string,
    index: number,
    nextDraft: Partial<TimeProposalDraft>,
  ) => void;
  onProposeTime: (match: Match, event: FormEvent<HTMLFormElement>) => void;
  onRequestReschedule: (match: Match) => void;
  onSubmitWinner: (match: Match, event: FormEvent<HTMLFormElement>) => void;
  onWinnerChange: (matchId: string, nextDraft: Partial<WinnerDraft>) => void;
};

function ScheduledMatchesSection({
  actionId,
  cancelingMatchId,
  currentPlayer,
  matches,
  playersById,
  proposalDraftsByMatchId,
  reschedulingMatchIds,
  sectionClass,
  submittingWinnerId,
  winnerDrafts,
  onCancelReschedule,
  onCancel,
  onProposalChange,
  onProposeTime,
  onRequestReschedule,
  onSubmitWinner,
  onWinnerChange,
}: ScheduledMatchesSectionProps) {
  return (
    <section className={sectionClass} id="scheduled-matches">
      <SectionHeader
        icon={<CalendarIcon />}
        title="Scheduled Matches"
        description="These match times have been agreed by both players."
      />
      {matches.length === 0 ? (
        <EmptyState message="No scheduled matches yet." />
      ) : (
        <div className="mt-5 space-y-3">
          {matches.map((match) => (
            <div
              className="rounded-2xl border border-line-200 bg-white p-4 shadow-sm sm:p-5"
              key={match.id}
            >
              {(() => {
                const isRequestingNewTimes = reschedulingMatchIds.has(match.id);

                return (
                  <>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-court-700">
                    Opponent
                  </p>
                  <h3 className="mt-1 text-lg font-black text-ink-900">
                    {getOpponentName(match, currentPlayer, playersById)}
                  </h3>
                  <p className="mt-2 text-sm font-semibold text-ink-700">
                    Agreed date/time:{' '}
                    <span className="text-ink-900">
                      {formatScheduledMatchTime(match)}
                    </span>
                  </p>
                </div>
                <StatusBadge label="Scheduled" />
              </div>
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-court-700">
                  Final Scheduled Time
                </p>
                <p className="mt-1 text-base font-black text-ink-900">
                  {formatScheduledMatchTime(match)}
                </p>
                <p className="mt-2 text-sm font-bold text-court-900">
                  Please call the tennis office to reserve the court.
                </p>
                <CourtReservationsCard className="mt-3 bg-white/80" />
              </div>
              <ProposalSummary
                isTimeProposer={false}
                match={match}
                onChooseTime={undefined}
                opponentName={getOpponentName(match, currentPlayer, playersById)}
                showActions={false}
              />
              {isRequestingNewTimes && (
                <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-ink-900">New times requested</p>
                      <p className="mt-1 text-sm text-ink-700">
                        The scheduled time stays visible until you submit replacement options.
                      </p>
                    </div>
                    <button
                      className="inline-flex items-center justify-center rounded-full border border-line-200 bg-white px-4 py-2 text-sm font-bold text-court-900 shadow-sm transition hover:border-court-500 hover:bg-court-50"
                      type="button"
                      onClick={() => onCancelReschedule(match.id)}
                    >
                      Back to Proposed Times
                    </button>
                  </div>
                  <TimeProposalForm
                    actionId={actionId}
                    match={match}
                    proposalDrafts={
                      proposalDraftsByMatchId[match.id] ?? getDefaultTimeProposalDrafts()
                    }
                    onProposalChange={onProposalChange}
                    onPropose={onProposeTime}
                  />
                </div>
              )}
              <form
                className="mt-4 rounded-xl border border-line-200 bg-white p-4"
                onSubmit={(event) => onSubmitWinner(match, event)}
              >
                <p className="text-sm font-black text-ink-900">Who won the match?</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {[match.challenger_id, match.opponent_id].map((playerId) => {
                    const isSelected = winnerDrafts[match.id]?.winnerId === playerId;
                    const playerName = getPlayerName(playerId, currentPlayer, playersById);

                    return (
                      <button
                        className={`rounded-2xl border px-4 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          isSelected
                            ? 'border-blue-300 bg-blue-50 shadow-sm ring-2 ring-blue-100'
                            : 'border-line-200 bg-white hover:border-court-500 hover:bg-court-50'
                        }`}
                        key={playerId}
                        type="button"
                        onClick={() => onWinnerChange(match.id, { winnerId: playerId })}
                        disabled={submittingWinnerId === match.id || actionId === match.id}
                      >
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-court-700">
                          Winner
                        </p>
                        <p className="mt-1 text-base font-black text-ink-900">
                          {playerName}
                        </p>
                        {isSelected && (
                          <p className="mt-2 text-xs font-bold text-court-700">
                            Selected
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3">
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-court-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-court-700 disabled:cursor-not-allowed disabled:opacity-60"
                    type="submit"
                    disabled={
                      submittingWinnerId === match.id ||
                      actionId === match.id ||
                      !winnerDrafts[match.id]?.winnerId
                    }
                  >
                    <CheckIcon />
                    {submittingWinnerId === match.id ? 'Submitting...' : 'Submit Winner'}
                  </button>
                </div>
              </form>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-line-200 bg-white px-4 py-2.5 text-sm font-bold text-court-900 shadow-sm transition hover:border-court-500 hover:bg-court-50 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={() => onRequestReschedule(match)}
                  disabled={actionId === match.id || isRequestingNewTimes}
                >
                  <ClockIcon />
                  Request New Times
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-red-300 bg-white px-4 py-2.5 text-sm font-bold text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={() => onCancel(match)}
                  disabled={cancelingMatchId === match.id || actionId === match.id}
                >
                  <XIcon />
                  {cancelingMatchId === match.id ? 'Canceling...' : 'Cancel Match'}
                </button>
              </div>
                  </>
                );
              })()}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CompletedMatchesSection({
  currentPlayer,
  matches,
  playersById,
  sectionClass,
}: {
  currentPlayer: RankedPlayer;
  matches: Match[];
  playersById: Map<string, RankedPlayer>;
  sectionClass: string;
}) {
  return (
    <section className={sectionClass}>
      <SectionHeader
        icon={<CheckIcon />}
        title="Completed Matches"
        description="Final winners are shown here after wins, losses, and ladder movement are recorded."
      />
      {matches.length === 0 ? (
        <EmptyState message="No completed matches yet." />
      ) : (
        <div className="mt-5 space-y-3">
          {matches.map((match) => (
            <article
              className="rounded-lg border border-line-200 bg-white p-5 shadow-sm"
              key={match.id}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-bold text-ink-900">
                    {getMatchTitle(match, currentPlayer, playersById)}
                  </h3>
                  <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-court-900">
                    Winner: {getPlayerName(match.winner_id, currentPlayer, playersById)}
                  </p>
                </div>
                <StatusBadge label="Completed" />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function LadderListView({
  currentPlayer,
  players,
}: {
  currentPlayer: RankedPlayer | null;
  players: RankedPlayer[];
}) {
  const spots = useMemo(() => {
    const playerByRank = new Map(players.map((player) => [player.rankPosition, player]));

    return Array.from({ length: TOTAL_LADDER_POSITIONS }, (_, index) => {
      const rankPosition = index + 1;

      return {
        rankPosition,
        player: playerByRank.get(rankPosition) ?? null,
      };
    });
  }, [players]);

  return (
    <section className="rounded-2xl border border-line-200 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight text-ink-900 sm:text-2xl">
            List View
          </h2>
          <p className="mt-1 text-sm leading-5 text-ink-700">
            Ranks 1-50 in a compact, performance-first layout.
          </p>
        </div>
        <span className="w-fit rounded-full border border-line-200 bg-white px-3 py-1.5 text-xs font-black text-court-700">
          {players.length}/{TOTAL_LADDER_POSITIONS} filled
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-line-200">
        <div className="hidden grid-cols-[4.5rem_1fr_4.5rem_4.5rem_6rem] border-b border-line-200 bg-court-900 px-3 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-white sm:grid">
          <span>Rank</span>
          <span>Player</span>
          <span>Wins</span>
          <span>Losses</span>
          <span>Record</span>
        </div>
        <div className="divide-y divide-line-200 bg-white">
          {spots.map(({ rankPosition, player }) => (
            <LadderListRow
              currentPlayerId={currentPlayer?.id ?? null}
              key={rankPosition}
              player={player}
              rankPosition={rankPosition}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

const LadderListRow = memo(function LadderListRow({
  currentPlayerId,
  player,
  rankPosition,
}: {
  currentPlayerId: string | null;
  player: RankedPlayer | null;
  rankPosition: number;
}) {
  const isCurrentPlayer = currentPlayerId === player?.id;

  return (
    <div
      className={`grid gap-2 px-3 py-2.5 [contain:layout_paint_style] sm:grid-cols-[4.5rem_1fr_4.5rem_4.5rem_6rem] sm:items-center ${
        isCurrentPlayer
          ? 'bg-lime-50'
          : player
            ? 'bg-white'
            : 'bg-slate-50 text-ink-700'
      }`}
    >
      <div className="flex items-center justify-between gap-3 sm:block">
        <span className="text-xs font-black uppercase text-ink-700 sm:hidden">
          Rank
        </span>
        <span className="font-black text-court-900">#{rankPosition}</span>
      </div>
      <div>
        {player ? (
          <p className="truncate font-bold text-ink-900">
            {player.name}
            {isCurrentPlayer && (
              <span className="ml-2 rounded-full bg-lime-300 px-2 py-0.5 text-xs font-black text-white">
                You
              </span>
            )}
          </p>
        ) : (
          <p className="font-bold text-ink-700">Open Spot</p>
        )}
      </div>
      <StatCell label="Wins" value={player?.wins ?? '-'} />
      <StatCell label="Losses" value={player?.losses ?? '-'} />
      <StatCell label="Record" value={player ? getRecord(player) : '-'} />
    </div>
  );
});

function RecordPill({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line-200 bg-white px-3 py-1.5 text-xs font-black text-court-900">
      <span className="uppercase text-ink-700">{label}</span>
      <span>{value}</span>
    </span>
  );
}

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-court-100 text-court-700">
        {icon}
      </div>
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-ink-900">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-700">{description}</p>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="mt-5 rounded-lg border border-dashed border-line-200 bg-court-50 px-5 py-6 text-center text-sm font-medium text-ink-700">
      {message}
    </div>
  );
}

function CourtReservationsCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-line-200 bg-white px-4 py-3 text-sm shadow-sm ${className}`}
    >
      <p className="font-black uppercase tracking-[0.14em] text-court-700">
        Court Reservations
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <a
          className="inline-flex items-center gap-2 rounded-xl border border-line-200 bg-white px-3 py-2 font-bold text-court-900 transition hover:border-court-500 hover:bg-court-50"
          href="mailto:tenis@rotonpoint.org"
        >
          <MailIcon />
          tenis@rotonpoint.org
        </a>
        <a
          className="inline-flex items-center gap-2 rounded-xl border border-line-200 bg-white px-3 py-2 font-bold text-court-900 transition hover:border-court-500 hover:bg-court-50"
          href="tel:2038381606"
        >
          <PhoneIcon />
          203-838-1606 ext. 101
        </a>
      </div>
    </div>
  );
}

type FullLadderSectionProps = {
  actionId: string | null;
  currentPlayer: RankedPlayer | null;
  eligiblePlayerIds: Set<string>;
  players: RankedPlayer[];
  getBlockingMatchWith: (playerId: string) => Match | undefined;
  onChallenge: (playerId: string) => void;
  showActions?: boolean;
  showTable?: boolean;
};

function FullLadderSection({
  actionId,
  currentPlayer,
  eligiblePlayerIds,
  players,
  getBlockingMatchWith,
  onChallenge,
  showActions = true,
  showTable = true,
}: FullLadderSectionProps) {
  return (
    <section className={showTable ? 'premium-card rounded-3xl p-8 sm:p-10' : ''}>
      {showTable && (
        <SectionHeader
          icon={<LadderIcon />}
          title="Full Ladder View"
          description="A 50-position pyramid ladder with open spots shown for future players."
        />
      )}
      <div className={showTable ? 'mt-5 space-y-8' : 'space-y-0'}>
        <PyramidLadder
          actionId={actionId}
          currentPlayer={currentPlayer}
          eligiblePlayerIds={eligiblePlayerIds}
          getBlockingMatchWith={getBlockingMatchWith}
          onChallenge={onChallenge}
          players={players}
          showActions={showActions}
        />
        {showTable && (
          <NormalLadderTable
            actionId={actionId}
            currentPlayer={currentPlayer}
            eligiblePlayerIds={eligiblePlayerIds}
            getBlockingMatchWith={getBlockingMatchWith}
            onChallenge={onChallenge}
            players={players}
            showActions={showActions}
          />
        )}
      </div>
    </section>
  );
}

function PyramidLadder({
  actionId,
  currentPlayer,
  eligiblePlayerIds,
  players,
  getBlockingMatchWith,
  onChallenge,
  showActions = true,
}: FullLadderSectionProps) {
  const rows = getPyramidRows(players);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const cardWidth = `${10 * zoom}rem`;
  const cardMinHeight = `${10.5 * zoom}rem`;
  const rowGap = `${1.25 * zoom}rem`;
  const cardGap = `${0.75 * zoom}rem`;

  function zoomIn() {
    setZoom((current) => Math.min(1.45, Number((current + 0.1).toFixed(2))));
  }

  function zoomOut() {
    setZoom((current) => Math.max(0.8, Number((current - 0.1).toFixed(2))));
  }

  function resetZoom() {
    setZoom(1);
  }

  function centerOnMyPosition() {
    const container = scrollContainerRef.current;
    const currentCard = container?.querySelector<HTMLElement>('[data-current-player="true"]');

    if (!container || !currentCard) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const cardRect = currentCard.getBoundingClientRect();
    const cardCenterX =
      cardRect.left - containerRect.left + container.scrollLeft + cardRect.width / 2;
    const cardCenterY =
      cardRect.top - containerRect.top + container.scrollTop + cardRect.height / 2;

    container.scrollTo({
      left: Math.max(0, cardCenterX - container.clientWidth / 2),
      top: Math.max(0, cardCenterY - container.clientHeight / 2),
      behavior: 'smooth',
    });
  }

  return (
    <div className="ladder-pyramid-panel overflow-hidden rounded-[2rem] border border-line-200 p-3 shadow-xl shadow-court-900/10 sm:p-5">
      <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h3 className="text-xl font-black tracking-tight text-ink-900 sm:text-2xl">
            Pyramid Ladder
          </h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-700">
            All 50 ladder positions are shown. Open spots are ready for the next players who join.
          </p>
        </div>
        <div className="w-fit rounded-full border border-line-200 bg-white px-4 py-2 text-sm font-black text-court-900 shadow-sm">
          {players.length}/{TOTAL_LADDER_POSITIONS} filled
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          className="rounded-full bg-white px-4 py-2 text-sm font-extrabold text-court-900 shadow-sm transition hover:bg-court-100"
          type="button"
          onClick={zoomOut}
        >
          Zoom Out
        </button>
        <button
          className="rounded-full bg-white px-4 py-2 text-sm font-extrabold text-court-900 shadow-sm transition hover:bg-court-100"
          type="button"
          onClick={zoomIn}
        >
          Zoom In
        </button>
        <button
          className="rounded-full border border-line-200 bg-white px-4 py-2 text-sm font-extrabold text-court-900 shadow-sm transition hover:border-court-500 hover:bg-court-50"
          type="button"
          onClick={resetZoom}
        >
          Reset Zoom
        </button>
        <button
          className="rounded-full border border-line-200 bg-white px-4 py-2 text-sm font-extrabold text-court-900 shadow-sm transition hover:border-court-500 hover:bg-court-50 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={centerOnMyPosition}
          disabled={!currentPlayer}
        >
          Center on My Position
        </button>
        <span className="rounded-full border border-line-200 bg-white px-4 py-2 text-sm font-bold text-ink-700 shadow-sm">
          {Math.round(zoom * 100)}%
        </span>
      </div>
      <div
        className="h-[70svh] overflow-auto overscroll-contain rounded-[1.6rem] border border-line-200 bg-white/70 px-3 py-5 shadow-inner scroll-smooth [-webkit-overflow-scrolling:touch] sm:px-5 sm:py-6 lg:px-6"
        ref={scrollContainerRef}
      >
        <div
          className="mx-auto flex w-max min-w-full flex-col items-center px-2 pb-8"
          style={{ gap: rowGap }}
        >
          {rows.map((row, rowIndex) => (
            <div
              className="flex w-max justify-center"
              style={{ gap: cardGap }}
              key={rowIndex}
            >
              {row.map((spot) => (
                <PyramidPlayerCard
                  actionId={actionId}
                  blockingMatch={
                    spot.player ? getBlockingMatchWith(spot.player.id) : undefined
                  }
                  cardMinHeight={cardMinHeight}
                  cardWidth={cardWidth}
                  currentPlayer={currentPlayer}
                  isEligible={spot.player ? eligiblePlayerIds.has(spot.player.id) : false}
                  key={spot.rankPosition}
                  onChallenge={onChallenge}
                  showActions={showActions}
                  spot={spot}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PyramidPlayerCard({
  actionId,
  blockingMatch,
  cardMinHeight,
  cardWidth,
  currentPlayer,
  isEligible,
  onChallenge,
  showActions,
  spot,
}: {
  actionId: string | null;
  blockingMatch: Match | undefined;
  cardMinHeight: string;
  cardWidth: string;
  currentPlayer: RankedPlayer | null;
  isEligible: boolean;
  onChallenge: (playerId: string) => void;
  showActions: boolean;
  spot: PyramidSpot;
}) {
  const player = spot.player;

  if (!player) {
    return (
      <article
        className="flex shrink-0 flex-col justify-between rounded-2xl border border-dashed border-white/30 bg-white/50 p-4 text-center shadow-sm opacity-80 transition"
        style={{ minHeight: cardMinHeight, width: cardWidth }}
      >
        <p className="text-xs font-black uppercase tracking-[0.14em] text-court-700">
          Rank #{spot.rankPosition}
        </p>
        <h4 className="mt-2 text-base font-bold leading-tight text-ink-700">
          Open Spot
        </h4>
        <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-xs font-semibold text-ink-700">
          Available
        </p>
      </article>
    );
  }

  const isCurrentPlayer = currentPlayer?.id === player.id;

  return (
    <article
      className={`rounded-2xl border p-4 shadow-lg transition duration-200 ${
        isCurrentPlayer
          ? 'border-lime-300 bg-white ring-4 ring-lime-300/35'
          : 'border-white/70 bg-white hover:-translate-y-1 hover:border-lime-300 hover:shadow-2xl'
      } flex shrink-0 flex-col justify-between`}
      data-current-player={isCurrentPlayer ? 'true' : undefined}
      style={{ minHeight: cardMinHeight, width: cardWidth }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-court-700">
            Rank #{player.rankPosition}
          </p>
          <h4 className="mt-1 text-base font-bold leading-tight text-ink-900">
            {player.name}
          </h4>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {isCurrentPlayer && (
            <span className="rounded-full bg-lime-300 px-2.5 py-1 text-xs font-black text-white">
              You
            </span>
          )}
          {showActions && !isCurrentPlayer && isEligible && (
            <span className="rounded-full border border-lime-300 bg-lime-50 px-2.5 py-1 text-xs font-black text-lime-300">
              Eligible
            </span>
          )}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
        <div className="rounded-lg bg-court-100 px-3 py-2">
          <p className="text-xs font-bold uppercase text-court-700">Record</p>
          <p className="font-bold text-ink-900">{getRecord(player)}</p>
        </div>
      </div>
      <div className="mt-4">
        {isCurrentPlayer && (
          <p className="rounded-full bg-court-900 px-3 py-2.5 text-center text-sm font-extrabold text-white">
            Your position
          </p>
        )}
        {showActions && !isCurrentPlayer && isEligible && !blockingMatch && (
          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-court-900 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-court-700 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => onChallenge(player.id)}
            disabled={actionId === player.id}
          >
            <ChallengeIcon />
            {actionId === player.id ? 'Sending...' : 'Challenge'}
          </button>
        )}
        {showActions && !isCurrentPlayer && isEligible && blockingMatch && (
          <StatusBadge label={getStatusLabel(blockingMatch)} />
        )}
        {showActions && !isEligible && !isCurrentPlayer && (
          <p className="rounded-md bg-court-100 px-3 py-2 text-center text-sm font-bold text-court-700">
            Outside challenge range
          </p>
        )}
      </div>
    </article>
  );
}

function NormalLadderTable({
  actionId,
  currentPlayer,
  eligiblePlayerIds,
  players,
  getBlockingMatchWith,
  onChallenge,
}: FullLadderSectionProps) {
  return (
    <div>
      <h3 className="text-xl font-bold tracking-tight text-ink-900">
        Ranking Table
      </h3>
      {players.length === 0 ? (
        <EmptyState message="No players have joined the ladder yet." />
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border border-line-200">
          <div className="hidden grid-cols-[5rem_1fr_5rem_5rem_7rem_8rem] bg-court-900 px-4 py-3 text-xs font-bold uppercase text-white sm:grid">
            <span>Rank</span>
            <span>Player</span>
            <span>Wins</span>
            <span>Losses</span>
            <span>Record</span>
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-line-200 bg-white">
            {players.map((player) => {
              const isCurrentPlayer = currentPlayer?.id === player.id;
              const isEligible = eligiblePlayerIds.has(player.id);
              const blockingMatch = getBlockingMatchWith(player.id);

              return (
                <div
                  className={`grid gap-3 px-4 py-4 sm:grid-cols-[5rem_1fr_5rem_5rem_7rem_8rem] sm:items-center ${
                    isCurrentPlayer ? 'bg-lime-50' : 'bg-white'
                  }`}
                  key={player.id}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase text-ink-700 sm:hidden">
                      Rank
                    </span>
                    <span className="font-bold text-court-900">#{player.rankPosition}</span>
                  </div>
                  <div>
                    <p className="font-bold text-ink-900">
                      {player.name}
                      {isCurrentPlayer && (
                        <span className="ml-2 rounded-full bg-court-900 px-2 py-0.5 text-xs font-bold text-lime-300">
                          You
                        </span>
                      )}
                    </p>
                  </div>
                  <StatCell label="Wins" value={player.wins} />
                  <StatCell label="Losses" value={player.losses} />
                  <StatCell label="Record" value={getRecord(player)} />
                  <div className="sm:text-right">
                    {isEligible && !blockingMatch && (
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-court-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-court-700 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        onClick={() => onChallenge(player.id)}
                        disabled={actionId === player.id}
                      >
                        <ChallengeIcon />
                        {actionId === player.id ? 'Sending...' : 'Challenge'}
                      </button>
                    )}
                    {isEligible && blockingMatch && (
                      <StatusBadge label={getStatusLabel(blockingMatch)} />
                    )}
                    {!isEligible && !isCurrentPlayer && (
                      <span className="text-sm text-ink-700">-</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between gap-3 sm:block">
      <span className="text-xs font-bold uppercase text-ink-700 sm:hidden">
        {label}
      </span>
      <span className="text-sm font-semibold text-ink-900">{value}</span>
    </div>
  );
}

function StatusBadge({ label }: { label: string }) {
  const badgeStyles: Record<string, string> = {
    Pending: 'border-lime-300 bg-lime-50 text-court-900',
    Accepted: 'border-court-500 bg-court-100 text-court-700',
    'Time Proposed': 'border-line-200 bg-white text-ink-700',
    Scheduled: 'border-court-500 bg-court-700 text-white',
    Completed: 'border-court-500 bg-white text-court-700',
    Canceled: 'border-red-200 bg-red-50 text-red-700',
    Expired: 'border-line-200 bg-slate-50 text-ink-700',
  };

  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-bold ${
        badgeStyles[label] ?? 'border-line-200 bg-white text-ink-700'
      }`}
    >
      {label}
    </span>
  );
}

function ProposalSummary({
  actionId,
  isTimeProposer,
  match,
  onChooseTime,
  opponentName,
  showActions,
}: {
  actionId?: string | null;
  isTimeProposer: boolean;
  match: Match;
  onChooseTime?: (proposal: MatchTimeProposal) => void;
  opponentName: string;
  showActions: boolean;
}) {
  const hasProposedTimes = match.proposed_match_options.length > 0;
  const turnMessage = getTimeProposalTurnMessage({
    isTimeProposer,
    match,
    opponentName,
  });

  return (
    <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-ink-900">Proposed times</p>
          <p className="mt-1 text-sm font-semibold text-court-900">{turnMessage}</p>
        </div>
        <p className="text-xs font-semibold text-ink-700">
          8:00 AM - 8:00 PM, exactly 1 hour 30 minutes
        </p>
      </div>

      {!hasProposedTimes && (
        <p className="mt-3 rounded-xl border border-dashed border-line-200 bg-white px-4 py-4 text-sm font-medium text-ink-700">
          No proposed times are saved for this match yet.
        </p>
      )}

      {hasProposedTimes ? (
        <div className="mt-3 grid gap-2">
          {match.proposed_match_options.map((proposal, index) => (
            <div
              className={`flex flex-col gap-3 rounded-xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${
                match.status === 'scheduled' && proposal.startAt === match.proposed_match_at
                  ? 'border-blue-300 bg-blue-50 shadow-sm ring-2 ring-blue-100'
                  : 'border-line-200 bg-white'
              }`}
              key={proposal.id}
            >
              <div>
                <p className="text-sm font-bold text-ink-900">
                  Option {index + 1}: {formatProposalRange(proposal)}
                </p>
                {match.status === 'scheduled' &&
                  proposal.startAt === match.proposed_match_at && (
                    <p className="mt-1 text-xs font-bold text-court-700">
                      Selected time
                    </p>
                  )}
              </div>
              {showActions && !isTimeProposer && onChooseTime && (
                <button
                  className="inline-flex items-center justify-center rounded-full bg-court-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-court-700 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={() => onChooseTime(proposal)}
                  disabled={actionId === match.id}
                >
                  {actionId === match.id ? 'Saving...' : 'Confirm Time'}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        match.status === 'scheduled' && (
          <p className="mt-3 rounded-xl border border-line-200 bg-white px-3 py-3 text-sm font-bold text-ink-900">
            Selected time: {formatScheduledMatchTime(match)}
          </p>
        )
      )}
    </div>
  );
}

function TimeProposalForm({
  actionId,
  match,
  proposalDrafts,
  onProposalChange,
  onPropose,
}: {
  actionId: string | null;
  match: Match;
  proposalDrafts: TimeProposalDraft[];
  onProposalChange: (
    matchId: string,
    index: number,
    nextDraft: Partial<TimeProposalDraft>,
  ) => void;
  onPropose: (match: Match, event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="mt-4 rounded-2xl border border-line-200 bg-white p-4" onSubmit={(event) => onPropose(match, event)}>
      <div>
        <p className="text-sm font-bold text-ink-900">Propose up to 3 match times</p>
        <p className="mt-1 text-sm text-ink-700">
          Select a date and one 90-minute club slot. Submitting new times replaces the previous proposed times.
        </p>
      </div>
      <div className="mt-4 grid gap-3">
        {proposalDrafts.map((proposal, index) => (
          <div
            className="grid gap-3 rounded-xl border border-line-200 bg-court-50/60 p-3 sm:grid-cols-[1fr_1.35fr]"
            key={index}
          >
            <label className="block">
              <span className="text-xs font-bold uppercase text-ink-700">
                Date {index + 1}
              </span>
              <input
                className="mt-1 w-full rounded-lg border border-line-200 bg-white px-3 py-2 text-sm font-semibold text-ink-900 outline-none focus:border-court-500 focus:ring-2 focus:ring-court-100"
                min={getTodayInputDate()}
                type="date"
                value={proposal.date}
                onChange={(event) =>
                  onProposalChange(match.id, index, { date: event.target.value })
                }
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase text-ink-700">Time Slot</span>
              <select
                className="mt-1 w-full rounded-lg border border-line-200 bg-white px-3 py-2 text-sm font-semibold text-ink-900 outline-none focus:border-court-500 focus:ring-2 focus:ring-court-100"
                value={proposal.slotId}
                onChange={(event) =>
                  onProposalChange(match.id, index, { slotId: event.target.value })
                }
              >
                <option value="">Select a 90-minute slot</option>
                {MATCH_TIME_SLOTS.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-full bg-court-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-court-700 disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={actionId === match.id}
        >
          <ClockIcon />
          {actionId === match.id ? 'Saving...' : 'Send Options'}
        </button>
      </div>
    </form>
  );
}

function ChallengeCard({
  actionId,
  cancelingMatchId,
  currentPlayer,
  hasOtherActiveMatch,
  match,
  playersById,
  proposalDrafts,
  onAccept,
  onDecline,
  onPropose,
  onChooseTime,
  onCancel,
  onProposalChange,
}: ChallengeCardProps) {
  const [isRequestingNewTimes, setIsRequestingNewTimes] = useState(false);
  const isChallenger = match.challenger_id === currentPlayer.id;
  const isOpponent = match.opponent_id === currentPlayer.id;
  const statusLabel = getStatusLabel(match);
  const isSchedulingMatch =
    match.status === 'accepted' || match.status === 'time_proposed';
  const isTimeProposer = match.proposed_by_player_id === currentPlayer.id;
  const isCanceling = cancelingMatchId === match.id;
  const canCancel = CANCELABLE_MATCH_STATUSES.includes(match.status);
  const opponentName = getOpponentName(match, currentPlayer, playersById);
  const hasProposedTimes = match.proposed_match_options.length > 0;
  const shouldShowProposalForm = !hasProposedTimes || isRequestingNewTimes;

  return (
    <article className="rounded-2xl border border-line-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-court-700">
            Opponent
          </p>
          <h3 className="mt-1 text-lg font-black text-ink-900">{opponentName}</h3>
          <p className="mt-2 text-sm text-ink-700">{getMatchRole(match, currentPlayer)}</p>
        </div>
        <StatusBadge label={statusLabel} />
      </div>

      <div className="mt-4">
        <MatchTimeline status={match.status} />
      </div>

      {match.status === 'pending' && isOpponent && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-full bg-court-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-court-700 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onAccept}
            disabled={actionId === match.id || hasOtherActiveMatch}
          >
            <CheckIcon />
            Accept
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onDecline}
            disabled={actionId === match.id}
          >
            <XIcon />
            Decline
          </button>
        </div>
      )}

      {match.status === 'pending' && isOpponent && hasOtherActiveMatch && (
        <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-court-900">
          {ACTIVE_MATCH_MESSAGE}
        </p>
      )}

      {match.status === 'pending' && isChallenger && (
        <p className="mt-4 rounded-lg border border-line-200 bg-court-50 px-4 py-3 text-sm text-ink-700">
          Waiting for your opponent to accept or decline.
        </p>
      )}

      {isSchedulingMatch && (
        <div className="mt-4 space-y-4">
          {hasProposedTimes ? (
            <ProposalSummary
              actionId={actionId}
              isTimeProposer={isTimeProposer}
              match={match}
              onChooseTime={onChooseTime}
              opponentName={opponentName}
              showActions
            />
          ) : (
            <EmptyState message="No proposed times yet. Send up to 3 options to your opponent." />
          )}

          {hasProposedTimes && isRequestingNewTimes && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-ink-900">New times requested</p>
                  <p className="mt-1 text-sm text-ink-700">
                    Previous proposed times stay available until you submit replacements.
                  </p>
                </div>
                <button
                  className="inline-flex items-center justify-center rounded-full border border-line-200 bg-white px-4 py-2 text-sm font-bold text-court-900 shadow-sm transition hover:border-court-500 hover:bg-court-50"
                  type="button"
                  onClick={() => setIsRequestingNewTimes(false)}
                >
                  Back to Proposed Times
                </button>
              </div>
            </div>
          )}

          {shouldShowProposalForm && (
            <TimeProposalForm
              actionId={actionId}
              match={match}
              proposalDrafts={proposalDrafts}
              onProposalChange={(_, index, nextDraft) => onProposalChange(index, nextDraft)}
              onPropose={(_, event) => onPropose(event)}
            />
          )}

          {hasProposedTimes && !isRequestingNewTimes && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-full border border-line-200 bg-white px-4 py-2.5 text-sm font-bold text-court-900 shadow-sm transition hover:border-court-500 hover:bg-court-50"
                type="button"
                onClick={() => setIsRequestingNewTimes(true)}
                disabled={actionId === match.id}
              >
                <ClockIcon />
                Request New Times
              </button>
            </div>
          )}
        </div>
      )}

      {canCancel && (
        <div className="mt-4 border-t border-line-200 pt-4">
          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-red-300 bg-white px-4 py-2.5 text-sm font-bold text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            type="button"
            onClick={onCancel}
            disabled={isCanceling || actionId === match.id}
          >
            <XIcon />
            {isCanceling ? 'Canceling...' : 'Cancel Match'}
          </button>
        </div>
      )}
    </article>
  );
}

function MatchTimeline({ status }: { status: MatchStatus }) {
  const steps = [
    { key: 'pending', label: 'Challenge Sent' },
    { key: 'accepted', label: 'Accepted' },
    { key: 'time_proposed', label: 'Time Selection' },
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'completed', label: 'Completed' },
  ];
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.key === status),
  );

  return (
    <div className="rounded-2xl border border-line-200 bg-white px-3 py-3 sm:px-4">
      <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-ink-700">
        Match Status
      </p>
      <div className="grid gap-2 sm:grid-cols-5">
        {steps.map((step, index) => {
          const isComplete = index < activeIndex;
          const isCurrent = index === activeIndex;

          return (
            <div
              aria-current={isCurrent ? 'step' : undefined}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${
                isCurrent
                  ? 'border-blue-300 bg-blue-50 shadow-sm ring-2 ring-blue-100'
                  : isComplete
                    ? 'border-court-100 bg-court-50'
                    : 'border-line-200 bg-white'
              }`}
              key={step.key}
            >
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-black ${
                  isCurrent
                    ? 'bg-court-500 text-white'
                    : isComplete
                      ? 'bg-court-900 text-white'
                      : 'bg-slate-100 text-ink-700'
                }`}
              >
                {isComplete ? <CheckIcon /> : index + 1}
              </span>
              <span
                className={`text-xs font-bold ${
                  isCurrent ? 'text-ink-900' : isComplete ? 'text-court-900' : 'text-ink-700'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrophyIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M8 4h8v3.5a4 4 0 0 1-8 0V4Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M8 6H5.5A2.5 2.5 0 0 0 8 10.2M16 6h2.5a2.5 2.5 0 0 1-2.5 4.2M12 12v4M9 20h6M10 16h4v4h-4v-4Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M12 4v3M12 17v3M4 12h3M17 12h3" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function MatchIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M7 7h10M7 12h10M7 17h6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <rect height="16" rx="2" stroke="currentColor" strokeWidth="2" width="14" x="5" y="4" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
      <rect height="15" rx="2" stroke="currentColor" strokeWidth="2" width="16" x="4" y="5" />
      <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function LadderIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M7 4v16M17 4v16M7 8h10M7 12h10M7 16h10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ChallengeIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M5 12h12M13 8l4 4-4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
      <path
        d="m5 12 4 4L19 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
      <path
        d="m7 7 10 10M17 7 7 17"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v4l3 2" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg aria-hidden="true" className="size-4 shrink-0" fill="none" viewBox="0 0 24 24">
      <rect height="14" rx="2" stroke="currentColor" strokeWidth="2" width="18" x="3" y="5" />
      <path d="m4 7 8 6 8-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg aria-hidden="true" className="size-4 shrink-0" fill="none" viewBox="0 0 24 24">
      <path
        d="M8.5 5.5 10 9l-2 1.4a11 11 0 0 0 5.6 5.6L15 14l3.5 1.5v3A2.5 2.5 0 0 1 16 21 13 13 0 0 1 3 8a2.5 2.5 0 0 1 2.5-2.5h3Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function getMatchTitle(
  match: Match,
  currentPlayer: RankedPlayer,
  playersById: Map<string, RankedPlayer>,
) {
  const otherPlayerId =
    match.challenger_id === currentPlayer.id ? match.opponent_id : match.challenger_id;
  const otherPlayer = playersById.get(otherPlayerId);

  return otherPlayer ? `Match with ${otherPlayer.name}` : 'Match';
}

function getOpponentName(
  match: Match,
  currentPlayer: RankedPlayer,
  playersById: Map<string, RankedPlayer>,
) {
  const otherPlayerId =
    match.challenger_id === currentPlayer.id ? match.opponent_id : match.challenger_id;

  return playersById.get(otherPlayerId)?.name ?? 'Unknown opponent';
}

function getMatchRole(match: Match, currentPlayer: RankedPlayer) {
  if (match.challenger_id === currentPlayer.id) {
    return 'You sent this challenge.';
  }

  return 'You received this challenge.';
}

function getCancelingPlayerName(
  match: Match,
  currentPlayer: RankedPlayer,
  playersById: Map<string, RankedPlayer>,
) {
  if (!match.canceled_by) {
    return 'a player';
  }

  if (match.canceled_by === currentPlayer.id) {
    return 'you';
  }

  return playersById.get(match.canceled_by)?.name ?? 'the other player';
}

function getPlayerName(
  playerId: string | null,
  currentPlayer: RankedPlayer,
  playersById: Map<string, RankedPlayer>,
) {
  if (!playerId) {
    return 'Not selected';
  }

  if (playerId === currentPlayer.id) {
    return currentPlayer.name;
  }

  return playersById.get(playerId)?.name ?? 'Unknown player';
}

function getStatusLabel(match: Match) {
  if (match.status === 'completed') {
    return 'Completed';
  }

  if (match.status === 'canceled') {
    return 'Canceled';
  }

  if (match.status === 'expired') {
    return 'Expired';
  }

  if (match.status === 'scheduled') {
    return 'Scheduled';
  }

  if (match.status === 'pending') {
    return 'Pending';
  }

  if (match.status === 'time_proposed') {
    return 'Time Proposed';
  }

  if (match.proposed_match_at) {
    return 'Time Proposed';
  }

  return 'Accepted';
}

function getTimeProposalTurnMessage({
  isTimeProposer,
  match,
  opponentName,
}: {
  isTimeProposer: boolean;
  match: Match;
  opponentName: string;
}) {
  if (match.status === 'scheduled') {
    return 'Match scheduled';
  }

  if (match.proposed_match_options.length === 0) {
    return 'New times requested';
  }

  if (isTimeProposer) {
    return `Waiting for ${opponentName} to choose a time`;
  }

  return 'Please choose one of the proposed times';
}

function formatSupabaseError(error: PostgrestError) {
  return [
    `Message: ${error.message}`,
    `Details: ${error.details ?? 'None'}`,
    `Hint: ${error.hint ?? 'None'}`,
    `Code: ${error.code ?? 'None'}`,
  ].join('\n');
}

function getRecord(player: RankedPlayer) {
  return `${player.wins}-${player.losses}`;
}

function getPyramidRows(players: RankedPlayer[]) {
  const playerByRank = new Map(
    players.map((player) => [player.rankPosition, player]),
  );
  const rows: PyramidSpot[][] = [];
  let rowSize = 1;
  let rankPosition = 1;

  while (rankPosition <= TOTAL_LADDER_POSITIONS) {
    const row: PyramidSpot[] = [];

    for (
      let rowSpot = 0;
      rowSpot < rowSize && rankPosition <= TOTAL_LADDER_POSITIONS;
      rowSpot += 1
    ) {
      row.push({
        rankPosition,
        player: playerByRank.get(rankPosition) ?? null,
      });
      rankPosition += 1;
    }

    rows.push(row);
    rowSize += 1;
  }

  return rows;
}

function getDefaultTimeProposalDrafts(): TimeProposalDraft[] {
  return Array.from({ length: MAX_TIME_PROPOSALS }, () => ({
    date: '',
    slotId: '',
  }));
}

function buildTimeProposals(
  drafts: TimeProposalDraft[],
):
  | { ok: true; proposals: MatchTimeProposal[] }
  | { ok: false; message: string } {
  const proposals: MatchTimeProposal[] = [];
  const usedSlots = new Set<string>();

  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index];
    const hasAnyValue = draft.date || draft.slotId;

    if (!hasAnyValue) {
      continue;
    }

    if (!draft.date || !draft.slotId) {
      return {
        ok: false,
        message: `Option ${index + 1}: please select both a date and a time slot.`,
      };
    }

    const slot = MATCH_TIME_SLOTS.find((timeSlot) => timeSlot.id === draft.slotId);

    if (!slot) {
      return {
        ok: false,
        message: `Option ${index + 1}: please select an available club time slot.`,
      };
    }

    const start = new Date(`${draft.date}T${slot.startTime}`);
    const end = new Date(`${draft.date}T${slot.endTime}`);
    const proposalKey = `${draft.date}-${slot.id}`;

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return {
        ok: false,
        message: `Option ${index + 1}: enter a valid date and time.`,
      };
    }

    const durationMinutes = (end.getTime() - start.getTime()) / 60_000;
    const now = new Date();

    if (durationMinutes !== 90) {
      return {
        ok: false,
        message: `Option ${index + 1}: match slots must be exactly 1 hour 30 minutes.`,
      };
    }

    if (start.getTime() <= now.getTime()) {
      return {
        ok: false,
        message: `Option ${index + 1}: please select a future date and time.`,
      };
    }

    if (usedSlots.has(proposalKey)) {
      return {
        ok: false,
        message: `Option ${index + 1}: this date and time slot is already selected.`,
      };
    }

    usedSlots.add(proposalKey);

    proposals.push({
      id: proposalKey,
      date: draft.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
    });
  }

  if (proposals.length === 0) {
    return {
      ok: false,
      message: 'Add at least one match time option before sending.',
    };
  }

  return { ok: true, proposals };
}

function getTodayInputDate() {
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60_000);

  return localDate.toISOString().slice(0, 10);
}

function formatProposalRange(proposal: MatchTimeProposal) {
  const start = new Date(proposal.startAt);
  const end = new Date(proposal.endAt);

  return `${new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(start)}, ${new Intl.DateTimeFormat(undefined, {
    timeStyle: 'short',
  }).format(start)}-${new Intl.DateTimeFormat(undefined, {
    timeStyle: 'short',
  }).format(end)}`;
}

function formatScheduledMatchTime(match: Match) {
  if (!match.proposed_match_at) {
    return 'No time selected';
  }

  if (!match.scheduled_match_ends_at) {
    return formatDisplayDate(match.proposed_match_at);
  }

  return formatProposalRange({
    id: match.id,
    date: '',
    startTime: '',
    endTime: '',
    startAt: match.proposed_match_at,
    endAt: match.scheduled_match_ends_at,
  });
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

export default ChallengePlayerSystem;
