import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase';

function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  const navItems = [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Ladder', to: '/ladder' },
    ...(role === 'admin' ? [{ label: 'Admin', to: '/admin' }] : []),
  ];

  return (
    <div className="min-h-screen bg-court-50 text-ink-900">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-court-900 text-white shadow-sm">
        <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <Link className="flex items-center gap-3" to="/dashboard">
            <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lg shadow-black/15 ring-1 ring-white/20">
              <img
                alt=""
                className="block size-8 object-contain"
                height="44"
                src="/logo.png"
                width="44"
              />
            </span>
            <span>
              <span className="block text-xl font-black tracking-tight">
                Tennis Ladder
              </span>
              <span className="block text-xs font-bold uppercase tracking-[0.18em] text-white/60">
                Club Challenge Portal
              </span>
            </span>
          </Link>

          <nav className="flex items-center gap-2 overflow-x-auto rounded-2xl bg-white/10 p-1.5 lg:overflow-visible">
            {navItems.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  `shrink-0 rounded-full px-4 py-2.5 text-sm font-extrabold transition ${
                    isActive
                      ? 'bg-white text-court-900 shadow-sm'
                      : 'text-white/80 hover:bg-white/15 hover:text-white'
                  }`
                }
                key={item.to}
                to={item.to}
              >
                {item.label}
              </NavLink>
            ))}
            <button
              className="shrink-0 rounded-full border border-white/20 px-4 py-2.5 text-sm font-extrabold text-white transition hover:border-lime-300 hover:bg-lime-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? 'Logging out...' : 'Logout'}
            </button>
          </nav>
        </div>
      </header>
      <main className="min-h-[calc(100vh-5rem)] bg-court-50 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
    </div>
  );
}

export default AppLayout;
