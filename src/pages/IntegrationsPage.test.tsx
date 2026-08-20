import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import IntegrationsPage from './IntegrationsPage';
import * as api from '../api/integrationsApi';
import type {
  CredentialIntegration,
  Integration,
  SpotifyIntegration,
} from '../api/integrationsApi';

vi.mock('../api/integrationsApi', () => ({
  getIntegrations: vi.fn(),
  connectIntegration: vi.fn(),
  disconnectIntegration: vi.fn(),
  saveIntegrationValue: vi.fn(),
  disconnectSpotify: vi.fn(),
  disableSpotify: vi.fn(),
  enableSpotify: vi.fn(),
  saveSpotifyListener: vi.fn(),
  removeSpotifyListener: vi.fn(),
}));

// The API-keys section fetches on mount; mock its API so the page test stays hermetic.
vi.mock('../api/apiKeysApi', () => ({
  getApiKeys: vi.fn().mockResolvedValue([]),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}));

const spotify: SpotifyIntegration = {
  key: 'spotify',
  name: 'Spotify',
  auth_kind: 'oauth',
  state: 'connected',
  last_success_at: '2026-08-31T23:00:00Z',
  last_error: null,
  rate_limited_until: null,
  authorized_at: '2026-08-01T00:00:00Z',
  expires_at: '2027-01-28T00:00:00Z',
  listener: { credential_present: false, state: 'never_run' },
};

const github: CredentialIntegration = {
  key: 'github',
  name: 'GitHub',
  auth_kind: 'api_key',
  connected: false,
  source: null,
  authorized_at: null,
};

const duolingo: CredentialIntegration = {
  key: 'duolingo',
  name: 'Duolingo',
  auth_kind: 'value',
  connected: false,
  source: null,
  authorized_at: null,
};

interface Overrides {
  spotify?: Partial<SpotifyIntegration>;
  github?: Partial<CredentialIntegration>;
  duolingo?: Partial<CredentialIntegration>;
}

/** The default three-integration list. Override individual entries per test. */
function list(overrides: Overrides = {}): Integration[] {
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
  vi.mocked(api.disconnectSpotify).mockResolvedValue();
  vi.mocked(api.disableSpotify).mockResolvedValue();
  vi.mocked(api.enableSpotify).mockResolvedValue();
  vi.mocked(api.saveSpotifyListener).mockResolvedValue();
  vi.mocked(api.removeSpotifyListener).mockResolvedValue();
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

  it('hosts the API keys section with its widened scope description', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'API keys' })).toBeInTheDocument();
    expect(
      screen.getByText(/full content-editing surface/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/key management and integration credentials stay admin-only/i),
    ).toBeInTheDocument();
  });
});

