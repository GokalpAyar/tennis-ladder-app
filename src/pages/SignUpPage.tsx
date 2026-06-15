import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getDefaultRouteForPortal,
  MENS_LADDER_PORTAL_LABEL,
  TOURNAMENT_PORTAL_LABEL,
  type PortalPreference,
} from '../app/portalAccess';
import { supabase } from '../lib/supabase';

const portalOptions: Array<{
  helperText: string;
  label: string;
  value: PortalPreference;
}> = [
  {
    helperText: 'View tournament draws and schedules.',
    label: TOURNAMENT_PORTAL_LABEL,
    value: 'tournament',
  },
  {
    helperText: 'Request access to the Roton Point Men\u2019s Ladder.',
    label: MENS_LADDER_PORTAL_LABEL,
    value: 'ladder',
  },
  {
    helperText: 'Use both the Tournament Portal and Men\u2019s Ladder Portal.',
    label: 'Both',
    value: 'both',
  },
];

function SignUpPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [portalPreference, setPortalPreference] = useState<PortalPreference | ''>('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');

    if (!portalPreference) {
      setErrorMessage('Choose what you would like to use.');
      return;
    }

    setIsSubmitting(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          portal_preference: portalPreference,
        },
      },
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    navigate(getDefaultRouteForPortal(portalPreference), { replace: true });
  }

  return (
    <main className="auth-shell grid min-h-screen place-items-center px-6 py-12 text-ink-900">
      <section className="premium-card w-full max-w-md rounded-[2rem] p-8 sm:p-10">
        <p className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-court-700">
          Roton Point Tennis Portals
        </p>
        <h1 className="text-4xl font-black leading-tight">Create account</h1>
        <p className="mt-3 text-sm leading-6 text-ink-700">
          Choose the club experience you want to use first.
        </p>
        <form className="mt-8 space-y-5" onSubmit={handleSignUp}>
          <label className="block">
            <span className="text-sm font-medium text-ink-700">Full name</span>
            <input
              className="form-input mt-2"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink-700">Email</span>
            <input
              className="form-input mt-2"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink-700">Password</span>
            <input
              className="form-input mt-2"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-ink-700">
              What would you like to use?
            </legend>
            <div className="mt-2 grid gap-3">
              {portalOptions.map((option) => (
                <label
                  className={`flex cursor-pointer items-start justify-between gap-4 rounded-2xl border px-4 py-3 transition ${
                    portalPreference === option.value
                      ? 'border-court-500 bg-court-50 text-court-900 ring-4 ring-blue-100'
                      : 'border-line-200 bg-white text-ink-900 hover:border-court-500'
                  }`}
                  key={option.value}
                >
                  <span>
                    <span className="block text-sm font-black">{option.label}</span>
                    <span className="mt-1 block text-sm font-semibold leading-5 text-ink-700">
                      {option.helperText}
                    </span>
                  </span>
                  <input
                    className="mt-1 size-4 shrink-0 accent-blue-700"
                    type="radio"
                    name="portalPreference"
                    value={option.value}
                    checked={portalPreference === option.value}
                    onChange={() => setPortalPreference(option.value)}
                    required
                  />
                </label>
              ))}
            </div>
          </fieldset>
          {errorMessage && (
            <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {errorMessage}
            </p>
          )}
          <button
            className="btn-primary w-full"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating account...' : 'Sign up'}
          </button>
        </form>
        <p className="mt-6 text-sm text-ink-700">
          Already have an account?{' '}
          <Link
            className="font-bold text-court-700 hover:text-court-500"
            to="/login"
          >
            Log in
          </Link>
        </p>
      </section>
    </main>
  );
}

export default SignUpPage;
