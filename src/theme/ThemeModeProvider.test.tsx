import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeModeProvider, useThemeMode } from './ThemeModeProvider';

const STORAGE_KEY = 'pv6admin_theme_mode';

// Provided by src/test/setup.ts — flips the mocked prefers-color-scheme and notifies.
function setPrefersDark(value: boolean) {
  act(() => {
    (window as unknown as { __setPrefersDark: (v: boolean) => void }).__setPrefersDark(value);
  });
}

function Probe() {
  const { preference, resolvedMode, setPreference } = useThemeMode();
  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <span data-testid="resolved">{resolvedMode}</span>
      <button onClick={() => setPreference('light')}>light</button>
      <button onClick={() => setPreference('dark')}>dark</button>
      <button onClick={() => setPreference('system')}>system</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  setPrefersDark(false);
});

describe('ThemeModeProvider', () => {
  test('defaults to the system preference', () => {
    render(
      <ThemeModeProvider>
        <Probe />
      </ThemeModeProvider>,
    );
    expect(screen.getByTestId('preference')).toHaveTextContent('system');
    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
  });

  test('resolves to dark when the system prefers dark under the system setting', () => {
    setPrefersDark(true);
    render(
      <ThemeModeProvider>
        <Probe />
      </ThemeModeProvider>,
    );
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
  });

  test('reacts to a live system theme change while on the system setting', async () => {
    render(
      <ThemeModeProvider>
        <Probe />
      </ThemeModeProvider>,
    );
    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
    setPrefersDark(true);
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
  });

  test('a manual override persists to localStorage and wins over the system preference', async () => {
    render(
      <ThemeModeProvider>
        <Probe />
      </ThemeModeProvider>,
    );

    await userEvent.click(screen.getByText('dark'));

    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');

    // System flips to light, but the manual dark override still wins.
    setPrefersDark(false);
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
  });

  test('restores a persisted preference on mount', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    setPrefersDark(true);
    render(
      <ThemeModeProvider>
        <Probe />
      </ThemeModeProvider>,
    );
    expect(screen.getByTestId('preference')).toHaveTextContent('light');
    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
  });
});
