import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase';

function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsMenuOpen(false);
    setIsLoggingOut(true);
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  const navItems = [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Ladder', to: '/ladder' },
    { label: 'Activities', to: '/activities' },
    { label: 'Court Info', to: '/court-info' },
  ];
  const desktopNavItems = [{ label: 'Dashboard', to: '/dashboard' }];

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
                src="/images/logo1.png"
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

          <nav className="relative flex flex-wrap items-center justify-end gap-2">
            <div className="hidden items-center gap-1 rounded-2xl bg-white/10 p-1.5 lg:flex">
              {desktopNavItems.map((item) => (
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
            </div>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-white/15"
              type="button"
              aria-expanded={isMenuOpen}
              aria-haspopup="menu"
              onClick={() => setIsMenuOpen((current) => !current)}
            >
              <MenuIcon />
              <span className="sm:hidden">Menu</span>
              <span className="hidden sm:inline">Account Menu</span>
            </button>

            {isMenuOpen && (
              <div
                className="absolute right-0 top-12 z-30 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line-200 bg-white text-ink-900 shadow-xl"
                role="menu"
              >
                <div className="border-b border-line-200 px-4 py-3">
                  <p className="text-sm font-black">Account Menu</p>
                  <p className="mt-1 text-xs font-semibold text-ink-700">
                    Quick links and court information.
                  </p>
                </div>

                <div className="p-2">
                  {navItems.map((item) => (
                    <Link
                      className="block rounded-xl px-4 py-3 text-sm font-bold text-ink-900 transition hover:bg-court-50 hover:text-court-900"
                      key={item.to}
                      to={item.to}
                      role="menuitem"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {item.label === 'Dashboard' ? 'My Dashboard' : item.label}
                    </Link>
                  ))}
                  {role === 'admin' && (
                    <Link
                      className="block rounded-xl px-4 py-3 text-sm font-bold text-ink-900 transition hover:bg-court-50 hover:text-court-900"
                      to="/admin"
                      role="menuitem"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Admin
                    </Link>
                  )}
                  <Link
                    className="block rounded-xl px-4 py-3 text-sm font-bold text-ink-900 transition hover:bg-court-50 hover:text-court-900"
                    to="/account"
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Account / Profile
                  </Link>
                  <div className="mt-2 rounded-xl border border-line-200 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-black text-ink-900">Contact / Court Info</p>
                    <a
                      className="mt-2 block text-sm font-bold text-court-800 hover:text-court-600"
                      href="mailto:tenis@rotonpoint.org"
                    >
                      tenis@rotonpoint.org
                    </a>
                    <a
                      className="mt-1 block text-sm font-bold text-court-800 hover:text-court-600"
                      href="tel:2038381606"
                    >
                      203-838-1606 ext. 101
                    </a>
                  </div>
                  <button
                    className="mt-2 block w-full rounded-xl px-4 py-3 text-left text-sm font-black text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                  >
                    {isLoggingOut ? 'Logging out...' : 'Logout'}
                  </button>
                </div>
              </div>
            )}
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

function MenuIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export default AppLayout;
