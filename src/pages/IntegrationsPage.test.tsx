import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import IntegrationsPage from './IntegrationsPage';
import * as api from '../api/integrationsApi';
import type { Integration } from '../api/integrationsApi';

vi.mock('../api/integrationsApi', () => ({
  getIntegrations: vi.fn(),
  connectIntegration: vi.fn(),
  disconnectIntegration: vi.fn(),
  saveIntegrationValue: vi.fn(),
}));

// The API-keys section fetches on mount; mock its API so the page test stays hermetic.
vi.mock('../api/apiKeysApi', () => ({
  getApiKeys: vi.fn().mockResolvedValue([]),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}));

const spotify: Integration = {
  key: 'spotify',
  name: 'Spotify',
  auth_kind: 'oauth',
  connected: true,
  source: 'admin',
  authorized_at: '2026-08-01T00:00:00Z',
  expires_at: '2027-01-28T00:00:00Z',
};

const github: Integration = {
  key: 'github',
  name: 'GitHub',
  auth_kind: 'api_key',
  connected: false,
  source: null,
  authorized_at: null,
  expires_at: null,
};

const duolingo: Integration = {
  key: 'duolingo',
  name: 'Duolingo',
  auth_kind: 'value',
  connected: false,
  source: null,
  authorized_at: null,
  expires_at: null,
};

/** The default three-integration list. Override individual entries per test. */
function list(overrides: Partial<Record<Integration['key'], Integration>> = {}): Integration[] {
  return [
    { ...spotify, ...overrides.spotify },
    { ...github, ...overrides.github },
    { ...duolingo, ...overrides.duolingo },
  ];
}

function renderPage(initialPath = '/integrations') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <IntegrationsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getIntegrations).mockResolvedValue(list());
  vi.mocked(api.connectIntegration).mockResolvedValue('https://accounts.spotify.com/authorize?x=1');
  vi.mocked(api.disconnectIntegration).mockResolvedValue();
  vi.mocked(api.saveIntegrationValue).mockResolvedValue();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('IntegrationsPage — list of cards (§4.7)', () => {
  it('renders one card per integration from the API', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Spotify' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Duolingo' })).toBeInTheDocument();
  });

  it('hosts the API keys section with its scope description', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'API keys' })).toBeInTheDocument();
    expect(
      screen.getByText(/programmatic access to posts, media upload, and the blogs list/i),
    ).toBeInTheDocument();
  });
});

describe('IntegrationsPage — oauth card (Spotify reconnect §4.6)', () => {
  it('shows a connected admin token with its authorization and expiry dates', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-01T00:00:00Z'), shouldAdvanceTime: true });
    renderPage();

    expect(await screen.findByTestId('spotify-status-chip')).toHaveTextContent('Connected');
    const expiry = screen.getByTestId('spotify-expiry');
    expect(expiry).toHaveTextContent(/expires/i);
    expect(expiry).toHaveTextContent(/149 days left/);
    expect(screen.getByRole('button', { name: /reconnect spotify/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^disconnect$/i })).toBeEnabled();
  });

  it('escalates to a warning under 30 days and to expired past the date', async () => {
    vi.useFakeTimers({ now: new Date('2027-01-20T00:00:00Z'), shouldAdvanceTime: true });
    renderPage();
    const warn = await screen.findByTestId('spotify-expiry');
    expect(warn.className).toMatch(/colorWarning/);

    vi.mocked(api.getIntegrations).mockResolvedValue(
      list({ spotify: { ...spotify, expires_at: '2027-01-10T00:00:00Z' } }),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByTestId('spotify-status-chip').at(-1)).toHaveTextContent('Expired'),
    );
  });

  it('flags the untracked secrets-sourced token and offers Connect, not Disconnect', async () => {
    vi.mocked(api.getIntegrations).mockResolvedValue(
      list({
        spotify: {
          ...spotify,
          connected: true,
          source: 'secrets',
          authorized_at: null,
          expires_at: null,
        },
      }),
    );
    renderPage();

    expect(await screen.findByTestId('spotify-expiry')).toHaveTextContent(
      /may expire without warning/i,
    );
    expect(screen.getByRole('button', { name: /connect spotify/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^disconnect$/i })).not.toBeInTheDocument();
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
        expect(api.connectIntegration).toHaveBeenCalledWith(
          'spotify',
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
    await user.click(await screen.findByRole('button', { name: /^disconnect$/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/nothing playing until you reconnect/i)).toBeInTheDocument();
    expect(api.disconnectIntegration).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /^disconnect$/i }));
    await waitFor(() => expect(api.disconnectIntegration).toHaveBeenCalledWith('spotify'));
    // Refreshes the status after disconnecting.
    expect(api.getIntegrations).toHaveBeenCalledTimes(2);
  });
});

