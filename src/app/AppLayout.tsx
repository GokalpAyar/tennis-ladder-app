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
    <div className="app-shell min-h-screen text-ink-900">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-court-900 text-white shadow-sm">
        <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <Link className="flex items-center gap-4" to="/dashboard">
            <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lg shadow-black/15 ring-1 ring-white/20 sm:size-20">
              <img
                alt=""
                className="block size-14 object-contain sm:size-[4.5rem]"
                height="72"
                src="/images/logo.png"
                width="72"
              />
            </span>
            <span>
              <span className="hidden text-lg font-black leading-tight tracking-tight sm:block xl:text-2xl">
                Roton Point Tennis Tournament Ladder
              </span>
              <span className="block text-xl font-black leading-tight tracking-tight sm:hidden">
                Roton Point Ladder
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
      <main className="app-content relative z-[1] min-h-[calc(100vh-5rem)] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
      <footer className="relative z-[1] border-t border-white/20 bg-white/90 px-4 py-5 text-sm text-ink-700 shadow-sm backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-bold text-ink-900">Court Reservations</p>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            <a className="font-semibold text-court-800 hover:text-court-600" href="mailto:tenis@rotonpoint.org">
              tenis@rotonpoint.org
            </a>
            <a className="font-semibold text-court-800 hover:text-court-600" href="tel:2038381606">
              203-838-1606 ext. 101
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default AppLayout;
