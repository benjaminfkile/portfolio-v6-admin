import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { themeForMode, type ResolvedMode } from './theme';

// Spec §14.4: mode follows the system by default (`prefers-color-scheme`), with a manual
// light / dark / system override persisted in localStorage. `CssBaseline` applies the
// theme globally.
export type ThemeModePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'pv6admin_theme_mode';
const DARK_QUERY = '(prefers-color-scheme: dark)';

interface ThemeModeContextValue {
  /** The user's stored preference, including the `system` option. */
  preference: ThemeModePreference;
  /** The palette actually applied after resolving `system`. */
  resolvedMode: ResolvedMode;
  setPreference: (preference: ThemeModePreference) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | undefined>(undefined);

function readStoredPreference(): ThemeModePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage may be unavailable (private mode, SSR) — fall through to default.
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DARK_QUERY).matches
    : false;
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemeModePreference>(readStoredPreference);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  // Track the system preference so a `system` choice stays live as the OS theme flips.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mql.addEventListener('change', onChange);
    setSystemDark(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const setPreference = useCallback((next: ThemeModePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Persisting is best-effort; the in-memory choice still applies this session.
    }
  }, []);

  const resolvedMode: ResolvedMode =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  const theme = useMemo(() => themeForMode(resolvedMode), [resolvedMode]);

  const value = useMemo<ThemeModeContextValue>(
    () => ({ preference, resolvedMode, setPreference }),
    [preference, resolvedMode, setPreference],
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) {
    throw new Error('useThemeMode must be used within a ThemeModeProvider');
  }
  return ctx;
}