describe('IntegrationsPage — Spotify state machine (§4.7 overhaul)', () => {
  it('connected: green chip with last-successful-fetch relative time and grant countdown', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-01T00:00:00Z'), shouldAdvanceTime: true });
    renderPage();

    const chip = await screen.findByTestId('spotify-status-chip');
    expect(chip).toHaveTextContent('Connected');
    expect(chip.className).toMatch(/colorSuccess/);

    expect(screen.getByTestId('spotify-state-detail')).toHaveTextContent(
      /last successful fetch .* hour|last successful fetch .* minute/i,
    );

    const expiry = screen.getByTestId('spotify-expiry');
    expect(expiry).toHaveTextContent(/expires/i);
    expect(expiry).toHaveTextContent(/149 days left/);
  });

  it('auth_broken: red chip, reconnect prompt, and last_error timestamp', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-01T00:00:00Z'), shouldAdvanceTime: true });
    vi.mocked(api.getIntegrations).mockResolvedValue(
      list({
        spotify: {
          state: 'auth_broken',
          last_success_at: '2026-08-25T00:00:00Z',
          last_error: { kind: 'refresh_failed', at: '2026-08-30T12:00:00Z' },
        },
      }),
    );
    renderPage();

    const chip = await screen.findByTestId('spotify-status-chip');
    expect(chip).toHaveTextContent(/authorization broken/i);
    expect(chip.className).toMatch(/colorError/);

    const detail = screen.getByTestId('spotify-state-detail');
    expect(detail).toHaveTextContent(/authorization broken — reconnect/i);
    expect(detail).toHaveTextContent(/last error .* (hour|day)s? ago/i);
  });

  it('rate_limited: amber chip and the rate_limited_until wall clock', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-01T00:00:00Z'), shouldAdvanceTime: true });
    vi.mocked(api.getIntegrations).mockResolvedValue(
      list({
        spotify: {
          state: 'rate_limited',
          rate_limited_until: '2026-09-01T02:30:00Z',
        },
      }),
    );
    renderPage();

    const chip = await screen.findByTestId('spotify-status-chip');
    expect(chip).toHaveTextContent(/rate limited/i);
    expect(chip.className).toMatch(/colorWarning/);
    expect(screen.getByTestId('spotify-state-detail')).toHaveTextContent(/rate limited until/i);
  });

  it('disconnected: neutral chip, "not connected", hides Disconnect, shows Connect', async () => {
    vi.mocked(api.getIntegrations).mockResolvedValue(
      list({
        spotify: {
          state: 'disconnected',
          last_success_at: null,
          authorized_at: null,
          expires_at: null,
        },
      }),
    );
    renderPage();

    const chip = await screen.findByTestId('spotify-status-chip');
    expect(chip).toHaveTextContent(/not connected/i);
    expect(chip.className).not.toMatch(/colorSuccess|colorError|colorWarning/);

    expect(screen.getByRole('button', { name: /connect spotify/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^disconnect$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^disable$/i })).toBeInTheDocument();
    // No expiry alert when there is no grant.
    expect(screen.queryByTestId('spotify-expiry')).not.toBeInTheDocument();
  });

  it('disabled: gray "disabled by admin", hides Reconnect/Disconnect, shows Enable', async () => {
    vi.mocked(api.getIntegrations).mockResolvedValue(
      list({ spotify: { state: 'disabled' } }),
    );
    renderPage();

    const chip = await screen.findByTestId('spotify-status-chip');
    expect(chip).toHaveTextContent(/^disabled$/i);
    expect(screen.getByTestId('spotify-state-detail')).toHaveTextContent(/disabled by admin/i);

    expect(screen.queryByRole('button', { name: /reconnect spotify|connect spotify/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^disconnect$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^enable$/i })).toBeInTheDocument();
  });

  it('never renders "Connected" unless the API state is connected', async () => {
    vi.mocked(api.getIntegrations).mockResolvedValue(
      list({
        spotify: {
          state: 'auth_broken',
          // A live grant still present but the token is dead — this was the old lie:
          // "any credential = Connected". The new chip must not be misled by it.
          authorized_at: '2026-08-01T00:00:00Z',
          expires_at: '2027-01-28T00:00:00Z',
        },
      }),
    );
    renderPage();
    const chip = await screen.findByTestId('spotify-status-chip');
    expect(chip).not.toHaveTextContent(/^connected$/i);
  });
});

describe('IntegrationsPage — Spotify grant expiry countdown', () => {
  it('warns inside the 14-day window', async () => {
    vi.useFakeTimers({ now: new Date('2027-01-20T00:00:00Z'), shouldAdvanceTime: true });
    renderPage();
    const warn = await screen.findByTestId('spotify-expiry');
    expect(warn.className).toMatch(/colorWarning/);
    expect(warn).toHaveTextContent(/8 days left/);
  });

  it('stays at info outside the 14-day window', async () => {
    vi.useFakeTimers({ now: new Date('2027-01-10T00:00:00Z'), shouldAdvanceTime: true });
    renderPage();
    const info = await screen.findByTestId('spotify-expiry');
    expect(info.className).toMatch(/colorInfo/);
  });

  it('shows expired copy and error styling past the expiry date', async () => {
    vi.useFakeTimers({ now: new Date('2027-02-01T00:00:00Z'), shouldAdvanceTime: true });
    vi.mocked(api.getIntegrations).mockResolvedValue(
      list({
        spotify: {
          state: 'auth_broken',
          expires_at: '2027-01-10T00:00:00Z',
        },
      }),
    );
    renderPage();
    const expiry = await screen.findByTestId('spotify-expiry');
    expect(expiry.className).toMatch(/colorError/);
    expect(expiry).toHaveTextContent(/expired/i);
  });

  it('no static-server-secret warning banner is ever rendered', async () => {
    vi.mocked(api.getIntegrations).mockResolvedValue(
      list({
        spotify: {
          state: 'connected',
          authorized_at: null,
          expires_at: null,
        },
      }),
    );
    renderPage();
    await screen.findByTestId('spotify-status-chip');
    expect(screen.queryByText(/static server-secret token/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/may expire without warning/i)).not.toBeInTheDocument();
  });
});

