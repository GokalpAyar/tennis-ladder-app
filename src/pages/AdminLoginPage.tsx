import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleAdminLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setIsSubmitting(false);
      setErrorMessage(authError.message);
      return;
    }

    const userId = authData.user?.id;

    if (!userId) {
      setIsSubmitting(false);
      setErrorMessage('Unable to verify admin access.');
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    setIsSubmitting(false);

    if (profileError) {
      setErrorMessage(profileError.message);
      return;
    }

    if (profile?.role !== 'admin') {
      await supabase.auth.signOut();
      setErrorMessage('You do not have admin access');
      return;
    }

    navigate('/admin', { replace: true });
  }

  return (
    <main className="auth-shell grid min-h-screen place-items-center px-6 py-12 text-ink-900">
      <section className="premium-card w-full max-w-md rounded-[2rem] p-8 sm:p-10">
        <p className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-court-700">
          Tennis Ladder
        </p>
        <h1 className="text-4xl font-black leading-tight">Admin login</h1>
        <p className="mt-3 text-sm leading-6 text-ink-700">
          Sign in with an admin account to manage players, matches, and ladder operations.
        </p>
        <form className="mt-8 space-y-5" onSubmit={handleAdminLogin}>
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
          <button className="btn-primary w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Checking access...' : 'Log in as admin'}
          </button>
        </form>
        <p className="mt-6 text-sm text-ink-700">
          Player account?{' '}
          <Link className="font-bold text-court-700 hover:text-court-500" to="/login">
            Back to player login
          </Link>
        </p>
      </section>
    </main>
  );
}

export default AdminLoginPage;
