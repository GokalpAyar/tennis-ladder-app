import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type TouchEvent,
} from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  MATCH_TIME_SLOTS,
  buildRankedPlayers,
  buildTimeProposals,
  getDefaultTimeProposalDrafts,
  getEligibleChallengePlayerIds,
  getWinnerSubmissionUpdate,
  isBlockingMatchStatus,
  type MatchStatus,
  type MatchTimeProposal,
  type RankedPlayer,
  type TimeProposalDraft,
} from './challengeRules';

type Profile = {
  id: string;
  full_name: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'inactive' | null;
};

type PyramidSpot = {
  rankPosition: number;
  player: RankedPlayer | null;
};

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
  cancellation_requested_by: string | null;
  cancellation_reason: string | null;
  cancellation_requested_at: string | null;
  reschedule_requested_by: string | null;
  reschedule_reason: string | null;
  reschedule_requested_at: string | null;
  reschedule_approved_by: string | null;
  reschedule_approved_at: string | null;
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

type ChallengePlayerSystemProps = {
  userId: string;
  adminPreview?: boolean;
  variant?: 'full' | 'dashboard' | 'ladder' | 'activities';
};

const TOTAL_LADDER_POSITIONS = 50;
const CANCELABLE_MATCH_STATUSES: MatchStatus[] = [
  'pending',
  'accepted',
  'time_proposed',
];
const ACTIVE_MATCH_MESSAGE =
  'You already have an active match. Complete or cancel it before starting another.';