describe('IntegrationsPage — Spotify controls (§4.7 overhaul)', () => {
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

  it('disconnect calls the spotify-specific endpoint and is gated behind confirm', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /^disconnect$/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/nothing playing until you reconnect/i)).toBeInTheDocument();
    expect(api.disconnectSpotify).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /^disconnect$/i }));
    await waitFor(() => expect(api.disconnectSpotify).toHaveBeenCalledTimes(1));
    // The generic DELETE-based disconnect must NOT be used for Spotify anymore.
    expect(api.disconnectIntegration).not.toHaveBeenCalled();
    // Refreshes the status after disconnecting.
    expect(api.getIntegrations).toHaveBeenCalledTimes(2);
  });

  it('disable is gated behind confirm and calls /api/admin/spotify/disable', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /^disable$/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/stop calling Spotify/i)).toBeInTheDocument();
    expect(api.disableSpotify).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /^disable$/i }));
    await waitFor(() => expect(api.disableSpotify).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/spotify was disabled/i)).toBeInTheDocument();
    expect(api.getIntegrations).toHaveBeenCalledTimes(2);
  });

  it('enable is one-click (no confirm) and calls /api/admin/spotify/enable', async () => {
    vi.mocked(api.getIntegrations).mockResolvedValue(
      list({ spotify: { state: 'disabled' } }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /^enable$/i }));
    // No confirm dialog for re-enabling.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(api.enableSpotify).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/spotify was enabled/i)).toBeInTheDocument();
    expect(api.getIntegrations).toHaveBeenCalledTimes(2);
  });

  it('surfaces envelope errorMsg via the toast when disconnect fails', async () => {
    const { default: axios } = await import('axios');
    const err = new axios.AxiosError('Request failed');
    err.response = {
      data: { error: true, errorMsg: 'spotify revoke rejected upstream' },
      status: 500,
      statusText: 'Internal Server Error',
      headers: {},
      config: {} as never,
    };
    vi.mocked(api.disconnectSpotify).mockRejectedValue(err);

    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /^disconnect$/i }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /^disconnect$/i }),
    );

    expect(await screen.findByText(/spotify revoke rejected upstream/i)).toBeInTheDocument();
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

  it('disconnect is gated behind a per-card confirm and uses the generic endpoint', async () => {
    vi.mocked(api.getIntegrations).mockResolvedValue(
      list({
        github: { connected: true, source: 'admin', authorized_at: '2026-07-04T00:00:00Z' },
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
    // The Spotify-specific endpoint must not be used for non-Spotify integrations.
    expect(api.disconnectSpotify).not.toHaveBeenCalled();
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

describe('IntegrationsPage, Spotify listener (task 124)', () => {
  it('absent mode: explainer, step hint, masked input, no stored row', async () => {
    renderPage();
    await screen.findByTestId('spotify-listener');

    expect(
      screen.getByText(/event-driven now-playing via your spotify web session/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/open\.spotify\.com while logged in, devtools, application, cookies/i),
    ).toBeInTheDocument();

    const input = screen.getByTestId('spotify-listener-input') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.value).toBe('');

    expect(screen.queryByTestId('spotify-listener-stored')).not.toBeInTheDocument();
    // Connect is the primary in absent mode.
    expect(screen.getByRole('button', { name: /^connect$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^replace$/i })).not.toBeInTheDocument();
  });

  it('present mode: stored row with state label, Replace and Remove actions, no input by default', async () => {
    vi.mocked(api.getIntegrations).mockResolvedValue(
      list({
        spotify: {
          listener: { credential_present: true, state: 'connected' },
        },
      }),
    );
    renderPage();

    const stored = await screen.findByTestId('spotify-listener-stored');
    expect(stored).toHaveTextContent(/credential stored/i);
    expect(stored).toHaveTextContent(/connected/i);

    expect(screen.getByRole('button', { name: /^replace$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^remove$/i })).toBeInTheDocument();
    // The input is hidden until Replace is clicked.
    expect(screen.queryByTestId('spotify-listener-input')).not.toBeInTheDocument();
  });

  it('Connect PUTs the sp_dc cookie, refetches, and never echoes the value back', async () => {
    const user = userEvent.setup();
    let currentList = list();
    vi.mocked(api.getIntegrations).mockImplementation(async () => currentList);
    vi.mocked(api.saveSpotifyListener).mockImplementation(async () => {
      currentList = list({
        spotify: { listener: { credential_present: true, state: 'connected' } },
      });
    });
    renderPage();

    const input = await screen.findByTestId('spotify-listener-input');
    await user.type(input, 'AQC-secret-dc-cookie');
    await user.click(screen.getByRole('button', { name: /^connect$/i }));

    await waitFor(() =>
      expect(api.saveSpotifyListener).toHaveBeenCalledWith('AQC-secret-dc-cookie'),
    );
    // Refetch happened after save.
    await waitFor(() => expect(api.getIntegrations).toHaveBeenCalledTimes(2));

    // Post-save, we're in the stored/present mode: no value is displayed and the
    // draft input is gone (so the pasted secret is nowhere in the DOM).
    const stored = await screen.findByTestId('spotify-listener-stored');
    expect(stored).toBeInTheDocument();
    expect(screen.queryByTestId('spotify-listener-input')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('AQC-secret-dc-cookie');
  });

  it('Replace reveals a fresh masked input, saves via PUT, and clears the draft after', async () => {
    const user = userEvent.setup();
    let currentList = list({
      spotify: { listener: { credential_present: true, state: 'connected' } },
    });
    vi.mocked(api.getIntegrations).mockImplementation(async () => currentList);
    vi.mocked(api.saveSpotifyListener).mockImplementation(async () => {
      currentList = list({
        spotify: { listener: { credential_present: true, state: 'connected' } },
      });
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /^replace$/i }));
    const listener = screen.getByTestId('spotify-listener');
    const input = within(listener).getByTestId('spotify-listener-input') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.value).toBe('');

    await user.type(input, 'new-dc-value');
    await user.click(within(listener).getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(api.saveSpotifyListener).toHaveBeenCalledWith('new-dc-value'),
    );
    await waitFor(() => expect(api.getIntegrations).toHaveBeenCalledTimes(2));

    // Input is dismissed and the value has been dropped from React state.
    await waitFor(() =>
      expect(screen.queryByTestId('spotify-listener-input')).not.toBeInTheDocument(),
    );
    expect(document.body.textContent).not.toContain('new-dc-value');
  });

  it('Remove requires confirmation, then DELETEs and refetches', async () => {
    const user = userEvent.setup();
    let currentList = list({
      spotify: { listener: { credential_present: true, state: 'connected' } },
    });
    vi.mocked(api.getIntegrations).mockImplementation(async () => currentList);
    vi.mocked(api.removeSpotifyListener).mockImplementation(async () => {
      currentList = list({
        spotify: { listener: { credential_present: false, state: 'never_run' } },
      });
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /^remove$/i }));

    // Confirm dialog is up, DELETE has not run yet.
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/deletes the stored sp_dc cookie/i),
    ).toBeInTheDocument();
    expect(api.removeSpotifyListener).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /^remove$/i }));
    await waitFor(() => expect(api.removeSpotifyListener).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(api.getIntegrations).toHaveBeenCalledTimes(2));

    // After remove, the card is back to absent mode.
    await screen.findByRole('button', { name: /^connect$/i });
    expect(screen.queryByTestId('spotify-listener-stored')).not.toBeInTheDocument();
  });

  it('surfaces PUT errors inline via serverMessage, never as an unhandled rejection', async () => {
    const { default: axios } = await import('axios');
    const err = new axios.AxiosError('Request failed');
    err.response = {
      data: { error: true, errorMsg: 'sp_dc cookie was rejected by Spotify' },
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: {} as never,
    };
    vi.mocked(api.saveSpotifyListener).mockRejectedValue(err);

    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);
    try {
      const user = userEvent.setup();
      renderPage();
      await user.type(
        await screen.findByTestId('spotify-listener-input'),
        'bad-value',
      );
      await user.click(screen.getByRole('button', { name: /^connect$/i }));

      const alert = await screen.findByTestId('spotify-listener-save-error');
      expect(alert).toHaveTextContent(/sp_dc cookie was rejected by spotify/i);
    } finally {
      window.removeEventListener('unhandledrejection', unhandled);
    }
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('surfaces DELETE errors inline on the stored row', async () => {
    const { default: axios } = await import('axios');
    const err = new axios.AxiosError('Request failed');
    err.response = {
      data: { error: true, errorMsg: 'listener credential could not be removed' },
      status: 500,
      statusText: 'Internal Server Error',
      headers: {},
      config: {} as never,
    };
    vi.mocked(api.getIntegrations).mockResolvedValue(
      list({ spotify: { listener: { credential_present: true, state: 'connected' } } }),
    );
    vi.mocked(api.removeSpotifyListener).mockRejectedValue(err);

    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /^remove$/i }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /^remove$/i }),
    );

    const alert = await screen.findByTestId('spotify-listener-remove-error');
    expect(alert).toHaveTextContent(/listener credential could not be removed/i);
  });

  it('Connect is disabled until the paste field has content, and shows Saving… while in flight', async () => {
    let resolveSave: () => void = () => {};
    vi.mocked(api.saveSpotifyListener).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );

    const user = userEvent.setup();
    renderPage();
    const connect = await screen.findByRole('button', { name: /^connect$/i });
    expect(connect).toBeDisabled();

    await user.type(await screen.findByTestId('spotify-listener-input'), 'x');
    expect(connect).not.toBeDisabled();

    await user.click(connect);
    // While the PUT is in flight, the button reads Saving… and is disabled.
    expect(await screen.findByRole('button', { name: /saving/i })).toBeDisabled();

    resolveSave();
    await waitFor(() => expect(api.saveSpotifyListener).toHaveBeenCalledTimes(1));
  });
});
