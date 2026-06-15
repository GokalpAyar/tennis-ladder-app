import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppLayout from '../app/AppLayout';
import { TOURNAMENT_PORTAL_LABEL } from '../app/portalAccess';
import {
  buildTournamentBracketRounds,
  formatTournamentEventType,
  getTournamentCategoryStatus,
  type TournamentBracketMatch,
  type TournamentBracketRound,
  type TournamentCategory,
  type TournamentDrawSlot,
  type TournamentRoundSetting,
} from '../features/tournaments/tournamentCategories';
import { supabase } from '../lib/supabase';

const categorySelect =
  'id, name, event_type, draw_size, is_published, display_order, created_at, updated_at';
const drawSlotSelect =
  'id, category_id, round_number, round_name, match_number, slot_number, participant_name, is_winner, score, created_at, updated_at';
const roundSettingSelect =
  'id, category_id, round_number, round_name, deadline_text, created_at, updated_at';
const bracketMatchHeight = 64;
const bracketBaseGap = 10;
const bracketColumnWidth = 232;
const bracketColumnGap = 44;

function TournamentsPage() {
  const { categoryId } = useParams();
  const [categories, setCategories] = useState<TournamentCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<TournamentCategory | null>(null);
  const [drawSlots, setDrawSlots] = useState<TournamentDrawSlot[]>([]);
  const [roundSettings, setRoundSettings] = useState<TournamentRoundSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCategoryLoading, setIsCategoryLoading] = useState(Boolean(categoryId));
  const [isDrawLoading, setIsDrawLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [categoryErrorMessage, setCategoryErrorMessage] = useState('');
  const [drawErrorMessage, setDrawErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadCategories() {
      setIsLoading(true);
      setErrorMessage('');

      const { data, error } = await supabase
        .from('tournament_categories')
        .select(categorySelect)
        .order('display_order', { ascending: true });

      if (!isMounted) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        setCategories([]);
      } else {
        setCategories((data ?? []) as TournamentCategory[]);
      }

      setIsLoading(false);
    }

    loadCategories();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadSelectedCategoryDraw() {
      setActiveCategory(null);
      setDrawSlots([]);
      setRoundSettings([]);
      setCategoryErrorMessage('');
      setDrawErrorMessage('');
      setIsDrawLoading(false);

      if (!categoryId) {
        setIsCategoryLoading(false);
        return;
      }

      setIsCategoryLoading(true);

      const { data: categoryRow, error: categoryError } = await supabase
        .from('tournament_categories')
        .select(categorySelect)
        .eq('id', categoryId)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (categoryError || !categoryRow) {
        setActiveCategory(null);
        setCategoryErrorMessage(
          categoryError?.message ?? 'Tournament category not found.',
        );
        setIsCategoryLoading(false);
        return;
      }

      const category = categoryRow as TournamentCategory;

      setActiveCategory(category);
      setIsCategoryLoading(false);

      if (!category.is_published) {
        setIsDrawLoading(false);
        return;
      }

      setIsDrawLoading(true);

      const [
        { data: slotRows, error: slotsError },
        { data: settingRows, error: settingsError },
      ] = await Promise.all([
        supabase
          .from('tournament_draw_slots')
          .select(drawSlotSelect)
          .eq('category_id', category.id)
          .order('round_number', { ascending: true })
          .order('match_number', { ascending: true })
          .order('slot_number', { ascending: true }),
        supabase
          .from('tournament_round_settings')
          .select(roundSettingSelect)
          .eq('category_id', category.id)
          .order('round_number', { ascending: true }),
      ]);

      if (!isMounted) {
        return;
      }

      if (slotsError || settingsError) {
        setDrawErrorMessage(
          slotsError?.message ?? settingsError?.message ?? 'Unable to load draw.',
        );
        setDrawSlots([]);
        setRoundSettings([]);
      } else {
        setDrawSlots((slotRows ?? []) as TournamentDrawSlot[]);
        setRoundSettings((settingRows ?? []) as TournamentRoundSetting[]);
      }

      setIsDrawLoading(false);
    }

    loadSelectedCategoryDraw();

    return () => {
      isMounted = false;
    };
  }, [categoryId]);

  return (
    <AppLayout>
      <section className="mx-auto w-full max-w-[96rem] space-y-5">
        {categoryId ? (
          <TournamentCategoryDraw
            category={activeCategory}
            drawErrorMessage={drawErrorMessage}
            drawSlots={drawSlots}
            errorMessage={categoryErrorMessage}
            isDrawLoading={isDrawLoading}
            isLoading={isCategoryLoading}
            roundSettings={roundSettings}
          />
        ) : (
          <TournamentCategoryList
            categories={categories}
            errorMessage={errorMessage}
            isLoading={isLoading}
          />
        )}
      </section>
    </AppLayout>
  );
}

