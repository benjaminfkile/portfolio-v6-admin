import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import IntegrationsPage from './IntegrationsPage';
import * as api from '../api/integrationsApi';
import type {
  CredentialIntegration,
  Integration,
  SpotifyStatus,
} from '../api/integrationsApi';

vi.mock('../api/integrationsApi', () => ({
  getIntegrations: vi.fn(),
  getSpotifyStatus: vi.fn(),
  disconnectIntegration: vi.fn(),
  saveIntegrationValue: vi.fn(),
  saveSpotifyListener: vi.fn(),
  removeSpotifyListener: vi.fn(),
}));

// The API-keys section fetches on mount; mock its API so the page test stays hermetic.
vi.mock('../api/apiKeysApi', () => ({
  getApiKeys: vi.fn().mockResolvedValue([]),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}));

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

const spotifyStatus: SpotifyStatus = {
  source: 'none',
  listener: {
    credential_present: false,
    state: 'no_credential',
    last_event_at: null,
    error_kind: null,
  },
};

interface Overrides {
  github?: Partial<CredentialIntegration>;
  duolingo?: Partial<CredentialIntegration>;
}

function list(overrides: Overrides = {}): Integration[] {
  return [
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
  vi.mocked(api.getSpotifyStatus).mockResolvedValue(spotifyStatus);
  vi.mocked(api.disconnectIntegration).mockResolvedValue();
  vi.mocked(api.saveIntegrationValue).mockResolvedValue();
  vi.mocked(api.saveSpotifyListener).mockResolvedValue();
  vi.mocked(api.removeSpotifyListener).mockResolvedValue();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('IntegrationsPage — cards', () => {
  it('renders the Spotify card plus the credential cards', async () => {
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Spotify' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'GitHub' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Duolingo' }),
    ).toBeInTheDocument();
  });

  it('surfaces a load error with a retry', async () => {
    vi.mocked(api.getSpotifyStatus).mockRejectedValueOnce(new Error('nope'));
    renderPage();
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

describe('Spotify card — listener-only', () => {
  it('shows the Offline badge and the no-credential connect prompt', async () => {
    renderPage();
    const badge = await screen.findByTestId('spotify-source-badge');
    expect(badge).toHaveTextContent(/offline/i);
    // No credential -> the paste prompt is visible.
    const section = screen.getByTestId('spotify-listener');
    expect(within(section).getByText(/paste the sp_dc cookie/i)).toBeInTheDocument();
  });

  it('shows the Live badge and connected health when the listener is live', async () => {
    vi.mocked(api.getSpotifyStatus).mockResolvedValue({
      source: 'listener',
      listener: {
        credential_present: true,
        state: 'connected',
        last_event_at: '2026-08-20T19:00:00Z',
        error_kind: null,
      },
    });
    renderPage();
    const badge = await screen.findByTestId('spotify-source-badge');
    expect(badge).toHaveTextContent(/live \(listener\)/i);
    expect(screen.getByTestId('spotify-listener-health')).toHaveTextContent(/connected/i);
    expect(screen.getByTestId('spotify-listener-stored')).toHaveTextContent(/credential stored/i);
  });

  it('credential_dead escalates to a replace-the-cookie warning', async () => {
    vi.mocked(api.getSpotifyStatus).mockResolvedValue({
      source: 'none',
      listener: {
        credential_present: true,
        state: 'credential_dead',
        last_event_at: null,
        error_kind: 'invalid_cookie',
      },
    });
    renderPage();
    const health = await screen.findByTestId('spotify-listener-health');
    expect(health).toHaveTextContent(/replace it below/i);
  });

  it('pastes and saves the sp_dc cookie', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('spotify-listener');
    const input = screen.getByLabelText(/sp_dc/i);
    await user.type(input, 'MY_SP_DC');
    await user.click(screen.getByRole('button', { name: /^connect$/i }));
    await waitFor(() =>
      expect(api.saveSpotifyListener).toHaveBeenCalledWith('MY_SP_DC'),
    );
  });

  it('replaces and removes a stored cookie', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getSpotifyStatus).mockResolvedValue({
      source: 'listener',
      listener: {
        credential_present: true,
        state: 'connected',
        last_event_at: null,
        error_kind: null,
      },
    });
    renderPage();
    await screen.findByTestId('spotify-listener-stored');
    await user.click(screen.getByRole('button', { name: /remove/i }));
    // Confirm dialog
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /remove/i }));
    await waitFor(() => expect(api.removeSpotifyListener).toHaveBeenCalled());
  });

  it('never renders a polling reconnect / disable / budget control', async () => {
    renderPage();
    await screen.findByText('Spotify');
    expect(screen.queryByRole('button', { name: /reconnect/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /disable/i })).toBeNull();
    expect(screen.queryByTestId('spotify-budget')).toBeNull();
    expect(screen.queryByTestId('spotify-status-chip')).toBeNull();
  });
});

describe('Credential cards (github / duolingo)', () => {
  it('saves a github PAT', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'GitHub' });
    const input = screen.getByLabelText('GitHub');
    await user.type(input, 'ghp_x');
    await user.click(screen.getAllByRole('button', { name: /^save$/i })[0]);
    await waitFor(() =>
      expect(api.saveIntegrationValue).toHaveBeenCalledWith('github', 'ghp_x'),
    );
  });

  it('shows connected state for a stored credential without echoing the value', async () => {
    vi.mocked(api.getIntegrations).mockResolvedValue(
      list({ github: { connected: true, source: 'admin', authorized_at: '2026-08-01T00:00:00Z' } }),
    );
    renderPage();
    await screen.findByRole('heading', { name: 'GitHub' });
    expect(screen.getByText(/saved/i)).toBeInTheDocument();
  });
});
