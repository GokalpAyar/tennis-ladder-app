export type TournamentEventType = 'singles' | 'doubles';
export type TournamentDrawSize = 8 | 16 | 32;
export type TournamentSlotNumber = 1 | 2;

export type TournamentCategory = {
  created_at: string | null;
  display_order: number;
  draw_size: TournamentDrawSize;
  event_type: TournamentEventType;
  id: string;
  is_published: boolean;
  name: string;
  updated_at: string | null;
};

export type TournamentDrawSlot = {
  category_id: string;
  created_at: string | null;
  id: string;
  is_winner: boolean;
  match_number: number;
  participant_name: string | null;
  round_name: string;
  round_number: number;
  score: string | null;
  slot_number: TournamentSlotNumber;
  updated_at: string | null;
};

export type TournamentRoundSetting = {
  category_id: string;
  created_at: string | null;
  deadline_text: string | null;
  id: string;
  round_name: string;
  round_number: number;
  updated_at: string | null;
};

export type TournamentRoundSpec = {
  matchCount: number;
  roundName: string;
  roundNumber: number;
  startMatchNumber: number;
};

export type TournamentBracketSlot = {
  id?: string;
  is_winner: boolean;
  match_number: number;
  participant_name: string | null;
  round_name: string;
  round_number: number;
  score: string | null;
  slot_number: TournamentSlotNumber;
};

export type TournamentBracketMatch = {
  matchNumber: number;
  slots: [TournamentBracketSlot, TournamentBracketSlot];
};

export type TournamentBracketRound = {
  deadlineText: string;
  matches: TournamentBracketMatch[];
  roundName: string;
  roundNumber: number;
};

export const TOURNAMENT_DRAW_SIZES = [8, 16, 32] as const;

export function getRoundLabels(drawSize: TournamentDrawSize) {
  if (drawSize === 8) {
    return ['Quarterfinals', 'Semifinals', 'Final'];
  }

  if (drawSize === 16) {
    return ['Round of 16', 'Quarterfinals', 'Semifinals', 'Final'];
  }

  return ['Round of 32', 'Round of 16', 'Quarterfinals', 'Semifinals', 'Final'];
}

export function getTournamentCategoryStatus(category: TournamentCategory) {
  return category.is_published ? 'Published' : 'Draw coming soon';
}

export function formatTournamentEventType(eventType: TournamentEventType) {
  return eventType === 'singles' ? 'Singles' : 'Doubles';
}

export function toTournamentDrawSize(value: unknown): TournamentDrawSize {
  const numericValue = Number(value);

  return TOURNAMENT_DRAW_SIZES.includes(numericValue as TournamentDrawSize)
    ? (numericValue as TournamentDrawSize)
    : 8;
}

export function toTournamentEventType(value: unknown): TournamentEventType {
  return value === 'doubles' ? 'doubles' : 'singles';
}

export function getTournamentRoundSpecs(drawSize: TournamentDrawSize): TournamentRoundSpec[] {
  let startMatchNumber = 1;

  return getRoundLabels(drawSize).map((roundName, index) => {
    const matchCount = drawSize / 2 ** (index + 1);
    const roundSpec = {
      matchCount,
      roundName,
      roundNumber: index + 1,
      startMatchNumber,
    };

    startMatchNumber += matchCount;

    return roundSpec;
  });
}

export function buildTournamentBracketRounds({
  drawSize,
  roundSettings,
  slots,
}: {
  drawSize: TournamentDrawSize;
  roundSettings: TournamentRoundSetting[];
  slots: TournamentDrawSlot[];
}): TournamentBracketRound[] {
  const slotsByKey = new Map(
    slots.map((slot) => [getTournamentSlotKey(slot), slot]),
  );
  const roundSettingsByNumber = new Map(
    roundSettings.map((setting) => [setting.round_number, setting]),
  );

  return getTournamentRoundSpecs(drawSize).map((roundSpec) => ({
    deadlineText:
      roundSettingsByNumber.get(roundSpec.roundNumber)?.deadline_text?.trim() || 'TBD',
    matches: Array.from({ length: roundSpec.matchCount }, (_, matchIndex) => {
      const matchNumber = roundSpec.startMatchNumber + matchIndex;

      return {
        matchNumber,
        slots: [1, 2].map((slotNumber) => {
          const slot =
            slotsByKey.get(
              getTournamentSlotKey({
                match_number: matchNumber,
                round_number: roundSpec.roundNumber,
                slot_number: slotNumber as TournamentSlotNumber,
              }),
            ) ?? null;

          return {
            id: slot?.id,
            is_winner: Boolean(slot?.is_winner),
            match_number: matchNumber,
            participant_name: slot?.participant_name ?? null,
            round_name: roundSpec.roundName,
            round_number: roundSpec.roundNumber,
            score: slot?.score ?? null,
            slot_number: slotNumber as TournamentSlotNumber,
          };
        }) as [TournamentBracketSlot, TournamentBracketSlot],
      };
    }),
    roundName: roundSpec.roundName,
    roundNumber: roundSpec.roundNumber,
  }));
}

export function buildEmptyTournamentDrawSlots(
  categoryId: string,
  drawSize: TournamentDrawSize,
) {
  return getTournamentRoundSpecs(drawSize).flatMap((roundSpec) =>
    Array.from({ length: roundSpec.matchCount }, (_, matchIndex) => {
      const matchNumber = roundSpec.startMatchNumber + matchIndex;

      return [1, 2].map((slotNumber) => ({
        category_id: categoryId,
        is_winner: false,
        match_number: matchNumber,
        participant_name: null,
        round_name: roundSpec.roundName,
        round_number: roundSpec.roundNumber,
        score: null,
        slot_number: slotNumber as TournamentSlotNumber,
      }));
    }).flat(),
  );
}

export function buildEmptyTournamentRoundSettings(
  categoryId: string,
  drawSize: TournamentDrawSize,
) {
  return getTournamentRoundSpecs(drawSize).map((roundSpec) => ({
    category_id: categoryId,
    deadline_text: null,
    round_name: roundSpec.roundName,
    round_number: roundSpec.roundNumber,
  }));
}

export function getTournamentSlotKey({
  match_number,
  round_number,
  slot_number,
}: {
  match_number: number;
  round_number: number;
  slot_number: TournamentSlotNumber;
}) {
  return `${round_number}:${match_number}:${slot_number}`;
}
