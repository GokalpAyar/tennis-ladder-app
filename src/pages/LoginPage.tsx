import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
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

  return (
    <main className="auth-shell login-shell grid min-h-screen place-items-center px-6 py-12 text-ink-900">
      <section className="premium-card relative z-[1] w-full max-w-md rounded-[2rem] p-8 sm:p-10">
        <p className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-court-700">
          Tennis Ladder
        </p>
        <h1 className="text-4xl font-black leading-tight">Log in</h1>
        <p className="mt-3 text-sm leading-6 text-ink-700">
          Enter the club ladder and manage your next challenge.
        </p>
        <form className="mt-8 space-y-5" onSubmit={handleLogin}>
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
              autoComplete="current-password"
              required
            />
          </label>
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
        <p className="mt-3 text-xs text-ink-700">
          Staff access?{' '}
          <Link
            className="font-bold text-court-700 hover:text-court-500"
            to="/admin-login"
          >
            Admin Login
          </Link>
        </p>
      </section>
    </main>
  );
}

export default LoginPage;
