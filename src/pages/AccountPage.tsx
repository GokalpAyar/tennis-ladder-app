import { useEffect, useMemo, useState, type FormEvent } from 'react';
import AppLayout from '../app/AppLayout';
import { useAuth } from '../app/AuthProvider';
import { supabase } from '../lib/supabase';
import {
  ensureProfile,
  formatSupabaseError,
  toProfile,
  type Profile,
} from './accountProfile';

const accountSupabase = supabase as any;

type Ranking = {
  losses: number | null;
  rank_position: number | null;
  wins: number | null;
};

function AccountPage() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [fullName, setFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const email = profile?.email || session?.user.email || 'Email unavailable';
  const wins = ranking?.wins ?? 0;
  const losses = ranking?.losses ?? 0;
  const rankPosition = ranking?.rank_position ?? null;

  const recordLabel = useMemo(() => `${wins}-${losses}`, [wins, losses]);

  useEffect(() => {
    let isMounted = true;

    async function loadAccount() {
      if (!session?.user) {
        return;
      }

      setIsLoading(true);
      setErrorMessage('');

      const profileResult = await ensureProfile(session.user, accountSupabase);

      const [rankingResult] = await Promise.all([
        accountSupabase
          .from('ladder_rankings')
          .select('rank_position, wins, losses')
          .eq('player_id', session.user.id)
          .maybeSingle(),
      ]);

      if (!isMounted) {
        return;
      }

      if (profileResult.error) {
        console.error('Account profile load error:', profileResult.error);
        setErrorMessage(formatSupabaseError(profileResult.error));
      } else {
        setProfile(profileResult.data);
        setFullName(profileResult.data?.full_name ?? '');
      }

      if (rankingResult.error) {
        console.error('Account ranking load error:', rankingResult.error);
      } else {
        setRanking((rankingResult.data ?? null) as Ranking | null);
      }

      setIsLoading(false);
    }

    loadAccount();

    return () => {
      isMounted = false;
    };
  }, [session?.user]);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session?.user) {
      return;
    }

    const currentUser = session.user;
    const trimmedName = fullName.trim();

    if (!trimmedName) {
      setProfileMessage('');
      setErrorMessage('Please enter your full name.');
      return;
    }

    setIsSavingProfile(true);
    setErrorMessage('');
    setProfileMessage('');

    const ensuredProfile = await ensureProfile(currentUser, accountSupabase);

    if (ensuredProfile.error) {
      setIsSavingProfile(false);
      console.error('Profile creation before update failed:', ensuredProfile.error);
      setErrorMessage(`Could not create your profile. ${formatSupabaseError(ensuredProfile.error)}`);
      return;
    }

    const { data, error } = await accountSupabase
      .rpc('update_my_profile_full_name', { new_full_name: trimmedName })
      .maybeSingle();

    setIsSavingProfile(false);

    if (error) {
      console.error('Profile update error:', error);
      setErrorMessage(formatSupabaseError(error));
      return;
    }

    if (!data) {
      setErrorMessage(
        'Profile update did not return a profile. Please make sure the profile self-update policy has been applied in Supabase.',
      );
      return;
    }

    const updatedProfile = toProfile(data);

    setProfile(updatedProfile);
    setFullName(updatedProfile.full_name ?? '');
    setProfileMessage('Profile updated successfully.');
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage('');
    setPasswordMessage('');

    if (newPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsSavingPassword(true);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    setIsSavingPassword(false);

    if (error) {
      console.error('Password update error:', error);
      setErrorMessage(formatSupabaseError(error));
      return;
    }

    setNewPassword('');
    setConfirmPassword('');
    setPasswordMessage('Password updated successfully.');
  }

  return (
    <AppLayout>
      <section className="mx-auto w-full max-w-5xl space-y-5">
        <header className="hero-panel rounded-[2rem] p-5 sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-court-700">
            Account
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-ink-900 sm:text-4xl">
            My Profile
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-700">
            Manage your club profile details and password.
          </p>
        </header>

        {errorMessage && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
            {errorMessage}
          </div>
        )}

        {isLoading ? (
          <div className="premium-card rounded-[2rem] p-6 text-sm font-bold text-ink-700">
            Loading account...
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <aside className="premium-card rounded-[2rem] p-5 sm:p-6">
              <div className="flex items-center gap-4">
                <div className="flex size-16 items-center justify-center rounded-2xl bg-court-900 text-2xl font-black text-white">
                  {(fullName || email).charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-court-700">
                    Player Account
                  </p>
                  <h2 className="mt-1 text-xl font-black text-ink-900">
                    {profile?.full_name || 'Name not set'}
                  </h2>
                </div>
              </div>

              <dl className="mt-6 grid gap-3">
                <AccountStat label="Email" value={email} />
                <AccountStat
                  label="Ladder Rank"
                  value={rankPosition ? `#${rankPosition}` : 'Not ranked yet'}
                />
                <AccountStat label="Record" value={recordLabel} />
              </dl>
            </aside>

            <div className="space-y-5">
              <form
                className="premium-card rounded-[2rem] p-5 sm:p-6"
                onSubmit={handleProfileSubmit}
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-court-700">
                    Profile Details
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-ink-900">
                    Update your name
                  </h2>
                </div>

                <label className="mt-5 block">
                  <span className="text-sm font-black text-ink-900">Full name</span>
                  <input
                    className="mt-2 w-full rounded-2xl border border-line-200 bg-white px-4 py-3 text-base font-semibold text-ink-900 outline-none transition focus:border-court-500 focus:ring-4 focus:ring-blue-100"
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    autoComplete="name"
                  />
                </label>

                <label className="mt-4 block">
                  <span className="text-sm font-black text-ink-900">Email</span>
                  <input
                    className="mt-2 w-full cursor-not-allowed rounded-2xl border border-line-200 bg-slate-50 px-4 py-3 text-base font-semibold text-ink-700"
                    type="email"
                    value={email}
                    disabled
                    readOnly
                  />
                  <span className="mt-2 block text-xs font-semibold text-ink-600">
                    Email is connected to your login and cannot be edited here.
                  </span>
                </label>

                {profileMessage && (
                  <p className="mt-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800">
                    {profileMessage}
                  </p>
                )}

                <button
                  className="mt-5 inline-flex items-center justify-center rounded-full bg-court-900 px-5 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-court-800 disabled:cursor-not-allowed disabled:opacity-60"
                  type="submit"
                  disabled={isSavingProfile}
                >
                  {isSavingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </form>

              <form
                className="premium-card rounded-[2rem] p-5 sm:p-6"
                onSubmit={handlePasswordSubmit}
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-court-700">
                    Security
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-ink-900">
                    Update password
                  </h2>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-black text-ink-900">New password</span>
                    <input
                      className="mt-2 w-full rounded-2xl border border-line-200 bg-white px-4 py-3 text-base font-semibold text-ink-900 outline-none transition focus:border-court-500 focus:ring-4 focus:ring-blue-100"
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      autoComplete="new-password"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-black text-ink-900">
                      Confirm new password
                    </span>
                    <input
                      className="mt-2 w-full rounded-2xl border border-line-200 bg-white px-4 py-3 text-base font-semibold text-ink-900 outline-none transition focus:border-court-500 focus:ring-4 focus:ring-blue-100"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                    />
                  </label>
                </div>

                <p className="mt-3 text-xs font-semibold text-ink-600">
                  Password must be at least 6 characters.
                </p>

                {passwordMessage && (
                  <p className="mt-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800">
                    {passwordMessage}
                  </p>
                )}

                <button
                  className="mt-5 inline-flex items-center justify-center rounded-full bg-court-900 px-5 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-court-800 disabled:cursor-not-allowed disabled:opacity-60"
                  type="submit"
                  disabled={isSavingPassword}
                >
                  {isSavingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </div>
          </div>
        )}
      </section>
    </AppLayout>
  );
}

function AccountStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line-200 bg-white px-4 py-3 shadow-sm">
      <dt className="text-xs font-black uppercase tracking-[0.14em] text-ink-500">
        {label}
      </dt>
      <dd className="mt-1 text-base font-black text-ink-900">{value}</dd>
    </div>
  );
}

export default AccountPage;
