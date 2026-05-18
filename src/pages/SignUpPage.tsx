import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

function SignUpPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
        },
      },
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    navigate('/dashboard', { replace: true });
  }

  return (
    <main className="auth-shell grid min-h-screen place-items-center px-6 py-12 text-ink-900">
      <section className="premium-card w-full max-w-md rounded-[2rem] p-8 sm:p-10">
        <p className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-court-700">
          Tennis Ladder
        </p>
        <h1 className="text-4xl font-black leading-tight">Create account</h1>
        <p className="mt-3 text-sm leading-6 text-ink-700">
          Join the club ladder and start tracking your matches.
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