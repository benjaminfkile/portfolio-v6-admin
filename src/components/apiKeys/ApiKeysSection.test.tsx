import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApiKeysSection from './ApiKeysSection';
import * as api from '../../api/apiKeysApi';
import type { ApiKey, MintedApiKey } from '../../types/admin';

vi.mock('../../api/apiKeysApi', () => ({
  getApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}));

const active: ApiKey = {
  id: 'k1',
  name: 'CI publisher',
  key_prefix: 'pv6k_abc1234',
  created_at: '2026-08-01T00:00:00Z',
  last_used_at: '2026-08-05T00:00:00Z',
  revoked_at: null,
};

const neverUsed: ApiKey = {
  id: 'k2',
  name: 'Fresh key',
  key_prefix: 'pv6k_new0000',
  created_at: '2026-08-02T00:00:00Z',
  last_used_at: null,
  revoked_at: null,
};

const revoked: ApiKey = {
  id: 'k3',
  name: 'Old key',
  key_prefix: 'pv6k_old9999',
  created_at: '2026-06-01T00:00:00Z',
  last_used_at: '2026-06-10T00:00:00Z',
  revoked_at: '2026-07-01T00:00:00Z',
};

const minted: MintedApiKey = {
  id: 'k9',
  name: 'New key',
  key_prefix: 'pv6k_secret1',
  created_at: '2026-08-11T00:00:00Z',
  last_used_at: null,
  revoked_at: null,
  key: 'pv6k_secret1deadbeefcafef00d',
};

/** Install a clipboard mock and return its writeText spy. */
function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  });
  return writeText;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getApiKeys).mockResolvedValue([active, neverUsed, revoked]);
  vi.mocked(api.createApiKey).mockResolvedValue(minted);
  vi.mocked(api.revokeApiKey).mockResolvedValue();
});

describe('ApiKeysSection — scope description', () => {
  it('spells out what keys can and cannot do', async () => {
    render(<ApiKeysSection />);
    expect(await screen.findByRole('heading', { name: 'API keys' })).toBeInTheDocument();
    expect(
      screen.getByText(/full content-editing surface/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/key management and integration credentials stay admin-only/i),
    ).toBeInTheDocument();
  });
});