function ChallengePlayerSystem({
  userId,
  adminPreview = false,
  variant = 'full',
}: ChallengePlayerSystemProps) {
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
  const isActivities = variant === 'activities';
  const cardClass = isDashboard
    ? 'premium-card rounded-[1.5rem] p-4 sm:p-5'
    : 'premium-card rounded-[1.75rem] p-5 sm:p-6';

  useEffect(() => {
    loadChallengeData();
  }, [userId]);

  useEffect(() => {
    const refreshIntervalId = window.setInterval(() => {
      void loadChallengeData({ quiet: true });
    }, 25000);

    return () => window.clearInterval(refreshIntervalId);
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
    return matches.filter((match) => isBlockingMatchStatus(match.status));
  }, [matches]);
  const hasActiveMatch = blockingMatches.length > 0;
  const hasMatchActionNeeded = useMemo(() => {
    if (!currentPlayer) {
      return false;
    }

    return blockingMatches.some((match) => isMatchActionNeeded(match, currentPlayer));
  }, [blockingMatches, currentPlayer]);

  const scheduledMatches = useMemo(() => {
    return matches.filter(
      (match) => match.status === 'scheduled' || match.status === 'cancellation_requested',
    );
  }, [matches]);

  const canceledMatches = useMemo(() => {
    return matches.filter((match) => match.status === 'canceled');
  }, [matches]);

  const completedMatches = useMemo(() => {
    return matches.filter((match) => match.status === 'completed');
  }, [matches]);

  const dashboardMatch = useMemo(() => {
    return scheduledMatches[0] ?? matchActivityMatches[0] ?? null;
  }, [matchActivityMatches, scheduledMatches]);

  const dashboardMatchSummary = useMemo(() => {
    return getDashboardMatchSummary(dashboardMatch, currentPlayer, playersById);
  }, [currentPlayer, dashboardMatch, playersById]);

  const eligiblePlayerIds = useMemo(() => {
    return getEligibleChallengePlayerIds(currentPlayer, players);
  }, [currentPlayer, players]);

  const eligiblePlayers = useMemo(() => {
    return players.filter((player) => eligiblePlayerIds.has(player.id));
  }, [eligiblePlayerIds, players]);

  async function loadChallengeData(options: { quiet?: boolean } = {}) {
    const isQuietRefresh = options.quiet === true;

    if (!isQuietRefresh) {
      setIsLoading(true);
      setErrorMessage('');
    }

    const { data: rankingRows, error: rankingsError } = await supabase
      .from('ladder_rankings')
      .select('player_id, rank_position, wins, losses')
      .order('rank_position', { ascending: true });

    if (rankingsError) {
      if (!isQuietRefresh) {
        setErrorMessage(rankingsError.message);
        setIsLoading(false);
      }
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
      if (!isQuietRefresh) {
        setErrorMessage(profilesError.message);
        setIsLoading(false);
      }
      return;
    }

    const profilesById = new Map(
      ((profileRows ?? []) as Profile[]).map((profile) => [profile.id, profile]),
    );
    const currentProfile = profilesById.get(userId);
    setProfileStatus(currentProfile?.status === 'approved' ? 'approved' : 'pending');
    const rankedPlayers = buildRankedPlayers(rankingRows ?? [], profileRows ?? []);
    const nextCurrentPlayer = rankedPlayers.find(
      (player) => player.id === userId,
    );

    setCurrentPlayer(nextCurrentPlayer ?? null);
    setPlayers(rankedPlayers);

    if (!nextCurrentPlayer && !adminPreview) {
      setMatches([]);
      if (!isQuietRefresh) {
        setIsLoading(false);
      }
      return;
    }

    const matchSelect = supabase
      .from('matches')
      .select(
        'id, challenger_id, opponent_id, status, proposed_match_at, proposed_match_options, scheduled_match_ends_at, proposed_by_player_id, challenger_agreed_at, opponent_agreed_at, cancel_reason, canceled_at, canceled_by, cancellation_requested_by, cancellation_reason, cancellation_requested_at, reschedule_requested_by, reschedule_reason, reschedule_requested_at, reschedule_approved_by, reschedule_approved_at, winner_id, stats_recorded, ranking_updated, created_at',
      );

    const { data: matchRows, error: matchesError } = await (adminPreview
      ? matchSelect.order('created_at', { ascending: false })
      : matchSelect
          .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
          .order('created_at', { ascending: false }));

    if (matchesError) {
      if (!isQuietRefresh) {
        setErrorMessage(matchesError.message);
        setIsLoading(false);
      }
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
    if (!isQuietRefresh) {
      setIsLoading(false);
    }
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

  async function proposeMatchTime(match: Match) {
    if (!isCurrentUserMatchPlayer(match, userId)) {
      setErrorMessage('Only players in this match can propose times.');
      return;
    }

    if (
      match.status === 'scheduled' &&
      (!match.reschedule_requested_by || !match.reschedule_approved_at)
    ) {
      setErrorMessage('Your opponent must accept the reschedule request before new times can be proposed.');
      return;
    }

    const proposalResult = buildTimeProposals(timeProposalDrafts[match.id] ?? []);

    if (!proposalResult.ok) {
      setErrorMessage(proposalResult.message);
      return;
    }

    const isChallenger = match.challenger_id === userId;

    setActionId(match.id);
    setMessage('');
    setErrorMessage('');

    const matchUpdate = {
      status: 'time_proposed',
      proposed_match_at: proposalResult.proposals[0].startAt,
      proposed_match_options: proposalResult.proposals,
      proposed_by_player_id: userId,
      challenger_agreed_at: isChallenger ? new Date().toISOString() : null,
      opponent_agreed_at: isChallenger ? null : new Date().toISOString(),
      scheduled_match_ends_at: null,
      ...(match.status === 'scheduled'
        ? {
            reschedule_approved_at: null,
            reschedule_approved_by: null,
            reschedule_reason: null,
            reschedule_requested_at: null,
            reschedule_requested_by: null,
          }
        : {}),
    };

    const { error } = await supabase
      .from('matches')
      .update(matchUpdate)
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
    if (!proposal.startAt || !proposal.endAt) {
      return;
    }

    if (!isCurrentUserMatchPlayer(match, userId)) {
      setErrorMessage('Only players in this match can confirm a time.');
      return;
    }

    if (match.proposed_by_player_id === userId) {
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
      .in('status', ['scheduled', 'cancellation_requested'])
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
        cancellation_requested_at: null,
        cancellation_reason: null,
        cancellation_requested_by: null,
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

  async function requestCancellation(match: Match, reason: string) {
    if (!currentPlayer || match.status !== 'scheduled') {
      return;
    }

    const trimmedReason = reason.trim();

    if (!trimmedReason) {
      setErrorMessage('Please enter a short reason before requesting cancellation.');
      return;
    }

    setActionId(match.id);
    setCancelingMatchId(match.id);
    setMessage('');
    setErrorMessage('');

    const { data, error } = await supabase
      .from('matches')
      .update({
        cancellation_reason: trimmedReason,
        cancellation_requested_at: new Date().toISOString(),
        cancellation_requested_by: currentPlayer.id,
        status: 'cancellation_requested',
      })
      .eq('id', match.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle();

    setActionId(null);
    setCancelingMatchId(null);

    if (error) {
      console.error('Request cancellation Supabase error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      setErrorMessage(formatSupabaseError(error));
      return;
    }

    if (!data) {
      setErrorMessage('Cancellation could not be requested because this match changed.');
      await loadChallengeData();
      return;
    }

    await createMatchNotification({
      message: `${currentPlayer.name} requested to cancel your scheduled match. Reason: ${trimmedReason}`,
      title: 'Cancellation requested',
      userId: getOtherPlayerId(match, currentPlayer.id),
    });

    setMessage('Cancellation request sent.');
    await loadChallengeData();
  }

  async function acceptCancellation(match: Match) {
    if (!currentPlayer || match.status !== 'cancellation_requested') {
      return;
    }

    if (match.cancellation_requested_by === currentPlayer.id) {
      setErrorMessage('Waiting for your opponent to respond to your cancellation request.');
      return;
    }

    const requesterId = match.cancellation_requested_by;

    if (!requesterId) {
      setErrorMessage('Cancellation requester is missing. Please refresh and try again.');
      return;
    }

    setActionId(match.id);
    setCancelingMatchId(match.id);
    setMessage('');
    setErrorMessage('');

    const { data, error } = await supabase
      .from('matches')
      .update({
        cancel_reason: match.cancellation_reason || null,
        canceled_at: new Date().toISOString(),
        canceled_by: requesterId,
        status: 'canceled',
      })
      .eq('id', match.id)
      .eq('status', 'cancellation_requested')
      .select('id')
      .maybeSingle();

    setActionId(null);
    setCancelingMatchId(null);

    if (error) {
      console.error('Accept cancellation Supabase error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      setErrorMessage(formatSupabaseError(error));
      return;
    }

    if (!data) {
      setErrorMessage('Cancellation could not be accepted because this match changed.');
      await loadChallengeData();
      return;
    }

    await createMatchNotification({
      message: `${currentPlayer.name} accepted your cancellation request.`,
      title: 'Cancellation accepted',
      userId: requesterId,
    });

    setMessage('Match canceled.');
    await loadChallengeData();
  }

  async function keepMatchScheduled(match: Match) {
    if (!currentPlayer || match.status !== 'cancellation_requested') {
      return;
    }

    if (match.cancellation_requested_by === currentPlayer.id) {
      setErrorMessage('Waiting for your opponent to respond to your cancellation request.');
      return;
    }

    const requesterId = match.cancellation_requested_by;

    if (!requesterId) {
      setErrorMessage('Cancellation requester is missing. Please refresh and try again.');
      return;
    }

    setActionId(match.id);
    setMessage('');
    setErrorMessage('');

    const { data, error } = await supabase
      .from('matches')
      .update({
        cancellation_reason: null,
        cancellation_requested_at: null,
        cancellation_requested_by: null,
        status: 'scheduled',
      })
      .eq('id', match.id)
      .eq('status', 'cancellation_requested')
      .select('id')
      .maybeSingle();

    setActionId(null);

    if (error) {
      console.error('Keep scheduled Supabase error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      setErrorMessage(formatSupabaseError(error));
      return;
    }

    if (!data) {
      setErrorMessage('The match could not be kept scheduled because it changed.');
      await loadChallengeData();
      return;
    }

    await createMatchNotification({
      message: `${currentPlayer.name} kept your match scheduled.`,
      title: 'Cancellation declined',
      userId: requesterId,
    });

    setMessage('Match remains scheduled.');
    await loadChallengeData();
  }

  async function requestReschedule(match: Match, reason: string) {
    if (!currentPlayer || match.status !== 'scheduled') {
      return;
    }

    if (!isCurrentUserMatchPlayer(match, currentPlayer.id)) {
      setErrorMessage('Only players in this match can request a new time.');
      return;
    }

    const trimmedReason = reason.trim();

    setActionId(match.id);
    setMessage('');
    setErrorMessage('');

    const { data, error } = await supabase
      .from('matches')
      .update({
        reschedule_approved_at: null,
        reschedule_approved_by: null,
        reschedule_reason: trimmedReason || null,
        reschedule_requested_at: new Date().toISOString(),
        reschedule_requested_by: currentPlayer.id,
      })
      .eq('id', match.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle();

    setActionId(null);

    if (error) {
      setErrorMessage(formatSupabaseError(error));
      return;
    }

    if (!data) {
      setErrorMessage('Reschedule could not be requested because this match changed.');
      await loadChallengeData();
      return;
    }

    setMessage('Reschedule request sent. The original match time remains scheduled.');
    await loadChallengeData();
  }

  async function acceptRescheduleRequest(match: Match) {
    if (!currentPlayer || match.status !== 'scheduled') {
      return;
    }

    if (match.reschedule_requested_by === currentPlayer.id) {
      setErrorMessage('Waiting for your opponent to respond to your reschedule request.');
      return;
    }

    if (!match.reschedule_requested_by) {
      setErrorMessage('No reschedule request was found for this match.');
      return;
    }

    setActionId(match.id);
    setMessage('');
    setErrorMessage('');

    const { data, error } = await supabase
      .from('matches')
      .update({
        reschedule_approved_at: new Date().toISOString(),
        reschedule_approved_by: currentPlayer.id,
      })
      .eq('id', match.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle();

    setActionId(null);

    if (error) {
      setErrorMessage(formatSupabaseError(error));
      return;
    }

    if (!data) {
      setErrorMessage('Reschedule could not be accepted because this match changed.');
      await loadChallengeData();
      return;
    }

    setMessage('Reschedule request accepted. New times can now be proposed.');
    await loadChallengeData();
  }

  async function keepScheduledAfterRescheduleRequest(match: Match) {
    if (!currentPlayer || match.status !== 'scheduled') {
      return;
    }

    if (match.reschedule_requested_by === currentPlayer.id) {
      setErrorMessage('Waiting for your opponent to respond to your reschedule request.');
      return;
    }

    if (!match.reschedule_requested_by) {
      setErrorMessage('No reschedule request was found for this match.');
      return;
    }

    setActionId(match.id);
    setMessage('');
    setErrorMessage('');

    const { data, error } = await supabase
      .from('matches')
      .update({
        reschedule_approved_at: null,
        reschedule_approved_by: null,
        reschedule_reason: null,
        reschedule_requested_at: null,
        reschedule_requested_by: null,
      })
      .eq('id', match.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle();

    setActionId(null);

    if (error) {
      setErrorMessage(formatSupabaseError(error));
      return;
    }

    if (!data) {
      setErrorMessage('The match could not be kept scheduled because it changed.');
      await loadChallengeData();
      return;
    }

    setMessage('Match remains scheduled.');
    await loadChallengeData();
  }

  async function createMatchNotification({
    message: notificationMessage,
    title,
    userId: notificationUserId,
  }: {
    message: string;
    title: string;
    userId: string;
  }) {
    const { error } = await supabase.from('notifications').insert({
      message: notificationMessage,
      title,
      type: 'match',
      user_id: notificationUserId,
    });

    if (error) {
      console.error('Create notification Supabase error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    }
  }

  function cancelReschedule(matchId: string) {
    setErrorMessage('');
    setReschedulingMatchIds((current) => {
      const next = new Set(current);
      next.delete(matchId);
      return next;
    });
  }

  async function submitWinner(match: Match) {
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

    setActionId(match.id);
    setSubmittingWinnerId(match.id);
    setMessage('');
    setErrorMessage('');

    const { data, error } = await supabase
      .from('matches')
      .update(getWinnerSubmissionUpdate(winnerDraft.winnerId))
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

  if (!currentPlayer && adminPreview) {
    const previewActiveMatches = matches.filter((match) =>
      ['pending', 'accepted', 'time_proposed'].includes(match.status),
    );
    const previewScheduledMatches = matches.filter((match) => match.status === 'scheduled');

    if (isLadder) {
      return (
        <div className="space-y-4">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm font-bold text-court-900">
            Player Preview Mode: you are viewing the ladder as an admin. Challenge
            actions are disabled because this admin account is not ranked.
          </div>
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
              currentPlayer={null}
              eligiblePlayerIds={new Set<string>()}
              getBlockingMatchWith={getBlockingMatchWith}
              onChallenge={sendChallenge}
              players={players}
              showActions={false}
              showTable={false}
            />
          ) : (
            <LadderListView currentPlayer={null} players={players} />
          )}
        </div>
      );
    }

    return (
      <div className={isDashboard ? 'grid gap-4 lg:grid-cols-2' : 'space-y-6'}>
        <section className={`${cardClass} lg:col-span-2`}>
          <SectionHeader
            icon={<AdminPreviewIcon />}
            title="Player Preview Mode"
            description="You are viewing the player experience as an admin. This account is not ranked, so challenge actions are disabled."
          />
        </section>

        <section className={cardClass}>
          <SectionHeader
            icon={<TrophyIcon />}
            title="My Ranking"
            description="Admin preview accounts do not need a ladder ranking."
          />
          <p className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-court-900">
            No player ranking is required for admin access.
          </p>
        </section>

        <section className={cardClass}>
          <SectionHeader
            icon={<PhoneIcon />}
            title="Court Reservations"
            description="Contact details shown to players after a match time is scheduled."
          />
          <CourtReservationsCard className="mt-5" />
        </section>

        <AdminPreviewMatchSection
          matches={previewActiveMatches}
          playersById={playersById}
          sectionClass={cardClass}
          title="Match Activity"
        />
        <AdminPreviewMatchSection
          matches={previewScheduledMatches}
          playersById={playersById}
          sectionClass={cardClass}
          title="Scheduled Matches"
        />
      </div>
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

  if (isActivities) {
    return (
      <div className="space-y-5">
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

        <section className={cardClass} id="match-activity">
          <SectionHeader
            icon={<MatchIcon />}
            title="Match Activity"
            description="Sent challenges, received challenges, accepted challenges, and time proposals."
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
                  onPropose={() => proposeMatchTime(match)}
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
          onAcceptCancellation={acceptCancellation}
          onAcceptRescheduleRequest={acceptRescheduleRequest}
          onKeepScheduled={keepMatchScheduled}
          onKeepScheduledAfterRescheduleRequest={keepScheduledAfterRescheduleRequest}
          onProposalChange={updateTimeProposalDraft}
          onProposeTime={proposeMatchTime}
          onRequestCancellation={requestCancellation}
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
                <CanceledMatchCard
                  currentPlayer={currentPlayer}
                  key={match.id}
                  match={match}
                  playersById={playersById}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div
      className={
        isDashboard
          ? 'grid gap-4 md:grid-cols-[minmax(0,1fr)_17rem] md:items-start md:gap-3'
          : 'space-y-6'
      }
    >
      {(message || errorMessage) && (
        <div
          className={`whitespace-pre-line rounded-2xl border px-5 py-4 text-sm font-medium shadow-sm ${
            errorMessage
              ? 'border-red-300 bg-red-50 text-red-700'
              : 'border-court-500 bg-court-100 text-court-700'
          } ${
            isDashboard
              ? 'md:fixed md:right-6 md:top-28 md:z-50 md:max-w-sm md:px-4 md:py-3'
              : ''
          }`}
          role={errorMessage ? 'alert' : 'status'}
        >
          {errorMessage || message}
        </div>
      )}

      <section className={`${cardClass} ${isDashboard ? 'md:col-start-1 md:row-start-1 md:p-4' : ''}`}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between md:hidden">
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
        <div className="hidden md:block">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-court-700">
            My Ranking
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-3xl font-black tracking-tight text-ink-900">
              #{currentPlayer.rankPosition}
            </p>
            <h2 className="min-w-0 truncate text-xl font-black tracking-tight text-ink-900">
              {currentPlayer.name}
            </h2>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-line-200 bg-white px-3 py-1 text-xs font-black text-court-900">
              Record {getRecord(currentPlayer)}
            </span>
            <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-court-900">
              {currentPlayer.rankPosition === 1
                ? 'Top rank'
                : 'Can challenge up to 3 spots above'}
            </span>
          </div>
        </div>
      </section>

      {isDashboard && (
        <section
          className={`${cardClass} md:hidden ${
            hasMatchActionNeeded ? 'match-update-glow' : ''
          }`}
        >
          <p className="text-xs font-black uppercase tracking-[0.14em] text-court-700">
            My Match
          </p>
          <h2 className="mt-2 text-lg font-black tracking-tight text-ink-900">
            {dashboardMatchSummary.title}
          </h2>
          <p className="mt-1 text-sm leading-5 text-ink-700">
            {dashboardMatchSummary.description}
          </p>
          <Link className="btn-primary mt-4 w-full px-3 py-2 text-sm" to="/activities">
            {dashboardMatchSummary.actionLabel}
          </Link>
        </section>
      )}

      {isDashboard && (
        <section
          className={`${cardClass} hidden md:col-start-2 md:row-start-1 md:block md:p-4 ${
            hasMatchActionNeeded ? 'match-update-glow' : ''
          }`}
        >
          <p className="text-xs font-black uppercase tracking-[0.14em] text-court-700">
            My Match
          </p>
          <h2 className="mt-2 text-lg font-black tracking-tight text-ink-900">
            {dashboardMatchSummary.title}
          </h2>
          <p className="mt-1 text-sm leading-5 text-ink-700">
            {dashboardMatchSummary.description}
          </p>
          <Link className="btn-primary mt-4 w-full px-3 py-2 text-sm" to="/activities">
            {dashboardMatchSummary.actionLabel}
          </Link>
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

      <section className={`${cardClass} ${isDashboard ? 'md:col-span-2 md:row-start-2 md:p-4' : ''}`}>
        <div className={isDashboard ? 'md:hidden' : ''}>
          <SectionHeader
            icon={<TargetIcon />}
            title="Eligible Players to Challenge"
            description={
              hasActiveMatch
                ? 'Active match in progress.'
                : currentPlayer.rankPosition === 1
                  ? 'Rank 1 cannot challenge anyone.'
                  : 'Only players ranked up to 3 spots above you are available.'
            }
          />
        </div>
        {isDashboard && (
          <div className="hidden md:flex md:items-center md:justify-between md:gap-3">
            <div>
              <h2 className="text-base font-black tracking-tight text-ink-900">
                Eligible Players
              </h2>
              <p className="mt-1 text-xs font-semibold text-ink-700">
                Rank, record, challenge.
              </p>
            </div>
            {hasActiveMatch && (
              <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-court-900">
                Finish active match first
              </span>
            )}
          </div>
        )}
        {hasActiveMatch && (
          <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-court-900 md:hidden">
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
                  className="flex flex-col gap-3 rounded-xl border border-line-200 bg-white px-4 py-3 shadow-sm transition hover:border-court-500 sm:flex-row sm:items-center sm:justify-between md:grid md:grid-cols-[4.5rem_minmax(0,1fr)_5.5rem_auto] md:gap-3 md:px-3 md:py-2 md:shadow-none"
                  key={player.id}
                >
                  <p className="hidden text-sm font-black text-court-900 md:block">
                    #{player.rankPosition}
                  </p>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink-900">
                      <span className="md:hidden">#{player.rankPosition} </span>
                      {player.name}
                    </p>
                    <p className="mt-1 text-sm text-ink-700 md:hidden">
                      {currentPlayer.rankPosition - player.rankPosition} spot
                      {currentPlayer.rankPosition - player.rankPosition === 1 ? '' : 's'} above you
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink-700 md:hidden">
                      Record {player.wins}-{player.losses}
                    </p>
                  </div>
                  <p className="hidden text-sm font-black text-ink-900 md:block">
                    {player.wins}-{player.losses}
                  </p>
                  <div className="md:justify-self-end">
                    {blockingMatch ? (
                      <StatusBadge label={getStatusLabel(blockingMatch)} />
                    ) : hasActiveMatch ? (
                      <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-court-900">
                        Finish active match first
                      </span>
                    ) : (
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-court-900 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-court-700 disabled:cursor-not-allowed disabled:opacity-60 md:px-3 md:py-1.5 md:text-xs"
                        type="button"
                        onClick={() => sendChallenge(player.id)}
                        disabled={actionId === player.id}
                      >
                        <ChallengeIcon />
                        {actionId === player.id ? 'Sending...' : 'Challenge'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {!isDashboard && (
      <section
        className={`${cardClass} ${
          matchActivityMatches.some((match) => isMatchActionNeeded(match, currentPlayer))
            ? 'match-update-glow'
            : ''
        }`}
        id="match-activity"
      >
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
                onPropose={() => proposeMatchTime(match)}
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
      )}

      {!isDashboard && (
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
        onAcceptCancellation={acceptCancellation}
        onAcceptRescheduleRequest={acceptRescheduleRequest}
        onKeepScheduled={keepMatchScheduled}
        onKeepScheduledAfterRescheduleRequest={keepScheduledAfterRescheduleRequest}
        onProposalChange={updateTimeProposalDraft}
        onProposeTime={proposeMatchTime}
        onRequestCancellation={requestCancellation}
        onRequestReschedule={requestReschedule}
        onSubmitWinner={submitWinner}
        onWinnerChange={updateWinnerDraft}
      />
      )}

      {!isDashboard && (
      <CompletedMatchesSection
        currentPlayer={currentPlayer}
        matches={completedMatches}
        playersById={playersById}
        sectionClass={cardClass}
      />
      )}

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
  onAccept: () => void | Promise<void>;
  onDecline: () => void | Promise<void>;
  onPropose: () => void | Promise<void>;
  onChooseTime: (proposal: MatchTimeProposal) => void;
  onCancel: () => void | Promise<void>;
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
  onAcceptCancellation: (match: Match) => void | Promise<void>;
  onAcceptRescheduleRequest: (match: Match) => void | Promise<void>;
  onKeepScheduled: (match: Match) => void | Promise<void>;
  onKeepScheduledAfterRescheduleRequest: (match: Match) => void | Promise<void>;
  onProposalChange: (
    matchId: string,
    index: number,
    nextDraft: Partial<TimeProposalDraft>,
  ) => void;
  onProposeTime: (match: Match) => void | Promise<void>;
  onRequestCancellation: (match: Match, reason: string) => Promise<void>;
  onRequestReschedule: (match: Match, reason: string) => Promise<void>;
  onSubmitWinner: (match: Match) => Promise<void>;
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
  onAcceptCancellation,
  onAcceptRescheduleRequest,
  onKeepScheduled,
  onKeepScheduledAfterRescheduleRequest,
  onProposalChange,
  onProposeTime,
  onRequestCancellation,
  onRequestReschedule,
  onSubmitWinner,
  onWinnerChange,
}: ScheduledMatchesSectionProps) {
  const [cancellationRequest, setCancellationRequest] = useState<{
    matchId: string;
    step: 'confirm' | 'reason';
  } | null>(null);
  const [rescheduleRequestMatchId, setRescheduleRequestMatchId] = useState<string | null>(null);
  const [scheduledConfirmation, setScheduledConfirmation] = useState<{
    matchId: string;
    type:
      | 'accept-cancellation'
      | 'accept-reschedule'
      | 'keep-reschedule'
      | 'keep-scheduled'
      | 'submit-winner';
  } | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancellationReasonError, setCancellationReasonError] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const hasScheduledActionNeeded = matches.some((match) =>
    isMatchActionNeeded(match, currentPlayer),
  );
  const cancellationMatch = cancellationRequest
    ? matches.find((match) => match.id === cancellationRequest.matchId) ?? null
    : null;
  const rescheduleRequestMatch = rescheduleRequestMatchId
    ? matches.find((match) => match.id === rescheduleRequestMatchId) ?? null
    : null;
  const scheduledConfirmationMatch = scheduledConfirmation
    ? matches.find((match) => match.id === scheduledConfirmation.matchId) ?? null
    : null;
  const scheduledConfirmationWinnerId =
    scheduledConfirmation?.type === 'submit-winner' && scheduledConfirmationMatch
      ? winnerDrafts[scheduledConfirmationMatch.id]?.winnerId
      : null;
  const scheduledConfirmationWinnerName =
    scheduledConfirmationWinnerId && scheduledConfirmationMatch
      ? getPlayerName(scheduledConfirmationWinnerId, currentPlayer, playersById)
      : '';

  useEffect(() => {
    if (!cancellationRequest) {
      return;
    }

    const latestMatch = matches.find((match) => match.id === cancellationRequest.matchId);

    if (!latestMatch || latestMatch.status !== 'scheduled') {
      closeCancellationRequest();
    }
  }, [cancellationRequest, matches]);

  useEffect(() => {
    if (!rescheduleRequestMatchId) {
      return;
    }

    const latestMatch = matches.find((match) => match.id === rescheduleRequestMatchId);

    if (!latestMatch || latestMatch.status !== 'scheduled') {
      closeRescheduleRequest();
    }
  }, [matches, rescheduleRequestMatchId]);

  useEffect(() => {
    if (!scheduledConfirmation) {
      return;
    }

    const latestMatch = matches.find((match) => match.id === scheduledConfirmation.matchId);

    if (!latestMatch) {
      closeScheduledConfirmation();
      return;
    }

    if (
      ((scheduledConfirmation.type === 'accept-cancellation' ||
        scheduledConfirmation.type === 'keep-scheduled') &&
        latestMatch.status !== 'cancellation_requested') ||
      ((scheduledConfirmation.type === 'accept-reschedule' ||
        scheduledConfirmation.type === 'keep-reschedule') &&
        (latestMatch.status !== 'scheduled' ||
          !latestMatch.reschedule_requested_by ||
          Boolean(latestMatch.reschedule_approved_at))) ||
      (scheduledConfirmation.type === 'submit-winner' && latestMatch.status !== 'scheduled')
    ) {
      closeScheduledConfirmation();
    }
  }, [matches, scheduledConfirmation]);

  function openCancellationRequest(match: Match) {
    setCancellationRequest({ matchId: match.id, step: 'confirm' });
    setCancellationReason('');
    setCancellationReasonError('');
  }

  function closeCancellationRequest() {
    setCancellationRequest(null);
    setCancellationReason('');
    setCancellationReasonError('');
  }

  function openRescheduleRequest(match: Match) {
    setRescheduleRequestMatchId(match.id);
    setRescheduleReason(match.reschedule_reason ?? '');
  }

  function closeRescheduleRequest() {
    setRescheduleRequestMatchId(null);
    setRescheduleReason('');
  }

  function showCancellationReasonForm() {
    if (!cancellationRequest) {
      return;
    }

    setCancellationRequest({
      matchId: cancellationRequest.matchId,
      step: 'reason',
    });
    setCancellationReasonError('');
  }

  async function submitCancellationReason(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!cancellationMatch) {
      closeCancellationRequest();
      return;
    }

    const trimmedReason = cancellationReason.trim();

    if (!trimmedReason) {
      setCancellationReasonError('Enter a short reason before requesting cancellation.');
      return;
    }

    await onRequestCancellation(cancellationMatch, trimmedReason);
    closeCancellationRequest();
  }

  async function submitRescheduleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!rescheduleRequestMatch) {
      closeRescheduleRequest();
      return;
    }

    await onRequestReschedule(rescheduleRequestMatch, rescheduleReason);
    closeRescheduleRequest();
  }

  function closeScheduledConfirmation() {
    setScheduledConfirmation(null);
  }

  function openKeepScheduledConfirmation(match: Match) {
    setScheduledConfirmation({ matchId: match.id, type: 'keep-scheduled' });
  }

  function openAcceptRescheduleConfirmation(match: Match) {
    setScheduledConfirmation({ matchId: match.id, type: 'accept-reschedule' });
  }

  function openAcceptCancellationConfirmation(match: Match) {
    setScheduledConfirmation({ matchId: match.id, type: 'accept-cancellation' });
  }

  function openKeepRescheduleConfirmation(match: Match) {
    setScheduledConfirmation({ matchId: match.id, type: 'keep-reschedule' });
  }

  function openSubmitWinnerConfirmation(match: Match, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!winnerDrafts[match.id]?.winnerId) {
      return;
    }

    setScheduledConfirmation({ matchId: match.id, type: 'submit-winner' });
  }

  async function confirmScheduledAction() {
    const pendingConfirmation = scheduledConfirmation;
    const pendingMatch = scheduledConfirmationMatch;
    closeScheduledConfirmation();

    if (!pendingConfirmation || !pendingMatch) {
      return;
    }

    if (pendingConfirmation.type === 'keep-scheduled') {
      await onKeepScheduled(pendingMatch);
      return;
    }

    if (pendingConfirmation.type === 'keep-reschedule') {
      await onKeepScheduledAfterRescheduleRequest(pendingMatch);
      return;
    }

    if (pendingConfirmation.type === 'accept-cancellation') {
      await onAcceptCancellation(pendingMatch);
      return;
    }

    if (pendingConfirmation.type === 'accept-reschedule') {
      await onAcceptRescheduleRequest(pendingMatch);
      return;
    }

    await onSubmitWinner(pendingMatch);
  }

  return (
    <section
      className={`${sectionClass} ${hasScheduledActionNeeded ? 'match-update-glow' : ''}`}
      id="scheduled-matches"
    >
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
              className={`rounded-2xl border border-line-200 bg-white p-4 shadow-sm sm:p-5 ${
                isMatchActionNeeded(match, currentPlayer) ? 'match-update-glow' : ''
              }`}
              key={match.id}
            >
              {(() => {
                const isRequestingNewTimes = reschedulingMatchIds.has(match.id);
                const isCancellationRequested = match.status === 'cancellation_requested';
                const isCancellationRequester =
                  match.cancellation_requested_by === currentPlayer.id;
                const cancellationRequesterName = match.cancellation_requested_by
                  ? getPlayerName(match.cancellation_requested_by, currentPlayer, playersById)
                  : 'A player';
                const hasPendingRescheduleRequest =
                  match.status === 'scheduled' &&
                  Boolean(match.reschedule_requested_by) &&
                  !match.reschedule_approved_at;
                const isRescheduleApproved =
                  match.status === 'scheduled' &&
                  Boolean(match.reschedule_requested_by) &&
                  Boolean(match.reschedule_approved_at);
                const isRescheduleRequester =
                  match.reschedule_requested_by === currentPlayer.id;
                const rescheduleRequesterName = match.reschedule_requested_by
                  ? getPlayerName(match.reschedule_requested_by, currentPlayer, playersById)
                  : 'A player';

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
                <StatusBadge label={getStatusLabel(match)} />
              </div>
              {isCancellationRequested && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                  <p className="text-sm font-black text-amber-950">
                    {isCancellationRequester
                      ? 'You requested to cancel this match.'
                      : `${cancellationRequesterName} requested to cancel this match.`}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-amber-900">
                    Reason: {match.cancellation_reason || 'No reason provided.'}
                  </p>
                  {isCancellationRequester ? (
                    <p className="mt-3 text-sm text-amber-900">
                      Waiting for your opponent to accept the cancellation or keep the match scheduled.
                    </p>
                  ) : (
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        onClick={() => openAcceptCancellationConfirmation(match)}
                        disabled={cancelingMatchId === match.id || actionId === match.id}
                      >
                        <XIcon />
                        {cancelingMatchId === match.id ? 'Canceling...' : 'Accept Cancellation'}
                      </button>
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-line-200 bg-white px-4 py-2.5 text-sm font-bold text-court-900 shadow-sm transition hover:border-court-500 hover:bg-court-50 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        onClick={() => openKeepScheduledConfirmation(match)}
                        disabled={actionId === match.id}
                      >
                        <CheckIcon />
                        Keep Match Scheduled
                      </button>
                    </div>
                  )}
                </div>
              )}
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
              {hasPendingRescheduleRequest && !isCancellationRequested && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                  <p className="text-sm font-black text-amber-950">
                    {isRescheduleRequester
                      ? 'You requested a new match time.'
                      : `${rescheduleRequesterName} requested a new match time.`}
                  </p>
                  {match.reschedule_reason && (
                    <p className="mt-2 text-sm font-semibold text-amber-900">
                      Reason: {match.reschedule_reason}
                    </p>
                  )}
                  {isRescheduleRequester ? (
                    <p className="mt-3 text-sm text-amber-900">
                      Waiting for your opponent to accept the reschedule request or keep the match scheduled.
                    </p>
                  ) : (
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-court-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-court-700 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        onClick={() => openAcceptRescheduleConfirmation(match)}
                        disabled={actionId === match.id}
                      >
                        <CheckIcon />
                        Accept Reschedule Request
                      </button>
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-line-200 bg-white px-4 py-2.5 text-sm font-bold text-court-900 shadow-sm transition hover:border-court-500 hover:bg-court-50 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        onClick={() => openKeepRescheduleConfirmation(match)}
                        disabled={actionId === match.id}
                      >
                        <CheckIcon />
                        Keep Match Scheduled
                      </button>
                    </div>
                  )}
                </div>
              )}
              {(isRequestingNewTimes || isRescheduleApproved) && !isCancellationRequested && (
                <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-ink-900">
                        {isRescheduleApproved ? 'Reschedule approved' : 'New times requested'}
                      </p>
                      <p className="mt-1 text-sm text-ink-700">
                        The scheduled time stays visible until you submit replacement options.
                      </p>
                    </div>
                    {!isRescheduleApproved && (
                      <button
                        className="inline-flex items-center justify-center rounded-full border border-line-200 bg-white px-4 py-2 text-sm font-bold text-court-900 shadow-sm transition hover:border-court-500 hover:bg-court-50"
                        type="button"
                        onClick={() => onCancelReschedule(match.id)}
                      >
                        Back to Proposed Times
                      </button>
                    )}
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
              {!isCancellationRequested && (
              <form
                className="mt-4 rounded-xl border border-line-200 bg-white p-4"
                onSubmit={(event) => openSubmitWinnerConfirmation(match, event)}
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
              )}
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                {!isCancellationRequested && (
                  <>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-line-200 bg-white px-4 py-2.5 text-sm font-bold text-court-900 shadow-sm transition hover:border-court-500 hover:bg-court-50 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={() => openRescheduleRequest(match)}
                  disabled={
                    actionId === match.id ||
                    isRequestingNewTimes ||
                    hasPendingRescheduleRequest ||
                    isRescheduleApproved
                  }
                >
                  <ClockIcon />
                  Request New Time
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-red-300 bg-white px-4 py-2.5 text-sm font-bold text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={() => openCancellationRequest(match)}
                  disabled={cancelingMatchId === match.id || actionId === match.id}
                >
                  <XIcon />
                  {cancelingMatchId === match.id ? 'Requesting...' : 'Request Cancellation'}
                </button>
                  </>
                )}
              </div>
                  </>
                );
              })()}
            </div>
          ))}
        </div>
      )}
      {cancellationRequest && cancellationMatch && (
        <CancellationRequestDialog
          actionId={actionId}
          cancelingMatchId={cancelingMatchId}
          currentPlayer={currentPlayer}
          errorMessage={cancellationReasonError}
          match={cancellationMatch}
          playersById={playersById}
          reason={cancellationReason}
          step={cancellationRequest.step}
          onCancel={closeCancellationRequest}
          onConfirm={showCancellationReasonForm}
          onReasonChange={(value) => {
            setCancellationReason(value);
            setCancellationReasonError('');
          }}
          onSubmit={submitCancellationReason}
        />
      )}
      {rescheduleRequestMatch && (
        <RescheduleRequestDialog
          actionId={actionId}
          match={rescheduleRequestMatch}
          reason={rescheduleReason}
          onCancel={closeRescheduleRequest}
          onReasonChange={setRescheduleReason}
          onSubmit={submitRescheduleRequest}
        />
      )}
      {scheduledConfirmation && scheduledConfirmationMatch && (
        <ActionConfirmationDialog
          cancelLabel="Go Back"
          confirmLabel={
            scheduledConfirmation.type === 'accept-cancellation'
              ? 'Accept Cancellation'
              : scheduledConfirmation.type === 'accept-reschedule'
              ? 'Accept Reschedule'
              : scheduledConfirmation.type === 'keep-reschedule'
              ? 'Keep Match Scheduled'
              : scheduledConfirmation.type === 'keep-scheduled'
              ? 'Keep Match Scheduled'
              : 'Submit Winner'
          }
          message={
            scheduledConfirmation.type === 'accept-cancellation'
              ? 'Accept the cancellation request and cancel this match.'
              : scheduledConfirmation.type === 'accept-reschedule'
              ? 'Accept the reschedule request and allow new match times to be proposed.'
              : scheduledConfirmation.type === 'keep-reschedule'
              ? 'Decline the reschedule request and keep the original match time.'
              : scheduledConfirmation.type === 'keep-scheduled'
              ? 'Decline the cancellation request and keep this match scheduled.'
              : `Submit this result and update the match record. Winner: ${scheduledConfirmationWinnerName}.`
          }
          title={
            scheduledConfirmation.type === 'accept-cancellation'
              ? 'Accept cancellation?'
              : scheduledConfirmation.type === 'accept-reschedule'
              ? 'Accept reschedule request?'
              : scheduledConfirmation.type === 'keep-reschedule'
              ? 'Keep original match time?'
              : scheduledConfirmation.type === 'keep-scheduled'
              ? 'Keep match scheduled?'
              : 'Submit winner?'
          }
          tone={scheduledConfirmation.type === 'accept-cancellation' ? 'danger' : 'default'}
          onCancel={closeScheduledConfirmation}
          onConfirm={confirmScheduledAction}
        />
      )}
    </section>
  );
}

function CancellationRequestDialog({
  actionId,
  cancelingMatchId,
  currentPlayer,
  errorMessage,
  match,
  playersById,
  reason,
  step,
  onCancel,
  onConfirm,
  onReasonChange,
  onSubmit,
}: {
  actionId: string | null;
  cancelingMatchId: string | null;
  currentPlayer: RankedPlayer;
  errorMessage: string;
  match: Match;
  playersById: Map<string, RankedPlayer>;
  reason: string;
  step: 'confirm' | 'reason';
  onCancel: () => void;
  onConfirm: () => void;
  onReasonChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isSubmitting = cancelingMatchId === match.id || actionId === match.id;
  const opponentName = getOpponentName(match, currentPlayer, playersById);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancellation-request-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-line-200 bg-white p-5 shadow-2xl">
        {step === 'confirm' ? (
          <>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-red-700">
              Request Cancellation
            </p>
            <h3
              className="mt-2 text-xl font-black text-ink-900"
              id="cancellation-request-title"
            >
              Ask to cancel this match?
            </h3>
            <p className="mt-3 text-sm font-semibold leading-6 text-ink-700">
              Your match with {opponentName} will stay scheduled unless the other
              player accepts the request.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="inline-flex items-center justify-center rounded-full border border-line-200 bg-white px-4 py-2.5 text-sm font-bold text-court-900 shadow-sm transition hover:border-court-500 hover:bg-court-50"
                type="button"
                onClick={onCancel}
              >
                No, Keep Match
              </button>
              <button
                className="inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-700"
                type="button"
                onClick={onConfirm}
              >
                Yes, Continue
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-red-700">
              Cancellation Reason
            </p>
            <h3
              className="mt-2 text-xl font-black text-ink-900"
              id="cancellation-request-title"
            >
              Add a short reason
            </h3>
            <label className="mt-4 block">
              <span className="text-sm font-bold text-ink-700">Reason</span>
              <textarea
                className="mt-2 min-h-24 w-full rounded-xl border border-line-200 bg-white px-3 py-2 text-sm font-semibold text-ink-900 outline-none transition focus:border-court-500 focus:ring-2 focus:ring-court-100"
                value={reason}
                maxLength={240}
                onChange={(event) => onReasonChange(event.target.value)}
                placeholder="Example: I have a schedule conflict."
              />
            </label>
            {errorMessage && (
              <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                {errorMessage}
              </p>
            )}
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="inline-flex items-center justify-center rounded-full border border-line-200 bg-white px-4 py-2.5 text-sm font-bold text-court-900 shadow-sm transition hover:border-court-500 hover:bg-court-50 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                className="inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function RescheduleRequestDialog({
  actionId,
  match,
  reason,
  onCancel,
  onReasonChange,
  onSubmit,
}: {
  actionId: string | null;
  match: Match;
  reason: string;
  onCancel: () => void;
  onReasonChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isSubmitting = actionId === match.id;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reschedule-request-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-line-200 bg-white p-5 shadow-2xl">
        <form onSubmit={onSubmit}>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-court-700">
            Request New Time
          </p>
          <h3 className="mt-2 text-xl font-black text-ink-900" id="reschedule-request-title">
            Ask to reschedule?
          </h3>
          <p className="mt-3 text-sm font-semibold leading-6 text-ink-700">
            The current match time stays scheduled unless your opponent accepts.
          </p>
          <label className="mt-4 block">
            <span className="text-sm font-bold text-ink-700">Reason optional</span>
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-line-200 bg-white px-3 py-2 text-sm font-semibold text-ink-900 outline-none transition focus:border-court-500 focus:ring-2 focus:ring-court-100"
              value={reason}
              maxLength={240}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Example: I have a schedule conflict."
            />
          </label>
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              className="inline-flex items-center justify-center rounded-full border border-line-200 bg-white px-4 py-2.5 text-sm font-bold text-court-900 shadow-sm transition hover:border-court-500 hover:bg-court-50 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Go Back
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full bg-court-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-court-700 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Sending...' : 'Send Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ActionConfirmationDialog({
  cancelLabel = 'Go Back',
  confirmLabel,
  message,
  title,
  tone = 'default',
  onCancel,
  onConfirm,
}: {
  cancelLabel?: string;
  confirmLabel: string;
  message: string;
  title: string;
  tone?: 'default' | 'danger';
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const confirmClass =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700'
      : 'bg-court-500 hover:bg-court-700';

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-confirmation-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-line-200 bg-white p-5 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-court-700">
          Confirm Action
        </p>
        <h3
          className="mt-2 text-xl font-black text-ink-900"
          id="action-confirmation-title"
        >
          {title}
        </h3>
        <p className="mt-3 text-sm font-semibold leading-6 text-ink-700">
          {message}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="inline-flex items-center justify-center rounded-full border border-line-200 bg-white px-4 py-2.5 text-sm font-bold text-court-900 shadow-sm transition hover:border-court-500 hover:bg-court-50"
            type="button"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={`inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-bold text-white shadow-sm transition ${confirmClass}`}
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
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
  const sortedMatches = [...matches].sort(compareCompletedMatches);

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
          {sortedMatches.map((match, index) => (
            <article
              className="rounded-lg border border-line-200 bg-white p-5 shadow-sm"
              key={match.id}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="mb-1 text-xs font-black uppercase tracking-[0.14em] text-court-700">
                    Match {index + 1}
                  </p>
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

function compareCompletedMatches(first: Match, second: Match) {
  return getCompletedMatchTime(second) - getCompletedMatchTime(first);
}

function getCompletedMatchTime(match: Match) {
  return new Date(match.proposed_match_at ?? match.created_at).getTime();
}

function CanceledMatchCard({
  currentPlayer,
  match,
  playersById,
}: {
  currentPlayer: RankedPlayer;
  match: Match;
  playersById: Map<string, RankedPlayer>;
}) {
  return (
    <div className="rounded-lg border border-line-200 bg-white p-5 text-ink-700 shadow-sm">
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
          href="mailto:teniss@rotonpoint.org"
        >
          <MailIcon />
          teniss@rotonpoint.org
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

function AdminPreviewMatchSection({
  matches,
  playersById,
  sectionClass,
  title,
}: {
  matches: Match[];
  playersById: Map<string, RankedPlayer>;
  sectionClass: string;
  title: string;
}) {
  return (
    <section className={sectionClass}>
      <SectionHeader
        icon={<MatchIcon />}
        title={title}
        description="Preview of what players see in this area."
      />
      {matches.length === 0 ? (
        <EmptyState message={`No ${title.toLowerCase()} to preview.`} />
      ) : (
        <div className="mt-5 space-y-3">
          {matches.slice(0, 5).map((match) => (
            <article
              className="rounded-2xl border border-line-200 bg-white p-4 shadow-sm"
              key={match.id}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-black text-ink-900">
                    {getPlayerName(match.challenger_id, null, playersById)} vs{' '}
                    {getPlayerName(match.opponent_id, null, playersById)}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink-700">
                    {formatScheduledMatchTime(match)}
                  </p>
                </div>
                <StatusBadge label={getStatusLabel(match)} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
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
  const pyramidContentRef = useRef<HTMLDivElement | null>(null);
  const initialMobileCenterRef = useRef<string | null>(null);
  const pinchZoomRef = useRef<{ distance: number; zoom: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pyramidContentSize, setPyramidContentSize] = useState({ height: 0, width: 0 });
  const minZoom = 0.5;
  const maxZoom = 1.45;
  const zoomStep = 0.1;
  const cardWidth = '10rem';
  const cardMinHeight = '10.5rem';
  const rowGap = '1.25rem';
  const cardGap = '0.75rem';
  const hasMeasuredPyramidContent =
    pyramidContentSize.height > 0 && pyramidContentSize.width > 0;
  const pyramidSizerStyle = hasMeasuredPyramidContent
    ? {
        height: `${pyramidContentSize.height * zoom}px`,
        width: `${pyramidContentSize.width * zoom}px`,
      }
    : undefined;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!window.matchMedia('(max-width: 767px)').matches) {
      return;
    }

    const centerKey = currentPlayer?.id ?? 'pyramid-middle';

    if (initialMobileCenterRef.current === centerKey) {
      return;
    }

    if (!currentPlayer && initialMobileCenterRef.current) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      centerPyramidView('auto');
      initialMobileCenterRef.current = centerKey;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [currentPlayer?.id, players.length]);

  useEffect(() => {
    const contentElement = pyramidContentRef.current;

    if (!contentElement) {
      return undefined;
    }

    function updatePyramidContentSize() {
      const measuredContent = pyramidContentRef.current;

      if (!measuredContent) {
        return;
      }

      setPyramidContentSize((current) => {
        const nextSize = {
          height: measuredContent.offsetHeight,
          width: measuredContent.offsetWidth,
        };

        if (current.height === nextSize.height && current.width === nextSize.width) {
          return current;
        }

        return nextSize;
      });
    }

    updatePyramidContentSize();

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(updatePyramidContentSize);
    resizeObserver.observe(contentElement);

    return () => resizeObserver.disconnect();
  }, [players.length, showActions]);

  function clampZoom(nextZoom: number) {
    return Math.min(maxZoom, Math.max(minZoom, Number(nextZoom.toFixed(2))));
  }

  function getContainerCenterPoint() {
    const container = scrollContainerRef.current;

    if (!container) {
      return null;
    }

    const rect = container.getBoundingClientRect();

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function setZoomAroundPoint(nextZoom: number, anchorClientX?: number, anchorClientY?: number) {
    const container = scrollContainerRef.current;

    setZoom((current) => {
      const clampedZoom = clampZoom(nextZoom);

      if (!container || clampedZoom === current) {
        return clampedZoom;
      }

      const rect = container.getBoundingClientRect();
      const anchorOffsetX =
        typeof anchorClientX === 'number' ? anchorClientX - rect.left : rect.width / 2;
      const anchorOffsetY =
        typeof anchorClientY === 'number' ? anchorClientY - rect.top : rect.height / 2;
      const anchorScrollX = container.scrollLeft + anchorOffsetX;
      const anchorScrollY = container.scrollTop + anchorOffsetY;
      const zoomRatio = clampedZoom / current;

      window.requestAnimationFrame(() => {
        container.scrollTo({
          left: Math.max(0, anchorScrollX * zoomRatio - anchorOffsetX),
          top: Math.max(0, anchorScrollY * zoomRatio - anchorOffsetY),
          behavior: 'auto',
        });
      });

      return clampedZoom;
    });
  }

  function adjustZoom(delta: number) {
    const centerPoint = getContainerCenterPoint();
    setZoomAroundPoint(
      zoom + delta,
      centerPoint?.x,
      centerPoint?.y,
    );
  }

  function zoomIn() {
    adjustZoom(zoomStep);
  }

  function zoomOut() {
    adjustZoom(-zoomStep);
  }

  function resetZoom() {
    const centerPoint = getContainerCenterPoint();
    setZoomAroundPoint(1, centerPoint?.x, centerPoint?.y);
  }

  function centerPyramidView(behavior: ScrollBehavior = 'smooth') {
    const container = scrollContainerRef.current;
    const currentCard = container?.querySelector<HTMLElement>('[data-current-player="true"]');

    if (!container) {
      return;
    }

    if (!currentCard) {
      container.scrollTo({
        left: Math.max(0, (container.scrollWidth - container.clientWidth) / 2),
        top: 0,
        behavior,
      });
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
      behavior,
    });
  }

  function centerOnMyPosition() {
    centerPyramidView('smooth');
  }

  function getTouchDistance(touches: TouchEvent<HTMLDivElement>['touches']) {
    const firstTouch = touches.item(0);
    const secondTouch = touches.item(1);

    if (!firstTouch || !secondTouch) {
      return 0;
    }

    return Math.hypot(
      secondTouch.clientX - firstTouch.clientX,
      secondTouch.clientY - firstTouch.clientY,
    );
  }

  function getTouchCenter(touches: TouchEvent<HTMLDivElement>['touches']) {
    const firstTouch = touches.item(0);
    const secondTouch = touches.item(1);

    if (!firstTouch || !secondTouch) {
      return null;
    }

    return {
      x: (firstTouch.clientX + secondTouch.clientX) / 2,
      y: (firstTouch.clientY + secondTouch.clientY) / 2,
    };
  }

  function handlePyramidWheel(event: {
    ctrlKey: boolean;
    metaKey: boolean;
    deltaY: number;
    clientX: number;
    clientY: number;
    preventDefault: () => void;
  }) {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();

    setZoom((current) => {
      const nextZoom = clampZoom(current * (event.deltaY < 0 ? 1.08 : 0.92));
      const container = scrollContainerRef.current;

      if (!container || nextZoom === current) {
        return nextZoom;
      }

      const rect = container.getBoundingClientRect();
      const anchorOffsetX = event.clientX - rect.left;
      const anchorOffsetY = event.clientY - rect.top;
      const anchorScrollX = container.scrollLeft + anchorOffsetX;
      const anchorScrollY = container.scrollTop + anchorOffsetY;
      const zoomRatio = nextZoom / current;

      window.requestAnimationFrame(() => {
        container.scrollTo({
          left: Math.max(0, anchorScrollX * zoomRatio - anchorOffsetX),
          top: Math.max(0, anchorScrollY * zoomRatio - anchorOffsetY),
          behavior: 'auto',
        });
      });

      return nextZoom;
    });
  }

  function handlePyramidTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 2) {
      pinchZoomRef.current = null;
      return;
    }

    pinchZoomRef.current = {
      distance: getTouchDistance(event.touches),
      zoom,
    };
  }

  function handlePyramidTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 2 || !pinchZoomRef.current) {
      return;
    }

    const startDistance = pinchZoomRef.current.distance;

    if (startDistance <= 0) {
      return;
    }

    const currentDistance = getTouchDistance(event.touches);
    const touchCenter = getTouchCenter(event.touches);

    if (!touchCenter) {
      return;
    }

    event.preventDefault();
    setZoomAroundPoint(
      pinchZoomRef.current.zoom * (currentDistance / startDistance),
      touchCenter.x,
      touchCenter.y,
    );
  }

  function handlePyramidTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length < 2) {
      pinchZoomRef.current = null;
    }
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
          Find My Rank
        </button>
        <span className="rounded-full border border-line-200 bg-white px-4 py-2 text-sm font-bold text-ink-700 shadow-sm">
          {Math.round(zoom * 100)}%
        </span>
      </div>
      <div
        className="h-[70svh] overflow-auto overscroll-contain rounded-[1.6rem] border border-line-200 bg-white/70 px-3 py-5 shadow-inner scroll-smooth [-webkit-overflow-scrolling:touch] sm:px-5 sm:py-6 lg:px-6"
        onTouchCancel={handlePyramidTouchEnd}
        onTouchEnd={handlePyramidTouchEnd}
        onTouchMove={handlePyramidTouchMove}
        onTouchStart={handlePyramidTouchStart}
        onWheel={handlePyramidWheel}
        ref={scrollContainerRef}
        style={{ touchAction: 'pan-x pan-y' }}
      >
        <div
          className={`mx-auto ${
            hasMeasuredPyramidContent ? 'relative' : 'flex w-max flex-col items-center'
          }`}
          style={pyramidSizerStyle}
        >
          <div
            className={`flex w-max flex-col items-center px-2 pb-8 ${
              hasMeasuredPyramidContent ? 'absolute left-0 top-0' : ''
            }`}
            ref={pyramidContentRef}
            style={{
              gap: rowGap,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
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
    Pending: 'border-amber-300 bg-amber-50 text-amber-800',
    Accepted: 'border-blue-200 bg-blue-50 text-blue-800',
    'Time Proposed': 'border-emerald-200 bg-emerald-50 text-emerald-800',
    Scheduled: 'border-emerald-300 bg-emerald-600 text-white',
    'Cancellation Requested': 'border-amber-300 bg-amber-50 text-amber-800',
    Completed: 'border-slate-200 bg-slate-100 text-slate-700',
    Canceled: 'border-red-200 bg-red-50 text-red-700',
    Disputed: 'border-red-300 bg-red-100 text-red-800',
    Declined: 'border-slate-200 bg-slate-50 text-slate-700',
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
  onPropose: (match: Match) => void | Promise<void>;
}) {
  const [isConfirmingReplacement, setIsConfirmingReplacement] = useState(false);
  const needsReplacementConfirmation =
    match.proposed_match_options.length > 0 || match.status === 'scheduled';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (needsReplacementConfirmation) {
      setIsConfirmingReplacement(true);
      return;
    }

    void onPropose(match);
  }

  async function confirmReplacement() {
    setIsConfirmingReplacement(false);
    await onPropose(match);
  }

  function clearProposalDraft(index: number) {
    onProposalChange(match.id, index, { date: '', slotId: '' });
  }

  return (
    <form className="mt-4 rounded-2xl border border-line-200 bg-white p-4" onSubmit={handleSubmit}>
      <div>
        <p className="text-sm font-bold text-ink-900">Propose up to 3 match times</p>
        <p className="mt-1 text-sm text-ink-700">
          Select a date and one 90-minute club slot. Submitting new times replaces the previous proposed times.
        </p>
      </div>
      <div className="mt-4 grid gap-3">
        {proposalDrafts.map((proposal, index) => (
          <div
            className="min-w-0 rounded-xl border border-line-200 bg-court-50/60 p-3"
            key={index}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-ink-700">
                Option {index + 1}
              </p>
              <button
                className="inline-flex shrink-0 items-center justify-center rounded-full border border-line-200 bg-white px-3 py-1.5 text-xs font-bold text-court-900 shadow-sm transition hover:border-court-500 hover:bg-court-50 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                onClick={() => clearProposalDraft(index)}
                disabled={actionId === match.id || (!proposal.date && !proposal.slotId)}
              >
                Clear
              </button>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
              <label className="block min-w-0">
                <span className="text-xs font-bold uppercase text-ink-700">Date</span>
                <input
                  className="mt-1 block h-11 w-full min-w-0 max-w-full appearance-none rounded-lg border border-line-200 bg-white px-3 py-2 text-sm font-semibold text-ink-900 outline-none focus:border-court-500 focus:ring-2 focus:ring-court-100"
                  min={getTodayInputDate()}
                  type="date"
                  value={proposal.date}
                  onChange={(event) =>
                    onProposalChange(match.id, index, { date: event.target.value })
                  }
                />
              </label>
              <label className="block min-w-0">
                <span className="text-xs font-bold uppercase text-ink-700">Time Slot</span>
                <select
                  className="mt-1 block h-11 w-full min-w-0 max-w-full rounded-lg border border-line-200 bg-white px-3 py-2 text-sm font-semibold text-ink-900 outline-none focus:border-court-500 focus:ring-2 focus:ring-court-100"
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
      {isConfirmingReplacement && (
        <ActionConfirmationDialog
          cancelLabel="Go Back"
          confirmLabel="Replace Times"
          message="Replace the previous proposed times with these new options?"
          title="Replace proposed times?"
          onCancel={() => setIsConfirmingReplacement(false)}
          onConfirm={confirmReplacement}
        />
      )}
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
  const [pendingChallengeConfirmation, setPendingChallengeConfirmation] = useState<
    'accept' | 'decline' | 'cancel' | null
  >(null);
  const isChallenger = match.challenger_id === currentPlayer.id;
  const isOpponent = match.opponent_id === currentPlayer.id;
  const canManageTimeProposals = isChallenger || isOpponent;
  const statusLabel = getStatusLabel(match);
  const isSchedulingMatch =
    canManageTimeProposals &&
    (match.status === 'accepted' || match.status === 'time_proposed');
  const isTimeProposer = match.proposed_by_player_id === currentPlayer.id;
  const isCanceling = cancelingMatchId === match.id;
  const canCancel = CANCELABLE_MATCH_STATUSES.includes(match.status);
  const opponentName = getOpponentName(match, currentPlayer, playersById);
  const hasProposedTimes = match.proposed_match_options.length > 0;
  const shouldShowProposalForm = !hasProposedTimes || isRequestingNewTimes;
  const needsAction = isMatchActionNeeded(match, currentPlayer);
  const pendingChallengeTitle =
    pendingChallengeConfirmation === 'accept'
      ? 'Accept challenge?'
      : pendingChallengeConfirmation === 'decline'
        ? 'Decline challenge?'
        : 'Cancel match?';
  const pendingChallengeMessage =
    pendingChallengeConfirmation === 'accept'
      ? `Accept ${opponentName}'s challenge and start setting up a match time.`
      : pendingChallengeConfirmation === 'decline'
        ? `Decline ${opponentName}'s challenge? This match will leave your active challenges.`
        : 'Cancel this match? This removes it from active challenges and scheduled matches.';

  async function confirmChallengeAction() {
    const nextAction = pendingChallengeConfirmation;
    setPendingChallengeConfirmation(null);

    if (nextAction === 'accept') {
      await onAccept();
      return;
    }

    if (nextAction === 'decline') {
      await onDecline();
      return;
    }

    if (nextAction === 'cancel') {
      await onCancel();
    }
  }

  return (
    <article
      className={`rounded-2xl border border-line-200 bg-white p-4 shadow-sm sm:p-5 ${
        needsAction ? 'match-update-glow' : ''
      }`}
    >
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
            onClick={() => setPendingChallengeConfirmation('accept')}
            disabled={actionId === match.id || hasOtherActiveMatch}
          >
            <CheckIcon />
            Accept
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => setPendingChallengeConfirmation('decline')}
            disabled={actionId === match.id}
          >
            <XIcon />
            Decline
          </button>
        </div>
      )}

      {pendingChallengeConfirmation && (
        <ActionConfirmationDialog
          cancelLabel="Go Back"
          confirmLabel={
            pendingChallengeConfirmation === 'accept'
              ? 'Accept Challenge'
              : pendingChallengeConfirmation === 'decline'
                ? 'Decline Challenge'
                : 'Cancel Match'
          }
          message={pendingChallengeMessage}
          title={pendingChallengeTitle}
          tone={pendingChallengeConfirmation === 'accept' ? 'default' : 'danger'}
          onCancel={() => setPendingChallengeConfirmation(null)}
          onConfirm={confirmChallengeAction}
        />
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

          {canManageTimeProposals && shouldShowProposalForm && (
            <TimeProposalForm
              actionId={actionId}
              match={match}
              proposalDrafts={proposalDrafts}
              onProposalChange={(_, index, nextDraft) => onProposalChange(index, nextDraft)}
              onPropose={() => onPropose()}
            />
          )}

          {canManageTimeProposals && hasProposedTimes && !isRequestingNewTimes && (
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
            onClick={() => setPendingChallengeConfirmation('cancel')}
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

function AdminPreviewIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 3 5 6v5c0 4.6 2.9 8.4 7 10 4.1-1.6 7-5.4 7-10V6l-7-3Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path d="M9 12h6M12 9v6" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
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

function getDashboardMatchSummary(
  match: Match | null,
  currentPlayer: RankedPlayer | null,
  playersById: Map<string, RankedPlayer>,
) {
  if (!match || !currentPlayer) {
    return {
      actionLabel: 'View Activities',
      description: 'No match is blocking you right now.',
      title: 'No active match',
    };
  }

  const opponentName = getOpponentName(match, currentPlayer, playersById);

  if (match.status === 'pending') {
    return {
      actionLabel: match.challenger_id === currentPlayer.id ? 'View Match' : 'Respond',
      description:
        match.challenger_id === currentPlayer.id
          ? `Waiting for ${opponentName} to accept.`
          : `${opponentName} challenged you.`,
      title: 'Waiting for response',
    };
  }

  if (match.status === 'accepted') {
    return {
      actionLabel: 'Set Time',
      description: `Challenge with ${opponentName} is accepted.`,
      title: 'Challenge accepted',
    };
  }

  if (match.status === 'time_proposed') {
    const userNeedsToChoose = match.proposed_by_player_id !== currentPlayer.id;

    return {
      actionLabel: userNeedsToChoose ? 'Choose Time' : 'View Match',
      description: userNeedsToChoose
        ? `${opponentName} proposed match times.`
        : `Waiting for ${opponentName} to choose a time.`,
      title: userNeedsToChoose ? 'Time proposal needed' : 'Waiting for time selection',
    };
  }

  if (match.status === 'scheduled') {
    return {
      actionLabel: 'Open Match',
      description: formatScheduledMatchTime(match),
      title: 'Match scheduled',
    };
  }

  if (match.status === 'cancellation_requested') {
    const requesterName = match.cancellation_requested_by
      ? getPlayerName(match.cancellation_requested_by, currentPlayer, playersById)
      : opponentName;
    const currentUserRequested = match.cancellation_requested_by === currentPlayer.id;

    return {
      actionLabel: 'Review Match',
      description: currentUserRequested
        ? `Waiting for ${opponentName} to respond.`
        : `${requesterName} requested to cancel this match.`,
      title: 'Cancellation requested',
    };
  }

  return {
    actionLabel: 'View Activities',
    description: getStatusLabel(match),
    title: 'Match update',
  };
}

function isCurrentUserMatchPlayer(match: Match, currentUserId: string) {
  return match.challenger_id === currentUserId || match.opponent_id === currentUserId;
}

function getOtherPlayerId(match: Match, currentPlayerId: string) {
  return match.challenger_id === currentPlayerId ? match.opponent_id : match.challenger_id;
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
  currentPlayer: RankedPlayer | null,
  playersById: Map<string, RankedPlayer>,
) {
  if (!playerId) {
    return 'Not selected';
  }

  if (currentPlayer && playerId === currentPlayer.id) {
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

  if (match.status === 'declined') {
    return 'Declined';
  }

  if (match.status === 'disputed') {
    return 'Disputed';
  }

  if (match.status === 'expired') {
    return 'Expired';
  }

  if (match.status === 'scheduled') {
    return 'Scheduled';
  }

  if (match.status === 'cancellation_requested') {
    return 'Cancellation Requested';
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

function isMatchActionNeeded(match: Match, currentPlayer: RankedPlayer) {
  if (match.status === 'pending') {
    return match.opponent_id === currentPlayer.id;
  }

  if (match.status === 'accepted') {
    return true;
  }

  if (match.status === 'time_proposed') {
    return match.proposed_by_player_id !== currentPlayer.id;
  }

  if (match.status === 'scheduled') {
    return true;
  }

  if (match.status === 'cancellation_requested') {
    return match.cancellation_requested_by !== currentPlayer.id;
  }

  return false;
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

  if (match.status === 'cancellation_requested') {
    return 'Cancellation requested';
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