describe('IntegrationsPage — api_key card (GitHub)', () => {
  it('uses a password field with the token helper text and never prefills', async () => {
    renderPage();
    const input = (await screen.findByTestId('github-input')) as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.value).toBe('');
    expect(
      screen.getByText(/personal access token — public data only \(read:user\)/i),
    ).toBeInTheDocument();
  });

  it('saves the entered value via PUT and refetches, without ever showing a stored value', async () => {
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByTestId('github-input');
    await user.type(input, 'ghp_secret123');
    // The GitHub card's Save button — scope to the card, not Spotify's buttons.
    const card = screen.getByRole('heading', { name: 'GitHub' }).closest('.MuiPaper-root')!;
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(api.saveIntegrationValue).toHaveBeenCalledWith('github', 'ghp_secret123'),
    );
    expect(api.getIntegrations).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/github saved/i)).toBeInTheDocument();
  });

  it('shows "Connected · saved <date>" instead of the value when connected', async () => {
    vi.mocked(api.getIntegrations).mockResolvedValue(
      list({
        github: {
          ...github,
          connected: true,
          source: 'admin',
          authorized_at: '2026-07-04T00:00:00Z',
        },
      }),
    );
    renderPage();

    const saved = await screen.findByTestId('github-saved');
    expect(saved).toHaveTextContent(/Connected · saved/i);
    expect(saved).toHaveTextContent(/2026/);
    // The value is never rendered — only an empty password input remains.
    expect((screen.getByTestId('github-input') as HTMLInputElement).value).toBe('');
  });

  it('disconnect is gated behind a per-card confirm', async () => {
    vi.mocked(api.getIntegrations).mockResolvedValue(
      list({
        github: { ...github, connected: true, source: 'admin', authorized_at: '2026-07-04T00:00:00Z' },
      }),
    );
    const user = userEvent.setup();
    renderPage();

    const card = (await screen.findByRole('heading', { name: 'GitHub' })).closest(
      '.MuiPaper-root',
    ) as HTMLElement;
    await user.click(within(card).getByRole('button', { name: /^disconnect$/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/removes the stored github credential/i)).toBeInTheDocument();
    expect(api.disconnectIntegration).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /^disconnect$/i }));
    await waitFor(() => expect(api.disconnectIntegration).toHaveBeenCalledWith('github'));
  });
});

describe('IntegrationsPage — value card (Duolingo)', () => {
  it('uses a plain text field with the username helper text', async () => {
    renderPage();
    const input = (await screen.findByTestId('duolingo-input')) as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(screen.getByText(/duolingo username \(public\)/i)).toBeInTheDocument();
  });

  it('saves the entered value via PUT and refetches', async () => {
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByTestId('duolingo-input');
    await user.type(input, 'my_handle');
    const card = screen.getByRole('heading', { name: 'Duolingo' }).closest('.MuiPaper-root')!;
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(api.saveIntegrationValue).toHaveBeenCalledWith('duolingo', 'my_handle'),
    );
    expect(api.getIntegrations).toHaveBeenCalledTimes(2);
  });
});
