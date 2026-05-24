import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setResetMessage('');
    setIsSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    navigate('/dashboard', { replace: true });
  }

  async function handlePasswordReset() {
    setErrorMessage('');
    setResetMessage('');

    if (!email.trim()) {
      setErrorMessage('Enter your email address first.');
      return;
    }

    setIsSendingReset(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setIsSendingReset(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setResetMessage('Password reset email sent. Please check your inbox.');
    setShowForgotPassword(false);
  }

  return (
    <main className="auth-shell login-shell grid min-h-screen place-items-center px-6 py-12 text-ink-900">
      <section className="premium-card relative z-[1] w-full max-w-md rounded-[2rem] p-8 text-center sm:p-10">
        <div className="mx-auto flex size-24 items-center justify-center overflow-hidden rounded-[1.75rem] bg-white shadow-lg ring-1 ring-line-200 sm:size-28">
          <img
            alt="Roton Point logo"
            className="block size-20 object-contain sm:size-24"
            height="112"
            src="/images/logo1.png"
            width="112"
          />
        </div>
        <h1 className="mt-5 text-3xl font-black leading-tight tracking-tight text-ink-900 sm:text-4xl">
          Roton Point Tennis Tournament Ladder
        </h1>
        <p className="mt-2 text-sm font-black uppercase tracking-[0.18em] text-court-700">
          Club Challenge Portal
        </p>
        <p className="mt-4 text-sm leading-6 text-ink-700">
          Enter the club ladder and manage your next challenge.
        </p>
        <form className="mt-8 space-y-5" onSubmit={handleLogin}>
          <label className="block text-left">
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
          <label className="block text-left">
            <span className="flex items-center justify-between gap-3 text-sm font-medium text-ink-700">
              <span>Password</span>
              <button
                className="text-xs font-bold text-court-700 transition hover:text-court-500"
                type="button"
                onClick={() => {
                  setErrorMessage('');
                  setResetMessage('');
                  setShowForgotPassword((isVisible) => !isVisible);
                }}
              >
                Forgot password?
              </button>
            </span>
            <input
              className="form-input mt-2"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {showForgotPassword && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-left">
              <p className="text-sm font-bold text-ink-900">Reset your password</p>
              <p className="mt-1 text-sm leading-6 text-ink-700">
                Enter your email above, then send a reset link to your inbox.
              </p>
              <button
                className="mt-3 inline-flex items-center justify-center rounded-full bg-court-900 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-court-700 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={handlePasswordReset}
                disabled={isSendingReset}
              >
                {isSendingReset ? 'Sending...' : 'Send reset email'}
              </button>
            </div>
          )}
          {errorMessage && (
            <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {errorMessage}
            </p>
          )}
          {resetMessage && (
            <p className="rounded-md border border-court-300 bg-court-50 px-4 py-3 text-sm font-medium text-court-800">
              {resetMessage}
            </p>
          )}
          <button
            className="btn-primary w-full"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Logging in...' : 'Log in'}
          </button>
        </form>
        <p className="mt-6 text-sm text-ink-700">
          Need an account?{' '}
          <Link
            className="font-bold text-court-700 hover:text-court-500"
            to="/signup"
          >
            Sign up
          </Link>
        </p>
      </section>
    </main>
  );
}

export default LoginPage;
