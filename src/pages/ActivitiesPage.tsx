import AppLayout from '../app/AppLayout';
import { useAuth } from '../app/AuthProvider';
import ChallengePlayerSystem from '../features/challenges/ChallengePlayerSystem';

function ActivitiesPage() {
  const { role, session } = useAuth();

  return (
    <AppLayout>
      <section className="mx-auto w-full max-w-[92rem] space-y-4 sm:space-y-5">
        <header className="hero-panel dashboard-hero rounded-[2rem] p-4 sm:p-5 lg:p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-court-700">
            Match Workspace
          </p>
          <h1 className="mt-1.5 text-2xl font-black leading-tight tracking-tight text-ink-900 sm:text-3xl lg:text-4xl">
            Activities
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-700">
            Handle sent challenges, received challenges, time proposals,
            scheduled matches, winner submission, and completed matches.
          </p>
        </header>

        {session?.user.id && (
          <ChallengePlayerSystem
            adminPreview={role === 'admin'}
            userId={session.user.id}
            variant="activities"
          />
        )}
      </section>
    </AppLayout>
  );
}

export default ActivitiesPage;