function TournamentCategoryList({
  categories,
  errorMessage,
  isLoading,
}: {
  categories: TournamentCategory[];
  errorMessage: string;
  isLoading: boolean;
}) {
  return (
    <>
      <header className="overflow-hidden rounded-[2rem] border border-line-200 bg-white shadow-sm">
        <div className="h-1.5 bg-court-900" />
        <div className="px-5 py-6 sm:px-7">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-court-700">
            Roton Point
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-ink-900 sm:text-4xl">
            {TOURNAMENT_PORTAL_LABEL}
          </h1>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-ink-700">
            Select a tournament category to view the draw.
          </p>
        </div>
      </header>

      {isLoading && (
        <section className="rounded-[1.5rem] border border-line-200 bg-white p-6 text-sm font-bold text-ink-700 shadow-sm">
          Loading tournament categories...
        </section>
      )}

      {!isLoading && errorMessage && (
        <section className="rounded-[2rem] border border-red-200 bg-red-50 p-6 text-sm font-bold text-red-800">
          {errorMessage}
        </section>
      )}

      {!isLoading && !errorMessage && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {categories.map((category) => (
            <Link
              className="group overflow-hidden rounded-[1.25rem] border border-line-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-court-500 hover:shadow-md"
              key={category.id}
              to={`/tournaments/${category.id}`}
            >
              <div className="h-1 bg-court-900 transition group-hover:bg-court-500" />
              <div className="flex min-h-44 flex-col justify-between p-5">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-black leading-6 tracking-tight text-ink-900">
                      {category.name}
                    </h2>
                    <CategoryStatusPill category={category} />
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-2.5">
                    <CategoryMeta
                      label="Event"
                      value={formatTournamentEventType(category.event_type)}
                    />
                    <CategoryMeta label="Draw" value={`${category.draw_size}`} />
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-line-200 pt-3">
                  <span className="text-xs font-black uppercase tracking-[0.12em] text-court-800 transition group-hover:text-court-600">
                    View Draw
                  </span>
                  <span className="grid size-7 place-items-center rounded-full border border-line-200 bg-court-50 text-sm font-black text-court-900 transition group-hover:border-court-500 group-hover:bg-court-900 group-hover:text-white">
                    &gt;
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!isLoading && !errorMessage && categories.length === 0 && (
        <section className="rounded-[1.5rem] border border-line-200 bg-white p-8 text-center text-sm font-bold text-ink-700 shadow-sm">
          Tournament categories will be posted here.
        </section>
      )}
    </>
  );
}

function TournamentCategoryDraw({
  category,
  drawErrorMessage,
  drawSlots,
  errorMessage,
  isDrawLoading,
  isLoading,
  roundSettings,
}: {
  category: TournamentCategory | null;
  drawErrorMessage: string;
  drawSlots: TournamentDrawSlot[];
  errorMessage: string;
  isDrawLoading: boolean;
  isLoading: boolean;
  roundSettings: TournamentRoundSetting[];
}) {
  if (isLoading) {
    return (
      <section className="rounded-[1.5rem] border border-line-200 bg-white p-6 text-sm font-bold text-ink-700 shadow-sm">
        Loading category draw...
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="rounded-[2rem] border border-red-200 bg-red-50 p-6 text-sm font-bold text-red-800">
        {errorMessage}
      </section>
    );
  }

  if (!category) {
    return (
      <section className="rounded-[1.5rem] border border-line-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold text-ink-700">Tournament category not found.</p>
        <Link className="btn-secondary mt-4" to="/tournaments">
          Back to categories
        </Link>
      </section>
    );
  }

  return (
    <>
      <header className="overflow-hidden rounded-[2rem] border border-line-200 bg-white shadow-sm">
        <div className="h-1.5 bg-court-900" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="px-5 py-6 sm:px-7">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-court-700">
              {TOURNAMENT_PORTAL_LABEL}
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-ink-900 sm:text-4xl">
              {category.name}
            </h1>
            <p className="mt-3 text-sm font-semibold text-ink-700">
              {category.draw_size} {formatTournamentEventType(category.event_type)} draw
            </p>
          </div>
          <div className="px-5 pb-5 sm:px-7 sm:pt-6">
            <Link className="btn-secondary" to="/tournaments">
              Back to categories
            </Link>
          </div>
        </div>
      </header>

      {!category.is_published ? (
        <section className="rounded-[1.5rem] border border-line-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-court-50 text-lg font-black text-court-900">
            RP
          </div>
          <p className="mt-4 text-sm font-black text-ink-900">Draw will be posted here.</p>
        </section>
      ) : isDrawLoading ? (
        <section className="premium-card rounded-[2rem] p-6 text-sm font-bold text-ink-700">
          Loading draw...
        </section>
      ) : drawErrorMessage ? (
        <section className="rounded-[2rem] border border-red-200 bg-red-50 p-6 text-sm font-bold text-red-800">
          {drawErrorMessage}
        </section>
      ) : (
        <TournamentBracket
          category={category}
          drawSlots={drawSlots}
          roundSettings={roundSettings}
        />
      )}
    </>
  );
}

function TournamentBracket({
  category,
  drawSlots,
  roundSettings,
}: {
  category: TournamentCategory;
  drawSlots: TournamentDrawSlot[];
  roundSettings: TournamentRoundSetting[];
}) {
  const rounds = buildTournamentBracketRounds({
    drawSize: category.draw_size,
    roundSettings,
    slots: drawSlots,
  });
  const layout = getBracketLayout(rounds, bracketColumnWidth, bracketColumnGap);

  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-line-200 bg-white shadow-sm">
      <div className="border-b border-line-200 bg-white px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-court-700">
              Published Draw
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-ink-900">
              {category.name}
            </h2>
          </div>
          <div className="rounded-xl border border-line-200 bg-slate-50 px-3 py-2 text-sm font-black text-ink-900">
            {category.draw_size} {formatTournamentEventType(category.event_type)} draw
          </div>
        </div>
      </div>

      <div className="overflow-x-auto bg-[#f8fafc] px-4 py-5 sm:px-6">
        <div className="min-w-max pb-2" style={{ width: layout.canvasWidth }}>
          <div className="flex pb-3" style={{ gap: layout.columnGap }}>
            {rounds.map((round) => (
              <div
                className="shrink-0"
                key={round.roundNumber}
                style={{ width: layout.columnWidth }}
              >
                <div className="sticky left-0 z-[1] rounded-xl border border-line-200 bg-white px-3 py-2 shadow-sm shadow-slate-900/5">
                  <h3 className="text-xs font-black uppercase tracking-[0.12em] text-ink-900">
                    {round.roundName}
                  </h3>
                  <p className="mt-1 text-xs font-bold text-ink-700">
                    Deadline: {round.deadlineText}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div
            className="relative"
            style={{ height: layout.canvasHeight, width: layout.canvasWidth }}
          >
            <BracketConnectors layout={layout} rounds={rounds} strokeClass="stroke-court-100" />
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
                  <BracketMatchBox match={match} />
                </div>
              )),
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function BracketMatchBox({ match }: { match: TournamentBracketMatch }) {
  return (
    <article className="h-full overflow-hidden rounded-xl border border-line-200 bg-white shadow-sm shadow-slate-900/5 ring-1 ring-white">
      <div className="h-5 border-b border-line-200 bg-court-50 px-2.5 py-1">
        <p className="text-[0.62rem] font-black uppercase tracking-[0.12em] text-ink-700">
          Match {match.matchNumber}
        </p>
      </div>
      {match.slots.map((slot) => (
        <div
          className="flex h-[22px] items-center border-b border-line-200 px-2.5 last:border-b-0"
          key={`${slot.match_number}-${slot.slot_number}`}
        >
          <span className="truncate text-sm font-semibold text-ink-900">
            {slot.participant_name?.trim() || 'TBD'}
          </span>
        </div>
      ))}
    </article>
  );
}

type BracketLayout = {
  canvasHeight: number;
  canvasWidth: number;
  columnGap: number;
  columnWidth: number;
  getColumnLeft: (roundIndex: number) => number;
  getMatchTop: (roundIndex: number, matchIndex: number) => number;
  matchHeight: number;
};

function getBracketLayout(
  rounds: TournamentBracketRound[],
  columnWidth: number,
  columnGap: number,
): BracketLayout {
  const firstRoundMatchCount = rounds[0]?.matches.length ?? 1;
  const step = bracketMatchHeight + bracketBaseGap;
  const canvasHeight = firstRoundMatchCount * step - bracketBaseGap;
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
      const groupCenter = groupStart + (groupSize * step) / 2 - bracketBaseGap / 2;

      return groupCenter - bracketMatchHeight / 2;
    },
    matchHeight: bracketMatchHeight,
  };
}

function BracketConnectors({
  layout,
  rounds,
  strokeClass,
}: {
  layout: BracketLayout;
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

function CategoryMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[0.68rem] font-black uppercase tracking-[0.1em] text-ink-700">
        {label}
      </p>
      <p className="mt-1 text-sm font-black text-ink-900">{value}</p>
    </div>
  );
}

function CategoryStatusPill({ category }: { category: TournamentCategory }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-[0.08em] ${
        category.is_published
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-amber-200 bg-amber-50 text-amber-800'
      }`}
    >
      {getTournamentCategoryStatus(category)}
    </span>
  );
}

export default TournamentsPage;
