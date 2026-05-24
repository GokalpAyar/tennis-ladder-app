/// <reference path="../../test-node.d.ts" />

import { deepEqual, equal } from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MATCH_TIME_SLOTS,
  buildRankedPlayers,
  buildTimeProposals,
  canSendChallenge,
  getEligibleChallengePlayers,
  getWinnerSubmissionUpdate,
  playerHasBlockingMatch,
  type MatchLike,
  type RankedPlayer,
} from './challengeRules.js';

const players: RankedPlayer[] = Array.from({ length: 10 }, (_, index) => {
  const rank = index + 1;

  return {
    id: `player-${rank}`,
    losses: rank,
    name: `Player ${rank}`,
    rankPosition: rank,
    wins: 10 - rank,
  };
});

describe('challenge eligibility', () => {
  it('allows challenging only players ranked up to 3 spots above', () => {
    deepEqual(getEligibleChallengePlayers(players[9], players).map((player) => player.rankPosition), [
      7,
      8,
      9,
    ]);
    deepEqual(getEligibleChallengePlayers(players[4], players).map((player) => player.rankPosition), [
      2,
      3,
      4,
    ]);
    deepEqual(getEligibleChallengePlayers(players[0], players), []);
  });

  it('blocks pending users from challenging', () => {
    equal(
      canSendChallenge({
        currentPlayer: players[4],
        hasBlockingMatch: false,
        opponentId: 'player-4',
        players,
        profileStatus: 'pending',
      }),
      false,
    );
  });

  it('shows eligible players after a ranked player loads on the dashboard', () => {
    deepEqual(getEligibleChallengePlayers(players[5], players).map((player) => player.name), [
      'Player 3',
      'Player 4',
      'Player 5',
    ]);
  });
});

describe('one active match per player', () => {
  const matches: MatchLike[] = [
    { challenger_id: 'player-1', id: 'pending', opponent_id: 'player-2', status: 'pending' },
    { challenger_id: 'player-3', id: 'accepted', opponent_id: 'player-4', status: 'accepted' },
    {
      challenger_id: 'player-5',
      id: 'time-proposed',
      opponent_id: 'player-6',
      status: 'time_proposed',
    },
    { challenger_id: 'player-7', id: 'scheduled', opponent_id: 'player-8', status: 'scheduled' },
    {
      challenger_id: 'player-13',
      id: 'cancellation-requested',
      opponent_id: 'player-14',
      status: 'cancellation_requested',
    },
    { challenger_id: 'player-9', id: 'completed', opponent_id: 'player-10', status: 'completed' },
    { challenger_id: 'player-11', id: 'canceled', opponent_id: 'player-12', status: 'canceled' },
  ];

  it('treats pending, accepted, time proposed, scheduled, and cancellation requested as blocking', () => {
    equal(playerHasBlockingMatch(matches, 'player-1'), true);
    equal(playerHasBlockingMatch(matches, 'player-4'), true);
    equal(playerHasBlockingMatch(matches, 'player-6'), true);
    equal(playerHasBlockingMatch(matches, 'player-8'), true);
    equal(playerHasBlockingMatch(matches, 'player-14'), true);
  });

  it('does not count completed or canceled matches as active', () => {
    equal(playerHasBlockingMatch(matches, 'player-9'), false);
    equal(playerHasBlockingMatch(matches, 'player-12'), false);
  });
});

describe('time proposal slots', () => {
  it('uses fixed 90-minute slots from 8 AM through 8 PM', () => {
    equal(MATCH_TIME_SLOTS.length, 8);
    deepEqual(MATCH_TIME_SLOTS[0], {
      endTime: '09:30',
      id: '08:00',
      label: '8:00 AM - 9:30 AM',
      startTime: '08:00',
    });
    deepEqual(MATCH_TIME_SLOTS[MATCH_TIME_SLOTS.length - 1], {
      endTime: '20:00',
      id: '18:30',
      label: '6:30 PM - 8:00 PM',
      startTime: '18:30',
    });

    for (const slot of MATCH_TIME_SLOTS) {
      const start = new Date(`2099-01-01T${slot.startTime}`);
      const end = new Date(`2099-01-01T${slot.endTime}`);

      equal((end.getTime() - start.getTime()) / 60_000, 90);
    }
  });

  it('rejects duplicate proposed date/time slots', () => {
    const result = buildTimeProposals(
      [
        { date: '2099-01-10', slotId: '08:00' },
        { date: '2099-01-10', slotId: '08:00' },
      ],
      new Date('2099-01-01T08:00'),
    );

    deepEqual(result, {
      ok: false,
      message: 'Option 2: this date and time slot is already selected.',
    });
  });
});

describe('winner submission', () => {
  it('creates the expected completed-match update payload', () => {
    deepEqual(getWinnerSubmissionUpdate('winner-id'), {
      score: null,
      status: 'completed',
      winner_id: 'winner-id',
    });
  });
});

describe('inactive ladder players', () => {
  it('excludes inactive and pending users from active ladder players', () => {
    const rankedPlayers = buildRankedPlayers(
      [
        { losses: 0, player_id: 'approved', rank_position: 1, wins: 3 },
        { losses: 1, player_id: 'inactive', rank_position: 2, wins: 2 },
        { losses: 2, player_id: 'pending', rank_position: 3, wins: 1 },
      ],
      [
        { full_name: 'Approved Player', id: 'approved', status: 'approved' },
        { full_name: 'Inactive Player', id: 'inactive', status: 'inactive' },
        { full_name: 'Pending Player', id: 'pending', status: 'pending' },
      ],
    );

    deepEqual(rankedPlayers.map((player) => player.id), ['approved']);
  });

  it('keeps inactive users out of eligible challenge cards', () => {
    const rankedPlayers = buildRankedPlayers(
      [
        { losses: 0, player_id: 'rank-7', rank_position: 7, wins: 3 },
        { losses: 0, player_id: 'rank-8', rank_position: 8, wins: 3 },
        { losses: 0, player_id: 'rank-9', rank_position: 9, wins: 3 },
        { losses: 0, player_id: 'rank-10', rank_position: 10, wins: 3 },
      ],
      [
        { full_name: 'Inactive Seven', id: 'rank-7', status: 'inactive' },
        { full_name: 'Eight', id: 'rank-8', status: 'approved' },
        { full_name: 'Nine', id: 'rank-9', status: 'approved' },
        { full_name: 'Ten', id: 'rank-10', status: 'approved' },
      ],
    );
    const currentPlayer = rankedPlayers.find((player) => player.id === 'rank-10') ?? null;

    deepEqual(getEligibleChallengePlayers(currentPlayer, rankedPlayers).map((player) => player.id), [
      'rank-8',
      'rank-9',
    ]);
  });
});
