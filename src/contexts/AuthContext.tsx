import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { signIn, signOut, getIdToken } from '../lib/cognitoClient';

// Adapted from FileManager's AuthContext. Portfolio v6 has exactly one class of user and
// no `users` table / `/me` endpoint (spec §5.3), so authentication state is derived
// directly from the presence of a valid Cognito id token rather than a profile fetch.
export interface AdminUser {
  /** `email` / `sub` claims off the id token when decodable; may be empty for opaque tokens. */
  email: string;
  sub?: string;
}

interface AuthContextValue {
  currentUser: AdminUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Best-effort decode of a JWT payload. Never throws; returns null on any malformed input. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json =
      typeof atob === 'function'
        ? atob(normalized)
        : Buffer.from(normalized, 'base64').toString('binary');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function userFromToken(token: string, fallbackEmail = ''): AdminUser {
  const claims = decodeJwtPayload(token);
  return {
    email: (claims?.email as string) ?? fallbackEmail,
    sub: claims?.sub as string | undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // On mount, restore the session from the id token the Cognito SDK persisted.
  useEffect(() => {
    let cancelled = false;

    getIdToken()
      .then((token) => {
        if (cancelled) return;
        setCurrentUser(token ? userFromToken(token) : null);
      })
      .catch(() => {
        if (!cancelled) {
          signOut();
          setCurrentUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const token = await signIn(email, password);
    setCurrentUser(userFromToken(token, email));
  }, []);

  const logout = useCallback(() => {
    signOut();
    setCurrentUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ currentUser, isLoading, login, logout }),
    [currentUser, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
