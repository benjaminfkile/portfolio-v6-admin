import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import IntegrationsPage from './IntegrationsPage';
import * as api from '../api/spotifyApi';
import type { SpotifyStatus } from '../api/spotifyApi';

vi.mock('../api/spotifyApi', () => ({
  getSpotifyStatus: vi.fn(),
  connectSpotify: vi.fn(),
  disconnectSpotify: vi.fn(),
}));

const adminStatus: SpotifyStatus = {
  connected: true,
  source: 'admin',
  authorized_at: '2026-08-01T00:00:00Z',
  expires_at: '2027-01-28T00:00:00Z',
};

function renderPage(initialPath = '/integrations') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <IntegrationsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getSpotifyStatus).mockResolvedValue(adminStatus);
  vi.mocked(api.connectSpotify).mockResolvedValue('https://accounts.spotify.com/authorize?x=1');
  vi.mocked(api.disconnectSpotify).mockResolvedValue();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('IntegrationsPage (§4.6 Spotify reconnect)', () => {
  it('shows a connected admin token with its authorization and expiry dates', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-01T00:00:00Z'), shouldAdvanceTime: true });
    renderPage();

    expect(await screen.findByTestId('spotify-status-chip')).toHaveTextContent('Connected');
    const expiry = screen.getByTestId('spotify-expiry');
    expect(expiry).toHaveTextContent(/expires/i);
    expect(expiry).toHaveTextContent(/149 days left/);
    expect(screen.getByRole('button', { name: /reconnect spotify/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeEnabled();
  });

  it('escalates to a warning under 30 days and to expired past the date', async () => {
    vi.useFakeTimers({ now: new Date('2027-01-20T00:00:00Z'), shouldAdvanceTime: true });
    renderPage();
    const warn = await screen.findByTestId('spotify-expiry');
    expect(warn.className).toMatch(/colorWarning/);

    vi.mocked(api.getSpotifyStatus).mockResolvedValue({
      ...adminStatus,
      expires_at: '2027-01-10T00:00:00Z',
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByTestId('spotify-status-chip').at(-1)).toHaveTextContent('Expired'),
    );
  });

  it('flags the untracked secrets-sourced token and offers Connect, not Disconnect', async () => {
    vi.mocked(api.getSpotifyStatus).mockResolvedValue({
      connected: true,
      source: 'secrets',
      authorized_at: null,
      expires_at: null,
    });
    renderPage();

    expect(await screen.findByTestId('spotify-expiry')).toHaveTextContent(
      /may expire without warning/i,
    );
    expect(screen.getByRole('button', { name: /connect spotify/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /disconnect/i })).not.toBeInTheDocument();
  });

  it('connect asks the API for the authorize URL with this page as return_to and navigates there', async () => {
    // jsdom's window.location.assign is not implemented — replace it.
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...original, assign, origin: original.origin },
      writable: true,
    });
    try {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole('button', { name: /reconnect spotify/i }));

      await waitFor(() =>
        expect(api.connectSpotify).toHaveBeenCalledWith(
          `${window.location.origin}/integrations`,
        ),
      );
      expect(assign).toHaveBeenCalledWith('https://accounts.spotify.com/authorize?x=1');
    } finally {
      Object.defineProperty(window, 'location', { value: original, writable: true });
    }
  });

  it('toasts the callback result carried in ?spotify=connected', async () => {
    renderPage('/integrations?spotify=connected');
    expect(
      await screen.findByText(/spotify is connected\. now-playing is using the new authorization/i),
    ).toBeInTheDocument();
  });

  it('toasts the failure carried in ?spotify=error', async () => {
    renderPage('/integrations?spotify=error');
    expect(await screen.findByText(/connecting spotify failed/i)).toBeInTheDocument();
  });

  it('disconnect is gated behind an explicit confirm', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /disconnect/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/nothing playing until you reconnect/i)).toBeInTheDocument();
    expect(api.disconnectSpotify).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /^disconnect$/i }));
    await waitFor(() => expect(api.disconnectSpotify).toHaveBeenCalledTimes(1));
    // Refreshes the status after disconnecting.
    expect(api.getSpotifyStatus).toHaveBeenCalledTimes(2);
  });
});
