import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  buildEmptyTournamentDrawSlots,
  buildEmptyTournamentRoundSettings,
  buildTournamentBracketRounds,
  formatTournamentEventType,
  getTournamentRoundSpecs,
  getTournamentCategoryStatus,
  getTournamentSlotKey,
  toTournamentDrawSize,
  toTournamentEventType,
  TOURNAMENT_DRAW_SIZES,
  type TournamentBracketRound,
  type TournamentCategory,
  type TournamentDrawSlot,
  type TournamentDrawSize,
  type TournamentEventType,
  type TournamentRoundSetting,
} from '../features/tournaments/tournamentCategories';
import { supabase } from '../lib/supabase';

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: 'player' | 'admin' | null;
  status: 'pending' | 'approved' | 'rejected' | 'inactive' | null;
  tournament_status: string | null;
  wants_ladder: boolean | null;
  wants_tournaments: boolean | null;
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

type TournamentCategoryDraft = {
  draw_size: TournamentDrawSize;
  event_type: TournamentEventType;
  is_published: boolean;
  name: string;
};

type TournamentSlotDraft = {
  participant_name: string;
};

type TournamentDrawDraftPayload = {
  drawSize: TournamentDrawSize;
  roundDeadlineDrafts: Record<number, string>;
  slotDrafts: Record<string, TournamentSlotDraft>;
};

type TournamentDrawLocalDraft = TournamentDrawDraftPayload & {
  categoryId: string;
  savedAt: number;
};

type DrawSaveStatus = 'saved' | 'unsaved' | 'draft-saved';

type AdminSection =
  | 'pending'
  | 'accounts'
  | 'tournamentAccounts'
  | 'ladder'
  | 'matches'
  | 'categories'
  | 'draws'
  | 'settings';
type MatchFilter = 'active' | 'time' | 'scheduled' | 'completed' | 'canceled';

const tournamentDrawDraftStoragePrefix = 'roton-point:tournament-draw-draft:';
const tournamentCategorySelect =
  'id, name, event_type, draw_size, is_published, display_order, created_at, updated_at';
const tournamentDrawSlotSelect =
  'id, category_id, round_number, round_name, match_number, slot_number, participant_name, is_winner, score, created_at, updated_at';
const tournamentRoundSettingSelect =
  'id, category_id, round_number, round_name, deadline_text, created_at, updated_at';
