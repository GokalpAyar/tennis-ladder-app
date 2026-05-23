export type ProfileStatus = 'pending' | 'approved' | 'rejected' | 'inactive' | null;

export type ProfileRow = {
  id: string;
  full_name: string | null;
  status: ProfileStatus;
};

export type RankedPlayer = {
  id: string;
  name: string;
  rankPosition: number;
  wins: number;
  losses: number;
};

export type RankingRow = {
  player_id: string;
  rank_position: number;
  wins: number | null;
  losses: number | null;
};

export type MatchStatus =
  | 'pending'
  | 'accepted'
  | 'time_proposed'
  | 'declined'
  | 'scheduled'
  | 'completed'
  | 'canceled'
  | 'disputed'
  | 'expired';

export type MatchLike = {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: MatchStatus;
};

export type MatchTimeProposal = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  startAt: string;
  endAt: string;
};

export type TimeProposalDraft = {
  date: string;
  slotId: string;
};

export type WinnerSubmissionUpdate = {
  score: null;
  status: 'completed';
  winner_id: string;
};

export const MAX_TIME_PROPOSALS = 3;

export const MATCH_TIME_SLOTS = [
  { id: '08:00', label: '8:00 AM - 9:30 AM', startTime: '08:00', endTime: '09:30' },
  { id: '09:30', label: '9:30 AM - 11:00 AM', startTime: '09:30', endTime: '11:00' },
  { id: '11:00', label: '11:00 AM - 12:30 PM', startTime: '11:00', endTime: '12:30' },
  { id: '12:30', label: '12:30 PM - 2:00 PM', startTime: '12:30', endTime: '14:00' },
  { id: '14:00', label: '2:00 PM - 3:30 PM', startTime: '14:00', endTime: '15:30' },
  { id: '15:30', label: '3:30 PM - 5:00 PM', startTime: '15:30', endTime: '17:00' },
  { id: '17:00', label: '5:00 PM - 6:30 PM', startTime: '17:00', endTime: '18:30' },
  { id: '18:30', label: '6:30 PM - 8:00 PM', startTime: '18:30', endTime: '20:00' },
] as const;

const blockingMatchStatuses = new Set<MatchStatus>([
  'pending',
  'accepted',
  'time_proposed',
  'scheduled',
]);

export function isBlockingMatchStatus(status: MatchStatus) {
  return blockingMatchStatuses.has(status);
}

export function playerHasBlockingMatch(
  matches: MatchLike[],
  playerId: string,
  excludedMatchId?: string,
) {
  return matches.some(
    (match) =>
      match.id !== excludedMatchId &&
      isBlockingMatchStatus(match.status) &&
      (match.challenger_id === playerId || match.opponent_id === playerId),
  );
}

export function getEligibleChallengePlayerIds(
  currentPlayer: RankedPlayer | null,
  players: RankedPlayer[],
) {
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
}

export function getEligibleChallengePlayers(
  currentPlayer: RankedPlayer | null,
  players: RankedPlayer[],
) {
  const eligiblePlayerIds = getEligibleChallengePlayerIds(currentPlayer, players);

  return players.filter((player) => eligiblePlayerIds.has(player.id));
}

export function canSendChallenge({
  currentPlayer,
  hasBlockingMatch,
  opponentId,
  players,
  profileStatus,
}: {
  currentPlayer: RankedPlayer | null;
  hasBlockingMatch: boolean;
  opponentId: string;
  players: RankedPlayer[];
  profileStatus: ProfileStatus;
}) {
  if (profileStatus !== 'approved') {
    return false;
  }

  if (!currentPlayer || hasBlockingMatch) {
    return false;
  }

  return getEligibleChallengePlayerIds(currentPlayer, players).has(opponentId);
}

export function buildRankedPlayers(rankingRows: RankingRow[], profileRows: ProfileRow[]) {
  const profilesById = new Map(profileRows.map((profile) => [profile.id, profile]));

  return rankingRows
    .map((ranking) => {
      const profile = profilesById.get(ranking.player_id);

      if (profile?.status !== 'approved') {
        return null;
      }

      return {
        id: ranking.player_id,
        name: profile.full_name ?? 'Unnamed player',
        rankPosition: ranking.rank_position,
        wins: ranking.wins ?? 0,
        losses: ranking.losses ?? 0,
      };
    })
    .filter((player): player is RankedPlayer => player !== null);
}

export function getDefaultTimeProposalDrafts(): TimeProposalDraft[] {
  return Array.from({ length: MAX_TIME_PROPOSALS }, () => ({
    date: '',
    slotId: '',
  }));
}

export function buildTimeProposals(
  drafts: TimeProposalDraft[],
  now = new Date(),
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

export function getWinnerSubmissionUpdate(winnerId: string): WinnerSubmissionUpdate {
  return {
    score: null,
    status: 'completed',
    winner_id: winnerId,
  };
}
