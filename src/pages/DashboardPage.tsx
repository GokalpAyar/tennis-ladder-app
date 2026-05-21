import AppLayout from '../app/AppLayout';
import { useAuth } from '../app/AuthProvider';
import ChallengePlayerSystem from '../features/challenges/ChallengePlayerSystem';

function DashboardPage() {
  const { profileStatus, role, session } = useAuth();

  return (
    <AppLayout>
      <section className="mx-auto w-full max-w-5xl space-y-4">
        {profileStatus === 'pending' && role !== 'admin' ? (
          <PendingApprovalGuide />
        ) : (
          <>
            {role === 'admin' && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm font-bold text-court-900">
                Player Preview Mode: admin tools remain available from the Admin
                Control Center, and this preview does not require a ladder ranking.
              </div>
            )}

            {session?.user.id ? (
              <ChallengePlayerSystem
                adminPreview={role === 'admin'}
                userId={session.user.id}
                variant="dashboard"
              />
            ) : null}
          </>
        )}
      </section>
    </AppLayout>
  );
}

const approvalSteps = [
  'Wait for club approval',
  'Admin assigns your ladder ranking',
  'Once approved, challenge players up to 3 spots above you',
  'Agree on a match time',
  'Contact the tennis office to reserve the court',
  'Play your match and report the winner',
];

const ladderRules = [
  'You may challenge up to 3 spots above your rank',
  'If the lower-ranked challenger wins, both players switch positions',
  'If the higher-ranked player wins, rankings stay the same',
  'One active match at a time',
];

const approvedGuideSteps = [
  'Review your current rank',
  'Choose an eligible player up to 3 spots above you',
  'Send a challenge',
  'Agree on one of the proposed match times',
  'Call the tennis office to reserve a court',
  'Play your match and report the winner',
];

function PendingApprovalGuide() {
  return (
    <div className="space-y-5">
      <section
        className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm sm:p-8 lg:p-10"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgb(255 255 255 / 0.92), rgb(248 250 252 / 0.88)), url('/images/dashboard-bg.jpg')",
          backgroundPosition: 'center',
          backgroundSize: 'cover',
        }}
      >
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <div className="flex size-24 items-center justify-center overflow-hidden rounded-[1.75rem] bg-white shadow-lg ring-1 ring-line-200 sm:size-28">
            <img
              alt="Roton Point logo"
              className="block size-20 object-contain sm:size-24"
              height="112"
              src="/images/logo1.png"
              width="112"
            />
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-court-700">
            Club Challenge Portal
          </p>
          <h1 className="mt-3 text-3xl font-black leading-tight tracking-tight text-ink-900 sm:text-4xl lg:text-5xl">
            Welcome to the Roton Point Tennis Tournament Ladder
          </h1>
          <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-ink-700">
            Your account is awaiting admin approval.
          </p>
        </div>
      </section>

      <section className="premium-card rounded-[2rem] p-5 sm:p-7">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-court-700">
            What Happens Next
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-ink-900">
            Your ladder journey
          </h2>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {approvalSteps.map((step, index) => (
            <article
              className="rounded-2xl border border-line-200 bg-white px-4 py-4 shadow-sm"
              key={step}
            >
              <div className="flex size-9 items-center justify-center rounded-full bg-court-900 text-sm font-black text-white">
                {index + 1}
              </div>
              <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-court-700">
                Step {index + 1}
              </p>
              <p className="mt-1 text-sm font-black leading-6 text-ink-900">{step}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="premium-card rounded-[2rem] p-5 sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-court-700">
            How Ladder Works
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-ink-900">
            Simple rules to remember
          </h2>
          <div className="mt-5 grid gap-3">
            {ladderRules.map((rule) => (
              <div
                className="flex gap-3 rounded-2xl border border-line-200 bg-white px-4 py-3 text-sm font-semibold text-ink-800 shadow-sm"
                key={rule}
              >
                <CheckDot />
                <span>{rule}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="premium-card rounded-[2rem] p-5 sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-court-700">
            Contact
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-ink-900">
            Court Reservations
          </h2>
          <p className="mt-3 text-sm leading-6 text-ink-700">
            Once your match time is agreed, contact the tennis office to reserve a court.
          </p>
          <div className="mt-5 grid gap-3">
            <a
              className="rounded-2xl border border-line-200 bg-white px-4 py-3 text-sm font-black text-court-900 shadow-sm transition hover:border-court-500 hover:bg-court-50"
              href="mailto:tennis@rotonpoint.org"
            >
              tennis@rotonpoint.org
            </a>
            <a
              className="rounded-2xl border border-line-200 bg-white px-4 py-3 text-sm font-black text-court-900 shadow-sm transition hover:border-court-500 hover:bg-court-50"
              href="tel:2038381606"
            >
              203-838-1606 ext. 101
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

function ApprovedPlayerGuide() {
  return (
    <section className="premium-card rounded-[2rem] p-5 sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-court-700">
            Player Guide
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-ink-900">
            How to use the ladder
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-700">
            Follow these steps when you are ready to challenge, schedule, and
            complete a match.
          </p>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-court-900">
          Court Reservations: tennis@rotonpoint.org - 203-838-1606 ext. 101
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {approvedGuideSteps.map((step, index) => (
          <article
            className="rounded-2xl border border-line-200 bg-white px-4 py-4 shadow-sm"
            key={step}
          >
            <div className="flex size-9 items-center justify-center rounded-full bg-court-900 text-sm font-black text-white">
              {index + 1}
            </div>
            <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-court-700">
              Step {index + 1}
            </p>
            <p className="mt-1 text-sm font-black leading-6 text-ink-900">{step}</p>
          </article>
        ))}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-4">
        {ladderRules.map((rule) => (
          <div
            className="flex gap-3 rounded-2xl border border-line-200 bg-white px-4 py-3 text-sm font-semibold text-ink-800 shadow-sm"
            key={rule}
          >
            <CheckDot />
            <span>{rule}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CheckDot() {
  return (
    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-court-900">
      <svg aria-hidden="true" className="size-3" fill="none" viewBox="0 0 24 24">
        <path
          d="m5 12 4 4L19 6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
      </svg>
    </span>
  );
}

export default DashboardPage;
