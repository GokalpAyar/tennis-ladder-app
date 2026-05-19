import { Link } from 'react-router-dom';
import AppLayout from '../app/AppLayout';
import { useAuth } from '../app/AuthProvider';
import ChallengePlayerSystem from '../features/challenges/ChallengePlayerSystem';

function DashboardPage() {
  const { profileStatus, session } = useAuth();

  return (
    <AppLayout>
      <section className="mx-auto w-full max-w-[92rem] space-y-4 sm:space-y-5">
        <header className="hero-panel dashboard-hero rounded-[2rem] p-4 sm:p-5 lg:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/70">
                Tennis Ladder
              </p>
              <h1 className="mt-1.5 max-w-3xl text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl lg:text-4xl">
                Dashboard
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">
                See your rank, eligible opponents, active challenges, and scheduled matches at a glance.
              </p>
            </div>
            {profileStatus === 'approved' && (
              <div className="grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
                <a
                  className="inline-flex items-center justify-center rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20"
                  href="#match-activity"
                >
                  Match Activity
                </a>
                <a
                  className="inline-flex items-center justify-center rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20"
                  href="#scheduled-matches"
                >
                  Scheduled Matches
                </a>
                <Link className="btn-primary w-full text-sm sm:w-auto" to="/ladder">
                  Full Ladder
                </Link>
              </div>
            )}
          </div>
        </header>

        {profileStatus === 'pending' ? (
          <section className="rounded-[2rem] border border-line-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm font-black uppercase tracking-[0.14em] text-court-700">
              Registration Pending
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-ink-900">
              Your registration is pending admin approval.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-700">
              An admin will review your account, approve your registration, and assign
              your starting ladder rank.
            </p>
          </section>
        ) : session?.user.id ? (
          <ChallengePlayerSystem userId={session.user.id} variant="dashboard" />
        ) : null}
      </section>
    </AppLayout>
  );
}

export default DashboardPage;
