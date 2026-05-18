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

type AuthContextValue = {
  isLoading: boolean;
  profileStatus: 'pending' | 'approved';
  role: 'player' | 'admin';
  session: Session | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profileStatus, setProfileStatus] = useState<'pending' | 'approved'>('approved');
  const [role, setRole] = useState<'player' | 'admin'>('player');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      try {
        const { data } = await supabase.auth.getSession();

        if (!isMounted) {
          return;
        }

        setSession(data.session);
        setIsLoading(false);
        loadProfile(data.session).then((profile) => {
          if (isMounted) {
            setRole(profile.role);
            setProfileStatus(profile.status);
          }
        });
      } catch {
        if (isMounted) {
          setSession(null);
          setProfileStatus('approved');
          setRole('player');
          setIsLoading(false);
        }
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
      loadProfile(nextSession).then((profile) => {
        if (isMounted) {
          setRole(profile.role);
          setProfileStatus(profile.status);
        }
      });
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      isLoading,
      profileStatus,
      role,
      session,
    }),
    [isLoading, profileStatus, role, session],
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
