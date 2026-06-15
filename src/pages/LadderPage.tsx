import { Link } from 'react-router-dom';
import AppLayout from '../app/AppLayout';
import { useAuth } from '../app/AuthProvider';
import { MENS_LADDER_PORTAL_LABEL } from '../app/portalAccess';
import ChallengePlayerSystem from '../features/challenges/ChallengePlayerSystem';

function LadderPage() {
  const { role, session } = useAuth();

  return (
    <AppLayout>
      <section className="mx-auto w-full max-w-[96rem] space-y-4 sm:space-y-5">
        <header className="hero-panel ladder-hero rounded-[2rem] p-4 sm:p-5 lg:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-court-700">
                {MENS_LADDER_PORTAL_LABEL}
              </p>
              <h1 className="mt-1.5 text-3xl font-black tracking-tight text-ink-900 sm:text-4xl">
                Pyramid Ladder
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-700">
                Climb the court by challenging eligible players up to 3 spots
                above your current rank.
              </p>
            </div>
            <Link
              className="btn-secondary"
              to="/dashboard"
            >
              Back to Dashboard
            </Link>
          </div>
        </header>

        {role === 'admin' && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm font-bold text-court-900">
            Player Preview Mode: ladder actions are disabled for unranked admin accounts.
          </div>
        )}

        {session?.user.id && (
          <ChallengePlayerSystem
            adminPreview={role === 'admin'}
            userId={session.user.id}
            variant="ladder"
          />
        )}
      </section>
    </AppLayout>
  );
}

export default LadderPage;