const adminBracketMatchHeight = 64;
const adminBracketBaseGap = 10;
const adminBracketColumnWidth = 240;
const adminBracketColumnGap = 44;

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
  const [tournamentCategories, setTournamentCategories] = useState<TournamentCategory[]>([]);
  const [rankingDrafts, setRankingDrafts] = useState<Record<string, RankingDraft>>({});
  const [approvalRankDrafts, setApprovalRankDrafts] = useState<Record<string, number>>({});
  const [profileNameDrafts, setProfileNameDrafts] = useState<Record<string, string>>({});
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, TournamentCategoryDraft>>({});
  const [selectedDrawCategoryId, setSelectedDrawCategoryId] = useState('');
  const [drawSlots, setDrawSlots] = useState<TournamentDrawSlot[]>([]);
  const [roundSettings, setRoundSettings] = useState<TournamentRoundSetting[]>([]);
  const [slotDrafts, setSlotDrafts] = useState<Record<string, TournamentSlotDraft>>({});
  const [roundDeadlineDrafts, setRoundDeadlineDrafts] = useState<Record<number, string>>({});
  const [drawSavedSnapshot, setDrawSavedSnapshot] =
    useState<TournamentDrawDraftPayload | null>(null);
  const [pendingDrawDraft, setPendingDrawDraft] = useState<TournamentDrawLocalDraft | null>(null);
  const [drawSaveStatus, setDrawSaveStatus] = useState<DrawSaveStatus>('saved');
  const [activeSection, setActiveSection] = useState<AdminSection>('pending');
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('active');
  const [isLoading, setIsLoading] = useState(true);
  const [isDrawLoading, setIsDrawLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [categoryErrorMessage, setCategoryErrorMessage] = useState('');
  const [drawErrorMessage, setDrawErrorMessage] = useState('');

  useEffect(() => {
    loadAdminData();
  }, []);

  useEffect(() => {
    if (tournamentCategories.length === 0) {
      setSelectedDrawCategoryId('');
      return;
    }

    if (
      !selectedDrawCategoryId ||
      !tournamentCategories.some((category) => category.id === selectedDrawCategoryId)
    ) {
      setSelectedDrawCategoryId(tournamentCategories[0].id);
    }
  }, [selectedDrawCategoryId, tournamentCategories]);

  useEffect(() => {
    if (!selectedDrawCategoryId) {
      setDrawSlots([]);
      setRoundSettings([]);
      setSlotDrafts({});
      setRoundDeadlineDrafts({});
      setDrawSavedSnapshot(null);
      setPendingDrawDraft(null);
      setDrawSaveStatus('saved');
      setDrawErrorMessage('');
      return;
    }

    loadTournamentDrawData(selectedDrawCategoryId);
  }, [selectedDrawCategoryId]);

  const profilesById = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.id, profile]));
  }, [profiles]);

  const rankedPlayerIds = useMemo(() => {
    return new Set(rankings.map((ranking) => ranking.player_id));
  }, [rankings]);

  const rankingsByPlayerId = useMemo(() => {
    return new Map(rankings.map((ranking) => [ranking.player_id, ranking]));
  }, [rankings]);

  const sortedProfiles = useMemo(() => {
    return [...profiles].sort((first, second) =>
      getProfileName(first).localeCompare(getProfileName(second)),
    );
  }, [profiles]);

  const tournamentPortalProfiles = useMemo(() => {
    return profiles
      .filter((profile) => profile.wants_tournaments === true || profile.status === 'rejected')
      .sort((first, second) => getProfileName(first).localeCompare(getProfileName(second)));
  }, [profiles]);

  const pendingProfiles = useMemo(() => {
    return profiles
      .filter((profile) => profile.status === 'pending' && profile.wants_ladder === true)
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

  const selectedDrawCategory = useMemo(() => {
    return tournamentCategories.find((category) => category.id === selectedDrawCategoryId) ?? null;
  }, [selectedDrawCategoryId, tournamentCategories]);

  const currentDrawDraftPayload = useMemo(() => {
    if (!selectedDrawCategory) {
      return null;
    }

    const draft = categoryDrafts[selectedDrawCategory.id];

    return normalizeTournamentDrawDraftPayload({
      drawSize: draft?.draw_size ?? selectedDrawCategory.draw_size,
      roundDeadlineDrafts,
      slotDrafts,
    });
  }, [categoryDrafts, roundDeadlineDrafts, selectedDrawCategory, slotDrafts]);

  const hasUnsavedDrawChanges = useMemo(() => {
    if (!currentDrawDraftPayload || !drawSavedSnapshot) {
      return false;
    }

    return (
      getTournamentDrawDraftSignature(currentDrawDraftPayload) !==
      getTournamentDrawDraftSignature(drawSavedSnapshot)
    );
  }, [currentDrawDraftPayload, drawSavedSnapshot]);

  useEffect(() => {
    if (!selectedDrawCategoryId || !currentDrawDraftPayload || !drawSavedSnapshot) {
      return;
    }

    if (!hasUnsavedDrawChanges) {
      setDrawSaveStatus('saved');
      return;
    }

    setDrawSaveStatus('unsaved');

    const autosaveId = window.setTimeout(() => {
      const didSave = writeTournamentDrawLocalDraft({
        ...currentDrawDraftPayload,
        categoryId: selectedDrawCategoryId,
        savedAt: Date.now(),
      });

      if (didSave) {
        setDrawSaveStatus('draft-saved');
      }
    }, 500);

    return () => {
      window.clearTimeout(autosaveId);
    };
  }, [
    currentDrawDraftPayload,
    drawSavedSnapshot,
    hasUnsavedDrawChanges,
    selectedDrawCategoryId,
  ]);

  useEffect(() => {
    if (!hasUnsavedDrawChanges) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedDrawChanges]);

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
    setCategoryErrorMessage('');

    const [
      { data: profileRows, error: profilesError },
      { data: rankingRows, error: rankingsError },
      { data: matchRows, error: matchesError },
      { data: tournamentCategoryRows, error: tournamentCategoriesError },
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'id, full_name, email, role, status, wants_ladder, wants_tournaments, tournament_status',
        )
        .order('full_name'),
      supabase
        .from('ladder_rankings')
        .select('id, player_id, rank_position, wins, losses')
        .order('rank_position', { ascending: true }),
      supabase
        .from('matches')
        .select('id, challenger_id, opponent_id, status, proposed_match_at, scheduled_match_ends_at, cancel_reason, canceled_at, winner_id, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('tournament_categories')
        .select(tournamentCategorySelect)
        .order('display_order', { ascending: true }),
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
    const nextTournamentCategories = tournamentCategoriesError
      ? []
      : (tournamentCategoryRows ?? []) as TournamentCategory[];
    const highestRank = nextRankings.reduce(
      (highest, ranking) => Math.max(highest, ranking.rank_position),
      0,
    );

    setProfiles(nextProfiles);
    setRankings(nextRankings);
    setMatches((matchRows ?? []) as Match[]);
    setTournamentCategories(nextTournamentCategories);
    setCategoryErrorMessage(tournamentCategoriesError?.message ?? '');
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
    setCategoryDrafts(
      Object.fromEntries(
        nextTournamentCategories.map((category) => [
          category.id,
          {
            draw_size: toTournamentDrawSize(category.draw_size),
            event_type: toTournamentEventType(category.event_type),
            is_published: Boolean(category.is_published),
            name: category.name,
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
        .filter((profile) => profile.status === 'pending' && profile.wants_ladder === true)
        .forEach((profile, index) => {
          nextDrafts[profile.id] = nextDrafts[profile.id] ?? highestRank + index + 1;
        });

      return nextDrafts;
    });
    setIsLoading(false);
  }

  async function loadTournamentDrawData(
    categoryId: string,
    drawSizeOverride?: TournamentDrawSize,
    savedDrawSizeOverride?: TournamentDrawSize,
  ) {
    const category = tournamentCategories.find(
      (tournamentCategory) => tournamentCategory.id === categoryId,
    );

    if (!category) {
      return;
    }

    const drawSize = drawSizeOverride ?? category.draw_size;
    const savedDrawSize = savedDrawSizeOverride ?? category.draw_size;

    setIsDrawLoading(true);
    setPendingDrawDraft(null);
    setDrawErrorMessage('');

    const drawRows = await ensureTournamentDrawRows(categoryId, drawSize);

    if (!drawRows) {
      setIsDrawLoading(false);
      return;
    }

    const nextSlotDrafts = Object.fromEntries(
      drawRows.slots.map((slot) => [
        getTournamentSlotKey(slot),
        {
          participant_name: slot.participant_name ?? '',
        },
      ]),
    );
    const nextRoundDeadlineDrafts = Object.fromEntries(
      getTournamentRoundSpecs(drawSize).map((roundSpec) => {
        const setting = drawRows.roundSettings.find(
          (roundSetting) => roundSetting.round_number === roundSpec.roundNumber,
        );

        return [roundSpec.roundNumber, setting?.deadline_text ?? ''];
      }),
    );
    const savedSnapshot = normalizeTournamentDrawDraftPayload({
      drawSize: savedDrawSize,
      roundDeadlineDrafts: nextRoundDeadlineDrafts,
      slotDrafts: nextSlotDrafts,
    });
    const localDraft = readTournamentDrawLocalDraft(categoryId);
    const latestDatabaseUpdate = getLatestTournamentDrawDataTime(
      drawRows.slots,
      drawRows.roundSettings,
    );

    setDrawSlots(drawRows.slots);
    setRoundSettings(drawRows.roundSettings);
    setSlotDrafts(nextSlotDrafts);
    setRoundDeadlineDrafts(nextRoundDeadlineDrafts);
    setDrawSavedSnapshot(savedSnapshot);
    setDrawSaveStatus('saved');

    if (localDraft && localDraft.savedAt > latestDatabaseUpdate) {
      setPendingDrawDraft(localDraft);
    } else if (localDraft) {
      removeTournamentDrawLocalDraft(categoryId);
    }

    setIsDrawLoading(false);
  }

  async function ensureTournamentDrawRows(categoryId: string, drawSize: TournamentDrawSize) {
    const drawRows = await fetchTournamentDrawRows(categoryId);

    if (!drawRows) {
      return null;
    }

    const existingSlotKeys = new Set(drawRows.slots.map((slot) => getTournamentSlotKey(slot)));
    const missingSlots = buildEmptyTournamentDrawSlots(categoryId, drawSize).filter(
      (slot) => !existingSlotKeys.has(getTournamentSlotKey(slot)),
    );
    const existingRoundNumbers = new Set(
      drawRows.roundSettings.map((roundSetting) => roundSetting.round_number),
    );
    const missingRoundSettings = buildEmptyTournamentRoundSettings(categoryId, drawSize).filter(
      (roundSetting) => !existingRoundNumbers.has(roundSetting.round_number),
    );

    const [{ error: slotsInsertError }, { error: settingsInsertError }] = await Promise.all([
      missingSlots.length > 0
        ? supabase.from('tournament_draw_slots').insert(missingSlots)
        : Promise.resolve({ error: null }),
      missingRoundSettings.length > 0
        ? supabase.from('tournament_round_settings').insert(missingRoundSettings)
        : Promise.resolve({ error: null }),
    ]);

    if (slotsInsertError || settingsInsertError) {
      setDrawErrorMessage(
        slotsInsertError?.message ??
          settingsInsertError?.message ??
          'Unable to prepare draw rows.',
      );
      return null;
    }

    if (missingSlots.length > 0 || missingRoundSettings.length > 0) {
      return fetchTournamentDrawRows(categoryId);
    }

    return drawRows;
  }

  async function fetchTournamentDrawRows(categoryId: string) {
    const [
      { data: slotRows, error: slotsError },
      { data: settingRows, error: settingsError },
    ] = await Promise.all([
      supabase
        .from('tournament_draw_slots')
        .select(tournamentDrawSlotSelect)
        .eq('category_id', categoryId)
        .order('round_number', { ascending: true })
        .order('match_number', { ascending: true })
        .order('slot_number', { ascending: true }),
      supabase
        .from('tournament_round_settings')
        .select(tournamentRoundSettingSelect)
        .eq('category_id', categoryId)
        .order('round_number', { ascending: true }),
    ]);

    if (slotsError || settingsError) {
      setDrawErrorMessage(
        slotsError?.message ?? settingsError?.message ?? 'Unable to load tournament draw.',
      );
      return null;
    }

    return {
      roundSettings: (settingRows ?? []) as TournamentRoundSetting[],
      slots: (slotRows ?? []) as TournamentDrawSlot[],
    };
  }

  async function handleLogout() {
    if (!confirmLeavingUnsavedDraw()) {
      return;
    }

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

  function updateCategoryDraft<Field extends keyof TournamentCategoryDraft>(
    categoryId: string,
    field: Field,
    value: TournamentCategoryDraft[Field],
  ) {
    setCategoryDrafts((current) => ({
      ...current,
      [categoryId]: {
        ...current[categoryId],
        [field]: value,
      },
    }));
  }

  async function saveTournamentCategory(category: TournamentCategory) {
    const draft = categoryDrafts[category.id];

    if (!draft) {
      return;
    }

    const trimmedName = draft.name.trim();

    if (!trimmedName) {
      setErrorMessage('Category name is required.');
      return;
    }

    setActionId(`category-${category.id}`);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase
      .from('tournament_categories')
      .update({
        draw_size: draft.draw_size,
        event_type: draft.event_type,
        is_published: draft.is_published,
        name: trimmedName,
      })
      .eq('id', category.id);

    setActionId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage('Tournament category updated.');
    await loadAdminData();
  }

  function updateSlotDraft(
    slotKey: string,
    value: string,
  ) {
    setSlotDrafts((current) => {
      const existingDraft = current[slotKey] ?? {
        participant_name: '',
      };

      return {
        ...current,
        [slotKey]: {
          ...existingDraft,
          participant_name: value,
        },
      };
    });
  }

  function updateRoundDeadlineDraft(roundNumber: number, value: string) {
    setRoundDeadlineDrafts((current) => ({
      ...current,
      [roundNumber]: value,
    }));
  }

  async function updateDrawSizeDraft(category: TournamentCategory, drawSize: TournamentDrawSize) {
    const currentDraft = categoryDrafts[category.id];
    const currentDrawSize = currentDraft?.draw_size ?? category.draw_size;

    if (drawSize < currentDrawSize) {
      const confirmed = window.confirm(
        'Reducing draw size may hide existing bracket slots. Existing data will not be deleted automatically. Continue?',
      );

      if (!confirmed) {
        return;
      }
    }

    updateCategoryDraft(category.id, 'draw_size', drawSize);
    await loadTournamentDrawData(category.id, drawSize);
  }

  function confirmLeavingUnsavedDraw() {
    if (!hasUnsavedDrawChanges) {
      return true;
    }

    return window.confirm(
      'You have unsaved tournament draw changes. Leave without saving to the database?',
    );
  }

  function changeAdminSection(section: AdminSection) {
    if (section !== activeSection && activeSection === 'draws' && !confirmLeavingUnsavedDraw()) {
      return;
    }

    setActiveSection(section);
  }

  function changeSelectedDrawCategory(categoryId: string) {
    if (categoryId === selectedDrawCategoryId) {
      return;
    }

    if (!confirmLeavingUnsavedDraw()) {
      return;
    }

    setSelectedDrawCategoryId(categoryId);
  }

  function restorePendingDrawDraft() {
    if (!pendingDrawDraft || pendingDrawDraft.categoryId !== selectedDrawCategoryId) {
      return;
    }

    updateCategoryDraft(selectedDrawCategoryId, 'draw_size', pendingDrawDraft.drawSize);
    setSlotDrafts(pendingDrawDraft.slotDrafts);
    setRoundDeadlineDrafts(pendingDrawDraft.roundDeadlineDrafts);
    setPendingDrawDraft(null);
    setDrawSaveStatus('unsaved');
  }

  function discardPendingDrawDraft() {
    if (pendingDrawDraft) {
      removeTournamentDrawLocalDraft(pendingDrawDraft.categoryId);
    }

    setPendingDrawDraft(null);
    setDrawSaveStatus(hasUnsavedDrawChanges ? 'unsaved' : 'saved');
  }

  async function saveTournamentDraw(
    category: TournamentCategory,
    options: { isPublishedOverride?: boolean } = {},
  ) {
    const defaultDraft: TournamentCategoryDraft = {
      draw_size: category.draw_size,
      event_type: category.event_type,
      is_published: category.is_published,
      name: category.name,
    };
    const currentDraft = categoryDrafts[category.id] ?? defaultDraft;
    const draft = {
      ...currentDraft,
      is_published: options.isPublishedOverride ?? currentDraft.is_published,
    };

    updateCategoryDraft(category.id, 'is_published', draft.is_published);

    setActionId(`draw-${category.id}`);
    setMessage('');
    setErrorMessage('');
    setDrawErrorMessage('');

    const { error: categoryUpdateError } = await supabase
      .from('tournament_categories')
      .update({
        draw_size: draft.draw_size,
        is_published: draft.is_published,
      })
      .eq('id', category.id);

    if (categoryUpdateError) {
      setActionId(null);
      updateCategoryDraft(category.id, 'is_published', category.is_published);
      setErrorMessage(categoryUpdateError.message);
      return;
    }

    const drawRows = await ensureTournamentDrawRows(category.id, draft.draw_size);

    if (!drawRows) {
      setActionId(null);
      return;
    }

    const visibleRounds = buildTournamentBracketRounds({
      drawSize: draft.draw_size,
      roundSettings: drawRows.roundSettings,
      slots: drawRows.slots,
    });
    const visibleSlots = visibleRounds.flatMap((round) =>
      round.matches.flatMap((match) => match.slots),
    );
    const slotRows = visibleSlots.map((slot) => {
      const slotDraft = slotDrafts[getTournamentSlotKey(slot)];
      const participantName = slotDraft?.participant_name ?? slot.participant_name ?? '';

      return {
        category_id: category.id,
        is_winner: Boolean(slot.is_winner),
        match_number: slot.match_number,
        participant_name: participantName.trim() || null,
        round_name: slot.round_name,
        round_number: slot.round_number,
        score: slot.score,
        slot_number: slot.slot_number,
      };
    });
    const roundRows = getTournamentRoundSpecs(draft.draw_size).map((roundSpec) => ({
      category_id: category.id,
      deadline_text: roundDeadlineDrafts[roundSpec.roundNumber]?.trim() || null,
      round_name: roundSpec.roundName,
      round_number: roundSpec.roundNumber,
    }));

    const [{ error: slotsSaveError }, { error: roundsSaveError }] = await Promise.all([
      supabase
        .from('tournament_draw_slots')
        .upsert(slotRows, {
          onConflict: 'category_id,round_number,match_number,slot_number',
        }),
      supabase
        .from('tournament_round_settings')
        .upsert(roundRows, {
          onConflict: 'category_id,round_number',
        }),
    ]);

    setActionId(null);

    if (slotsSaveError || roundsSaveError) {
      setErrorMessage(
        slotsSaveError?.message ?? roundsSaveError?.message ?? 'Unable to save draw.',
      );
      return;
    }

    removeTournamentDrawLocalDraft(category.id);
    setPendingDrawDraft(null);
    setDrawSaveStatus('saved');
    setMessage(
      draft.is_published ? 'Tournament draw published.' : 'Tournament draw saved as draft.',
    );
    await loadAdminData();
    await loadTournamentDrawData(category.id, draft.draw_size, draft.draw_size);
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
              <Link
                className="admin-soft-button border-white/20 bg-white/10 text-white hover:bg-white/15"
                to="/dashboard"
                onClick={(event) => {
                  if (!confirmLeavingUnsavedDraw()) {
                    event.preventDefault();
                  }
                }}
              >
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
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <SummaryCard label="Accounts" value={profiles.length} />
              <SummaryCard label="Pending" value={pendingProfiles.length} />
              <SummaryCard label="Ranked" value={rankings.length} />
              <SummaryCard label="Scheduled" value={matchCounts.scheduled} />
              <SummaryCard label="Completed" value={matchCounts.completed} />
              <SummaryCard label="Categories" value={tournamentCategories.length} />
            </section>

            <nav className="grid gap-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
              {([
                ['pending', 'Pending Players'],
                ['accounts', 'All Accounts'],
                ['tournamentAccounts', 'Tournament Portal Accounts'],
                ['ladder', 'Ladder Management'],
                ['matches', 'Matches'],
                ['categories', 'Categories'],
                ['draws', 'Draws'],
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
                  onClick={() => changeAdminSection(section)}
                >
                  {label}
                </button>
              ))}
            </nav>

            {activeSection === 'accounts' && (
              <AdminPanel
                title="All Accounts"
                description="Read-only list of registered profiles and their ladder status."
              >
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="hidden grid-cols-[minmax(0,1.25fr)_minmax(0,1.35fr)_7rem_9rem_9rem] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-slate-600 lg:grid">
                    <span>Name</span>
                    <span>Email</span>
                    <span>Role</span>
                    <span>Status</span>
                    <span>Ladder</span>
                  </div>
                  <div className="divide-y divide-slate-200">
                    {sortedProfiles.length === 0 ? (
                      <AdminEmptyState message="No accounts found." />
                    ) : (
                      sortedProfiles.map((profile) => {
                        const ranking = rankingsByPlayerId.get(profile.id);

                        return (
                          <article
                            className="grid gap-3 px-4 py-4 text-sm lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1.35fr)_7rem_9rem_9rem] lg:items-center"
                            key={profile.id}
                          >
                            <div className="min-w-0">
                              <p className="truncate font-black text-[#071a3d]">
                                {getProfileName(profile)}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-slate-500 lg:hidden">
                                {profile.email ?? 'Email not stored'}
                              </p>
                            </div>
                            <p className="hidden truncate font-semibold text-slate-700 lg:block">
                              {profile.email ?? 'Email not stored'}
                            </p>
                            <p className="font-black capitalize text-[#071a3d]">
                              {profile.role ?? 'player'}
                            </p>
                            <p className="font-semibold capitalize text-slate-700">
                              {profile.status ?? 'unknown'}
                            </p>
                            <p className="font-black text-[#071a3d]">
                              {ranking ? `Ranked #${ranking.rank_position}` : 'Not ranked'}
                            </p>
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>
              </AdminPanel>
            )}

            {activeSection === 'tournamentAccounts' && (
              <AdminPanel
                title={`Tournament Portal Accounts (${tournamentPortalProfiles.length})`}
                description="Read-only list of accounts that requested Tournament Portal access."
              >
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="hidden grid-cols-[minmax(0,1.15fr)_minmax(0,1.25fr)_6rem_8rem_9rem_9rem] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-slate-600 lg:grid">
                    <span>Name</span>
                    <span>Email</span>
                    <span>Role</span>
                    <span>Profile</span>
                    <span>Tournament</span>
                    <span>Ladder</span>
                  </div>
                  <div className="divide-y divide-slate-200">
                    {tournamentPortalProfiles.length === 0 ? (
                      <AdminEmptyState message="No Tournament Portal accounts found." />
                    ) : (
                      tournamentPortalProfiles.map((profile) => {
                        const ranking = rankingsByPlayerId.get(profile.id);

                        return (
                          <article
                            className="grid gap-3 px-4 py-4 text-sm lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.25fr)_6rem_8rem_9rem_9rem] lg:items-center"
                            key={profile.id}
                          >
                            <div className="min-w-0">
                              <p className="truncate font-black text-[#071a3d]">
                                {getProfileName(profile)}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-slate-500 lg:hidden">
                                {profile.email ?? 'Email not stored'}
                              </p>
                            </div>
                            <p className="hidden truncate font-semibold text-slate-700 lg:block">
                              {profile.email ?? 'Email not stored'}
                            </p>
                            <p className="font-black capitalize text-[#071a3d]">
                              {profile.role ?? 'player'}
                            </p>
                            <p className="font-semibold capitalize text-slate-700">
                              {profile.status ?? 'unknown'}
                            </p>
                            <p className="font-semibold capitalize text-slate-700">
                              {profile.tournament_status ?? 'Not set'}
                            </p>
                            <p className="font-black text-[#071a3d]">
                              {ranking ? `Ranked #${ranking.rank_position}` : 'Not ranked'}
                            </p>
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>
              </AdminPanel>
            )}

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

            {activeSection === 'categories' && (
              <AdminPanel
                title="Tournament Categories"
                description="Edit category names, event type, draw size, and published status."
              >
                <div className="grid gap-3">
                  {categoryErrorMessage ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                      {categoryErrorMessage}
                    </div>
                  ) : tournamentCategories.length === 0 ? (
                    <AdminEmptyState message="No tournament categories found. Run the tournament category SQL seed in Supabase." />
                  ) : (
                    tournamentCategories.map((category) => {
                      const draft = categoryDrafts[category.id] ?? {
                        draw_size: toTournamentDrawSize(category.draw_size),
                        event_type: toTournamentEventType(category.event_type),
                        is_published: Boolean(category.is_published),
                        name: category.name,
                      };

                      return (
                        <article
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
                          key={category.id}
                        >
                          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_10rem_8rem_10rem_auto] lg:items-end">
                            <label className="block min-w-0">
                              <span className="admin-label">Category Name</span>
                              <input
                                className="admin-input mt-1"
                                value={draft.name}
                                onChange={(event) =>
                                  updateCategoryDraft(category.id, 'name', event.target.value)
                                }
                              />
                            </label>

                            <label className="block">
                              <span className="admin-label">Event Type</span>
                              <select
                                className="admin-input mt-1"
                                value={draft.event_type}
                                onChange={(event) =>
                                  updateCategoryDraft(
                                    category.id,
                                    'event_type',
                                    toTournamentEventType(event.target.value),
                                  )
                                }
                              >
                                <option value="singles">Singles</option>
                                <option value="doubles">Doubles</option>
                              </select>
                            </label>

                            <label className="block">
                              <span className="admin-label">Draw Size</span>
                              <select
                                className="admin-input mt-1"
                                value={draft.draw_size}
                                onChange={(event) =>
                                  updateCategoryDraft(
                                    category.id,
                                    'draw_size',
                                    toTournamentDrawSize(event.target.value),
                                  )
                                }
                              >
                                {TOURNAMENT_DRAW_SIZES.map((drawSize) => (
                                  <option key={drawSize} value={drawSize}>
                                    {drawSize}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                              <input
                                className="size-4 accent-[#071a3d]"
                                type="checkbox"
                                checked={draft.is_published}
                                onChange={(event) =>
                                  updateCategoryDraft(
                                    category.id,
                                    'is_published',
                                    event.target.checked,
                                  )
                                }
                              />
                              <span className="text-sm font-black text-[#071a3d]">
                                Published
                              </span>
                            </label>

                            <button
                              className="admin-primary-button"
                              type="button"
                              onClick={() => saveTournamentCategory(category)}
                              disabled={actionId === `category-${category.id}`}
                            >
                              {actionId === `category-${category.id}` ? 'Saving...' : 'Save'}
                            </button>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">
                              {formatTournamentEventType(draft.event_type)}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">
                              {draft.draw_size} draw
                            </span>
                            <span
                              className={`rounded-full border px-2.5 py-1 ${
                                draft.is_published
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                  : 'border-amber-200 bg-amber-50 text-amber-800'
                              }`}
                            >
                              {getTournamentCategoryStatus({
                                ...category,
                                is_published: draft.is_published,
                              })}
                            </span>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </AdminPanel>
            )}

            {activeSection === 'draws' && (
              <AdminPanel
                title="Tournament Draws"
                description="Manually edit bracket slots, round deadlines, and publish status."
              >
                {categoryErrorMessage ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                    {categoryErrorMessage}
                  </div>
                ) : tournamentCategories.length === 0 ? (
                  <AdminEmptyState message="No tournament categories found. Run the tournament category SQL seed in Supabase." />
                ) : selectedDrawCategory ? (
                  <DrawEditor
                    actionId={actionId}
                    category={selectedDrawCategory}
                    categoryDraft={
                      categoryDrafts[selectedDrawCategory.id] ?? {
                        draw_size: selectedDrawCategory.draw_size,
                        event_type: selectedDrawCategory.event_type,
                        is_published: selectedDrawCategory.is_published,
                        name: selectedDrawCategory.name,
                      }
                    }
                    drawErrorMessage={drawErrorMessage}
                    drawSaveStatus={drawSaveStatus}
                    drawSlots={drawSlots}
                    isLoading={isDrawLoading}
                    pendingDrawDraft={pendingDrawDraft}
                    roundDeadlineDrafts={roundDeadlineDrafts}
                    roundSettings={roundSettings}
                    selectedCategoryId={selectedDrawCategoryId}
                    slotDrafts={slotDrafts}
                    tournamentCategories={tournamentCategories}
                    onCategoryChange={changeSelectedDrawCategory}
                    onDiscardDraft={discardPendingDrawDraft}
                    onDrawSizeChange={updateDrawSizeDraft}
                    onPublishedChange={(value) =>
                      saveTournamentDraw(selectedDrawCategory, { isPublishedOverride: value })
                    }
                    onRestoreDraft={restorePendingDrawDraft}
                    onRoundDeadlineChange={updateRoundDeadlineDraft}
                    onSave={saveTournamentDraw}
                    onSlotChange={updateSlotDraft}
                  />
                ) : (
                  <AdminEmptyState message="Select a tournament category to edit its draw." />
                )}
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

function DrawEditor({
  actionId,
  category,
  categoryDraft,
  drawErrorMessage,
  drawSaveStatus,
  drawSlots,
  isLoading,
  onCategoryChange,
  onDiscardDraft,
  onDrawSizeChange,
  onPublishedChange,
  onRestoreDraft,
  onRoundDeadlineChange,
  onSave,
  onSlotChange,
  pendingDrawDraft,
  roundDeadlineDrafts,
  roundSettings,
  selectedCategoryId,
  slotDrafts,
  tournamentCategories,
}: {
  actionId: string | null;
  category: TournamentCategory;
  categoryDraft: TournamentCategoryDraft;
  drawErrorMessage: string;
  drawSaveStatus: DrawSaveStatus;
  drawSlots: TournamentDrawSlot[];
  isLoading: boolean;
  onCategoryChange: (categoryId: string) => void;
  onDiscardDraft: () => void;
  onDrawSizeChange: (category: TournamentCategory, drawSize: TournamentDrawSize) => void;
  onPublishedChange: (value: boolean) => void | Promise<void>;
  onRestoreDraft: () => void;
  onRoundDeadlineChange: (roundNumber: number, value: string) => void;
  onSave: (category: TournamentCategory) => void;
  onSlotChange: (slotKey: string, value: string) => void;
  pendingDrawDraft: TournamentDrawLocalDraft | null;
  roundDeadlineDrafts: Record<number, string>;
  roundSettings: TournamentRoundSetting[];
  selectedCategoryId: string;
  slotDrafts: Record<string, TournamentSlotDraft>;
  tournamentCategories: TournamentCategory[];
}) {
  const rounds = buildTournamentBracketRounds({
    drawSize: categoryDraft.draw_size,
    roundSettings,
    slots: drawSlots,
  });
  const layout = getAdminBracketLayout(
    rounds,
    adminBracketColumnWidth,
    adminBracketColumnGap,
  );
  const isSaving = actionId === `draw-${category.id}`;
  const participantLabel =
    categoryDraft.event_type === 'doubles' ? 'Team name' : 'Player name';

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="h-1 bg-[#071a3d]" />
        <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.35fr)_8rem_auto_auto] lg:items-end">
          <label className="block min-w-0">
            <span className="admin-label">Category</span>
            <select
              className="admin-input mt-1"
              value={selectedCategoryId}
              onChange={(event) => onCategoryChange(event.target.value)}
            >
              {tournamentCategories.map((tournamentCategory) => (
                <option key={tournamentCategory.id} value={tournamentCategory.id}>
                  {tournamentCategory.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="admin-label">Draw Size</span>
            <select
              className="admin-input mt-1"
              value={categoryDraft.draw_size}
              onChange={(event) =>
                onDrawSizeChange(category, toTournamentDrawSize(event.target.value))
              }
            >
              {TOURNAMENT_DRAW_SIZES.map((drawSize) => (
                <option key={drawSize} value={drawSize}>
                  {drawSize}
                </option>
              ))}
            </select>
          </label>

          <button
            className="admin-soft-button h-11"
            type="button"
            onClick={() => onSave(category)}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Draw'}
          </button>

          <button
            className={
              categoryDraft.is_published
                ? 'admin-soft-button h-11 border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
                : 'admin-primary-button h-11'
            }
            type="button"
            onClick={() => onPublishedChange(!categoryDraft.is_published)}
            disabled={isSaving}
          >
            {isSaving
              ? 'Saving...'
              : categoryDraft.is_published
                ? 'Unpublish'
                : 'Publish'}
          </button>
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <DrawSaveStatusPill status={drawSaveStatus} />
          <p className="text-xs font-semibold text-slate-600">
            Local drafts are cleared after a successful database save.
          </p>
        </div>
      </div>

      {pendingDrawDraft && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <span>Unsaved draft found. Restore it?</span>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-full bg-[#071a3d] px-4 py-2 text-xs font-black text-white transition hover:bg-[#102a5c]"
              type="button"
              onClick={onRestoreDraft}
            >
              Restore Draft
            </button>
            <button
              className="rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-black text-amber-950 transition hover:bg-amber-100"
              type="button"
              onClick={onDiscardDraft}
            >
              Discard Draft
            </button>
          </div>
        </div>
      )}

      {drawErrorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
          {drawErrorMessage}
        </div>
      )}

      {isLoading ? (
        <AdminEmptyState message="Loading draw editor..." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-white px-4 py-3">
            <p className="text-sm font-black text-[#071a3d]">
              {category.name} · {categoryDraft.draw_size} {formatTournamentEventType(category.event_type)} draw
            </p>
          </div>

          <div className="overflow-x-auto bg-[#f8fafc] px-4 py-5">
            <div className="min-w-max pb-2" style={{ width: layout.canvasWidth }}>
              <div className="flex pb-3" style={{ gap: layout.columnGap }}>
                {rounds.map((round) => (
                  <div
                    className="shrink-0"
                    key={round.roundNumber}
                    style={{ width: layout.columnWidth }}
                  >
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm shadow-slate-900/5">
                      <h3 className="text-xs font-black uppercase tracking-[0.12em] text-[#071a3d]">
                        {round.roundName}
                      </h3>
                      <label className="mt-2 block">
                        <span className="text-xs font-black text-slate-600">
                          Deadline
                        </span>
                        <input
                          className="admin-input mt-1 h-9 text-sm shadow-none"
                          placeholder="TBD or date"
                          value={roundDeadlineDrafts[round.roundNumber] ?? ''}
                          onChange={(event) =>
                            onRoundDeadlineChange(round.roundNumber, event.target.value)
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="relative"
                style={{ height: layout.canvasHeight, width: layout.canvasWidth }}
              >
                <AdminBracketConnectors
                  layout={layout}
                  rounds={rounds}
                  strokeClass="stroke-blue-200"
                />
                {rounds.map((round, roundIndex) =>
                  round.matches.map((match, matchIndex) => (
                    <div
                      className="absolute z-10"
                      key={`${round.roundNumber}-${match.matchNumber}`}
                      style={{
                        height: layout.matchHeight,
                        left: layout.getColumnLeft(roundIndex),
                        top: layout.getMatchTop(roundIndex, matchIndex),
                        width: layout.columnWidth,
                      }}
                    >
                      <DrawEditorMatch
                        match={match}
                        participantLabel={participantLabel}
                        onSlotChange={onSlotChange}
                        slotDrafts={slotDrafts}
                      />
                    </div>
                  )),
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DrawSaveStatusPill({ status }: { status: DrawSaveStatus }) {
  const statusConfig = {
    'draft-saved': {
      className: 'border-blue-200 bg-blue-50 text-blue-900',
      label: 'Draft saved locally',
    },
    saved: {
      className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      label: 'Saved to database',
    },
    unsaved: {
      className: 'border-amber-200 bg-amber-50 text-amber-900',
      label: 'Unsaved changes',
    },
  }[status];

  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border px-3 py-1.5 text-xs font-black ${statusConfig.className}`}
    >
      {statusConfig.label}
    </span>
  );
}

function DrawEditorMatch({
  match,
  participantLabel,
  onSlotChange,
  slotDrafts,
}: {
  match: TournamentBracketRound['matches'][number];
  participantLabel: string;
  onSlotChange: (slotKey: string, value: string) => void;
  slotDrafts: Record<string, TournamentSlotDraft>;
}) {
  return (
    <article className="h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 ring-1 ring-white">
      <div className="h-5 border-b border-slate-100 bg-blue-50 px-2.5 py-1">
        <p className="text-[0.62rem] font-black uppercase tracking-[0.12em] text-slate-600">
          Match {match.matchNumber}
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {match.slots.map((slot) => {
          const slotKey = getTournamentSlotKey(slot);
          const draft = slotDrafts[slotKey];

          return (
            <input
              aria-label={`Match ${match.matchNumber} slot ${slot.slot_number} ${participantLabel}`}
              className="h-[22px] w-full border-0 bg-white px-2.5 text-sm font-semibold text-[#071a3d] outline-none transition placeholder:text-slate-400 focus:bg-blue-50"
              key={`${slot.match_number}-${slot.slot_number}`}
              placeholder={`${participantLabel} ${slot.slot_number}`}
              value={draft?.participant_name ?? slot.participant_name ?? ''}
              onChange={(event) => onSlotChange(slotKey, event.target.value)}
            />
          );
        })}
      </div>
    </article>
  );
}

type AdminBracketLayout = {
  canvasHeight: number;
  canvasWidth: number;
  columnGap: number;
  columnWidth: number;
  getColumnLeft: (roundIndex: number) => number;
  getMatchTop: (roundIndex: number, matchIndex: number) => number;
  matchHeight: number;
};

function getAdminBracketLayout(
  rounds: TournamentBracketRound[],
  columnWidth: number,
  columnGap: number,
): AdminBracketLayout {
  const firstRoundMatchCount = rounds[0]?.matches.length ?? 1;
  const step = adminBracketMatchHeight + adminBracketBaseGap;
  const canvasHeight = firstRoundMatchCount * step - adminBracketBaseGap;
  const canvasWidth = rounds.length * columnWidth + (rounds.length - 1) * columnGap;

  return {
    canvasHeight,
    canvasWidth,
    columnGap,
    columnWidth,
    getColumnLeft: (roundIndex) => roundIndex * (columnWidth + columnGap),
    getMatchTop: (roundIndex, matchIndex) => {
      const groupSize = 2 ** roundIndex;
      const groupStart = matchIndex * groupSize * step;
      const groupCenter = groupStart + (groupSize * step) / 2 - adminBracketBaseGap / 2;

      return groupCenter - adminBracketMatchHeight / 2;
    },
    matchHeight: adminBracketMatchHeight,
  };
}

function AdminBracketConnectors({
  layout,
  rounds,
  strokeClass,
}: {
  layout: AdminBracketLayout;
  rounds: TournamentBracketRound[];
  strokeClass: string;
}) {
  const paths = rounds.slice(1).flatMap((round, roundOffset) => {
    const roundIndex = roundOffset + 1;
    const previousRoundIndex = roundIndex - 1;
    const sourceX = layout.getColumnLeft(previousRoundIndex) + layout.columnWidth;
    const targetX = layout.getColumnLeft(roundIndex);
    const midX = sourceX + layout.columnGap / 2;

    return round.matches.map((match, matchIndex) => {
      const sourceY1 =
        layout.getMatchTop(previousRoundIndex, matchIndex * 2) + layout.matchHeight / 2;
      const sourceY2 =
        layout.getMatchTop(previousRoundIndex, matchIndex * 2 + 1) + layout.matchHeight / 2;
      const targetY = layout.getMatchTop(roundIndex, matchIndex) + layout.matchHeight / 2;

      return {
        d: `M ${sourceX} ${sourceY1} H ${midX} M ${sourceX} ${sourceY2} H ${midX} M ${midX} ${sourceY1} V ${sourceY2} M ${midX} ${targetY} H ${targetX}`,
        key: `${round.roundNumber}-${match.matchNumber}`,
      };
    });
  });

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-0"
      height={layout.canvasHeight}
      viewBox={`0 0 ${layout.canvasWidth} ${layout.canvasHeight}`}
      width={layout.canvasWidth}
    >
      {paths.map((path) => (
        <path
          className={strokeClass}
          d={path.d}
          fill="none"
          key={path.key}
          strokeLinecap="round"
          strokeWidth="1.5"
        />
      ))}
    </svg>
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

function getTournamentDrawDraftStorageKey(categoryId: string) {
  return `${tournamentDrawDraftStoragePrefix}${categoryId}`;
}

function normalizeTournamentDrawDraftPayload(payload: {
  drawSize: unknown;
  roundDeadlineDrafts?: Record<string | number, unknown>;
  slotDrafts?: Record<string, { participant_name?: unknown } | undefined>;
}): TournamentDrawDraftPayload {
  const slotDraftEntries = Object.entries(payload.slotDrafts ?? {})
    .map(([slotKey, draft]) => [
      slotKey,
      {
        participant_name:
          typeof draft?.participant_name === 'string' ? draft.participant_name : '',
      },
    ] as const)
    .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey));
  const roundDeadlineEntries = Object.entries(payload.roundDeadlineDrafts ?? {})
    .map(([roundNumber, value]) => [
      Number(roundNumber),
      typeof value === 'string' ? value : '',
    ] as const)
    .filter(([roundNumber]) => Number.isInteger(roundNumber) && roundNumber > 0)
    .sort(([firstRound], [secondRound]) => firstRound - secondRound);

  return {
    drawSize: toTournamentDrawSize(payload.drawSize),
    roundDeadlineDrafts: Object.fromEntries(roundDeadlineEntries) as Record<number, string>,
    slotDrafts: Object.fromEntries(slotDraftEntries),
  };
}

function getTournamentDrawDraftSignature(payload: TournamentDrawDraftPayload) {
  const normalizedPayload = normalizeTournamentDrawDraftPayload(payload);

  return JSON.stringify({
    drawSize: normalizedPayload.drawSize,
    roundDeadlineDrafts: Object.entries(normalizedPayload.roundDeadlineDrafts)
      .map(([roundNumber, value]) => [Number(roundNumber), value] as const)
      .sort(([firstRound], [secondRound]) => firstRound - secondRound),
    slotDrafts: Object.entries(normalizedPayload.slotDrafts)
      .map(([slotKey, draft]) => [slotKey, draft.participant_name] as const)
      .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey)),
  });
}

function readTournamentDrawLocalDraft(categoryId: string): TournamentDrawLocalDraft | null {
  try {
    const rawDraft = window.localStorage.getItem(getTournamentDrawDraftStorageKey(categoryId));

    if (!rawDraft) {
      return null;
    }

    const parsedDraft = JSON.parse(rawDraft) as Partial<TournamentDrawLocalDraft>;

    if (
      parsedDraft.categoryId !== categoryId ||
      typeof parsedDraft.savedAt !== 'number' ||
      !Number.isFinite(parsedDraft.savedAt)
    ) {
      return null;
    }

    return {
      ...normalizeTournamentDrawDraftPayload({
        drawSize: parsedDraft.drawSize,
        roundDeadlineDrafts: parsedDraft.roundDeadlineDrafts,
        slotDrafts: parsedDraft.slotDrafts,
      }),
      categoryId,
      savedAt: parsedDraft.savedAt,
    };
  } catch (error) {
    console.error('Tournament draw draft read error:', error);
    return null;
  }
}

function writeTournamentDrawLocalDraft(draft: TournamentDrawLocalDraft) {
  try {
    const normalizedDraft = normalizeTournamentDrawDraftPayload(draft);

    window.localStorage.setItem(
      getTournamentDrawDraftStorageKey(draft.categoryId),
      JSON.stringify({
        ...normalizedDraft,
        categoryId: draft.categoryId,
        savedAt: draft.savedAt,
      }),
    );

    return true;
  } catch (error) {
    console.error('Tournament draw draft save error:', error);
    return false;
  }
}

function removeTournamentDrawLocalDraft(categoryId: string) {
  try {
    window.localStorage.removeItem(getTournamentDrawDraftStorageKey(categoryId));
  } catch (error) {
    console.error('Tournament draw draft remove error:', error);
  }
}

function getLatestTournamentDrawDataTime(
  slots: TournamentDrawSlot[],
  roundSettings: TournamentRoundSetting[],
) {
  const slotTimes = slots.map((slot) => getTimestamp(slot.updated_at ?? slot.created_at));
  const roundTimes = roundSettings.map((roundSetting) =>
    getTimestamp(roundSetting.updated_at ?? roundSetting.created_at),
  );

  return Math.max(
    0,
    ...slotTimes,
    ...roundTimes,
  );
}

function getTimestamp(value: string | null) {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : 0;
}

export default AdminPage;
