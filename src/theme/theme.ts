import { createTheme, type Theme } from '@mui/material/styles';

// Spec §14.4: one theme module, light AND dark palettes defined together. Styling in
// the admin goes through this theme object and `sx` — there are no parallel CSS files.

const sharedSettings = {
  typography: {
    fontFamily: [
      'Inter',
      'Roboto',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Helvetica',
      'Arial',
      'sans-serif',
    ].join(','),
    h6: { fontWeight: 600 },
  },
  shape: {
    borderRadius: 8,
  },
} as const;

export const lightTheme: Theme = createTheme({
  ...sharedSettings,
  palette: {
    mode: 'light',
    primary: { main: '#2563eb' },
    secondary: { main: '#7c3aed' },
    background: { default: '#f6f7f9', paper: '#ffffff' },
    error: { main: '#d32f2f' },
    success: { main: '#2e7d32' },
    warning: { main: '#ed6c02' },
  },
});

export const darkTheme: Theme = createTheme({
  ...sharedSettings,
  palette: {
    mode: 'dark',
    primary: { main: '#60a5fa' },
    secondary: { main: '#a78bfa' },
    background: { default: '#0f1115', paper: '#161a22' },
    error: { main: '#f26' },
    success: { main: '#66bb6a' },
    warning: { main: '#ffa726' },
  },
});

export type ResolvedMode = 'light' | 'dark';

export function themeForMode(mode: ResolvedMode): Theme {
  return mode === 'dark' ? darkTheme : lightTheme;
}
