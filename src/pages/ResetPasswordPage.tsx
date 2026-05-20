import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      setHasRecoverySession(Boolean(data.session));
      setIsCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) {
        return;
      }

      if (event === 'PASSWORD_RECOVERY' || session) {
        setHasRecoverySession(true);
      }

      setIsCheckingSession(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handlePasswordUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (newPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    if (!hasRecoverySession) {
      setErrorMessage('This reset link is missing or expired. Please request a new password reset email.');
      return;
    }

    setIsSubmitting(true);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage('Password updated successfully. You can now log in.');
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
        <h1 className="mt-5 text-3xl font-black leading-tight tracking-tight text-ink-900">
          Reset Password
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-700">
          Enter a new password for your Roton Point ladder account.
        </p>

        <form className="mt-8 space-y-5 text-left" onSubmit={handlePasswordUpdate}>
          <label className="block">
            <span className="text-sm font-medium text-ink-700">New password</span>
            <input
              className="form-input mt-2"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink-700">Confirm password</span>
            <input
              className="form-input mt-2"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
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
          {successMessage && (
            <p className="rounded-md border border-court-300 bg-court-50 px-4 py-3 text-sm font-medium text-court-800">
              {successMessage}
            </p>
          )}
          {!isCheckingSession && !hasRecoverySession && !successMessage && (
            <p className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-court-900">
              Open this page from the password reset email so we can verify your reset session.
            </p>
          )}

          <button
            className="btn-primary w-full"
            type="submit"
            disabled={isSubmitting || isCheckingSession || !hasRecoverySession}
          >
            {isSubmitting ? 'Updating...' : isCheckingSession ? 'Checking link...' : 'Update password'}
          </button>
        </form>

        <p className="mt-6 text-sm text-ink-700">
          <button
            className="font-bold text-court-700 hover:text-court-500"
            type="button"
            onClick={() => navigate('/login', { replace: true })}
          >
            Back to login
          </button>
        </p>
      </section>
    </main>
  );
}

export default ResetPasswordPage;