describe('ApiKeysSection — list rendering', () => {
  it('shows prefix (monospace), created date, last-used, and status per key', async () => {
    render(<ApiKeysSection />);

    const row = await screen.findByTestId('key-row-k1');
    expect(within(row).getByText('CI publisher')).toBeInTheDocument();
    expect(within(row).getByText('pv6k_abc1234')).toBeInTheDocument();
    expect(within(row).getByTestId('key-status-k1')).toHaveTextContent('active');
    expect(within(row).getByRole('button', { name: /revoke/i })).toBeInTheDocument();
  });

  it('renders "never" for a key that has not been used', async () => {
    render(<ApiKeysSection />);
    const row = await screen.findByTestId('key-row-k2');
    expect(within(row).getByText('never')).toBeInTheDocument();
  });

  it('dims a revoked key, shows a "revoked" chip, and offers no actions', async () => {
    render(<ApiKeysSection />);
    const row = await screen.findByTestId('key-row-k3');
    expect(within(row).getByTestId('key-status-k3')).toHaveTextContent('revoked');
    expect(within(row).queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no keys', async () => {
    vi.mocked(api.getApiKeys).mockResolvedValue([]);
    render(<ApiKeysSection />);
    expect(await screen.findByText(/no api keys yet/i)).toBeInTheDocument();
  });

  it('surfaces a load failure with the server message and a retry', async () => {
    vi.mocked(api.getApiKeys).mockRejectedValueOnce(new Error('boom'));
    render(<ApiKeysSection />);
    expect(await screen.findByText(/could not load the api keys/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

describe('ApiKeysSection — mint flow (show-once)', () => {
  it('mints a key and reveals the full secret exactly once behind an explicit acknowledge', async () => {
    const user = userEvent.setup();
    render(<ApiKeysSection />);
    await screen.findByTestId('key-row-k1');

    await user.click(screen.getByRole('button', { name: /create key/i }));

    const nameField = await screen.findByTestId('key-name-input');
    await user.type(nameField, 'New key');
    await user.click(screen.getByRole('button', { name: /^create key$/i }));

    await waitFor(() => expect(api.createApiKey).toHaveBeenCalledWith('New key'));

    // The full secret is shown, with the show-once warning.
    const secret = await screen.findByTestId('minted-key-value');
    expect(secret).toHaveValue('pv6k_secret1deadbeefcafef00d');
    expect(screen.getByText(/only time the key is shown\. store it now/i)).toBeInTheDocument();

    // The list refetched to include the new key while the secret is still shown.
    expect(api.getApiKeys).toHaveBeenCalledTimes(2);

    // The only way out is the explicit acknowledge.
    await user.click(screen.getByRole('button', { name: /i saved the key/i }));
    await waitFor(() =>
      expect(screen.queryByTestId('minted-key-value')).not.toBeInTheDocument(),
    );
    expect(await screen.findByText(/api key created/i)).toBeInTheDocument();
  });

  it('does not close the show-once view on a backdrop click', async () => {
    const user = userEvent.setup();
    render(<ApiKeysSection />);
    await screen.findByTestId('key-row-k1');

    await user.click(screen.getByRole('button', { name: /create key/i }));
    await user.type(await screen.findByTestId('key-name-input'), 'New key');
    await user.click(screen.getByRole('button', { name: /^create key$/i }));
    await screen.findByTestId('minted-key-value');

    // Click the backdrop — the secret must remain visible.
    const backdrop = document.querySelector('.MuiBackdrop-root');
    if (backdrop) await user.click(backdrop);
    expect(screen.getByTestId('minted-key-value')).toBeInTheDocument();
  });

  it('copy button writes the full key to the clipboard', async () => {
    const user = userEvent.setup();
    // Install after setup() — userEvent.setup() otherwise installs its own clipboard stub.
    const writeText = mockClipboard();
    render(<ApiKeysSection />);
    await screen.findByTestId('key-row-k1');

    await user.click(screen.getByRole('button', { name: /create key/i }));
    await user.type(await screen.findByTestId('key-name-input'), 'New key');
    await user.click(screen.getByRole('button', { name: /^create key$/i }));
    await screen.findByTestId('minted-key-value');

    await user.click(screen.getByRole('button', { name: /copy key/i }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('pv6k_secret1deadbeefcafef00d'),
    );
  });

  it('keeps the dialog open and surfaces a server error when minting fails', async () => {
    vi.mocked(api.createApiKey).mockRejectedValueOnce({
      isAxiosError: true,
      response: { data: { error: true, errorMsg: 'name already exists' } },
    });
    const user = userEvent.setup();
    render(<ApiKeysSection />);
    await screen.findByTestId('key-row-k1');

    await user.click(screen.getByRole('button', { name: /create key/i }));
    await user.type(await screen.findByTestId('key-name-input'), 'dup');
    await user.click(screen.getByRole('button', { name: /^create key$/i }));

    expect(await screen.findByText(/name already exists/i)).toBeInTheDocument();
    // Still in the name phase — no secret revealed.
    expect(screen.queryByTestId('minted-key-value')).not.toBeInTheDocument();
  });
});

describe('ApiKeysSection — revoke flow', () => {
  it('revokes behind a confirm warning, then refetches', async () => {
    const user = userEvent.setup();
    render(<ApiKeysSection />);
    const row = await screen.findByTestId('key-row-k1');

    await user.click(within(row).getByRole('button', { name: /revoke/i }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/applications using this key stop working immediately/i),
    ).toBeInTheDocument();
    expect(api.revokeApiKey).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /revoke key/i }));
    await waitFor(() => expect(api.revokeApiKey).toHaveBeenCalledWith('k1'));
    // Refetched the list after revoking.
    expect(api.getApiKeys).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/api key revoked/i)).toBeInTheDocument();
  });

  it('surfaces a server error via the toast when revoke fails', async () => {
    vi.mocked(api.revokeApiKey).mockRejectedValueOnce({
      isAxiosError: true,
      response: { data: { error: true, errorMsg: 'unknown key' } },
    });
    const user = userEvent.setup();
    render(<ApiKeysSection />);
    const row = await screen.findByTestId('key-row-k1');

    await user.click(within(row).getByRole('button', { name: /revoke/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /revoke key/i }));

    expect(await screen.findByText(/unknown key/i)).toBeInTheDocument();
  });
});
