import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  getDefaultRouteForPortal,
  getPortalPreferenceFromSession,
  hasLadderPortalAccess,
  type PortalPreference,
} from './portalAccess';

type AuthContextValue = {
  defaultRoute: string;
  hasLadderAccess: boolean;
  isLoading: boolean;
  portalPreference: PortalPreference;
  profileStatus: 'pending' | 'approved';
  role: 'player' | 'admin';
  session: Session | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [portalPreference, setPortalPreference] = useState<PortalPreference>('ladder');
  const [profileStatus, setProfileStatus] = useState<'pending' | 'approved'>('approved');
  const [role, setRole] = useState<'player' | 'admin'>('player');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let loadSequence = 0;

    async function applySession(nextSession: Session | null) {
      const currentSequence = loadSequence + 1;
      loadSequence = currentSequence;

      if (isMounted) {
        setIsLoading(true);
      }

      const nextPortalPreference = getPortalPreferenceFromSession(nextSession);
      const profile = await loadProfile(nextSession);

      if (!isMounted || currentSequence !== loadSequence) {
        return;
      }

      setSession(nextSession);
      setPortalPreference(nextPortalPreference);
      setRole(profile.role);
      setProfileStatus(profile.status);
      setIsLoading(false);
    }

    async function loadSession() {
      try {
        const { data } = await supabase.auth.getSession();
        await applySession(data.session);
      } catch {
        await applySession(null);
      }
    }

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const hasLadderAccess = hasLadderPortalAccess(portalPreference, role);
  const defaultRoute = getDefaultRouteForPortal(hasLadderAccess ? 'ladder' : 'tournament');

  const value = useMemo(
    () => ({
      defaultRoute,
      hasLadderAccess,
      isLoading,
      portalPreference,
      profileStatus,
      role,
      session,
    }),
    [defaultRoute, hasLadderAccess, isLoading, portalPreference, profileStatus, role, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

async function loadProfile(session: Session | null): Promise<{
  role: 'player' | 'admin';
  status: 'pending' | 'approved';
}> {
  if (!session) {
    return { role: 'player', status: 'approved' };
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .select('role, status')
        .eq('id', session.user.id)
        .maybeSingle(),
      4000,
    );

    return {
      role: error || data?.role !== 'admin' ? 'player' : 'admin',
      status: data?.status === 'approved' ? 'approved' : 'pending',
    };
  } catch {
    return { role: 'player', status: 'approved' };
  }
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('Request timed out.'));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}
