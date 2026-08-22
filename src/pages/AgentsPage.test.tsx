import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AgentsPage from './AgentsPage';
import AppShell from '../components/AppShell';
import ProtectedRoute from '../components/ProtectedRoute';
import { ThemeModeProvider } from '../theme/ThemeModeProvider';
import { buildAgentPrompt, agentPrompt } from '../content/agentPrompt';

// The Agents page embeds ApiKeysSection, which fetches on mount — mock the API so the
// page test stays hermetic.
vi.mock('../api/apiKeysApi', () => ({
  getApiKeys: vi.fn().mockResolvedValue([]),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}));

// AppShell renders PublishSiteButton; keep it inert so the nav test does not need to
// mock the versions API.
vi.mock('../components/PublishSiteButton', () => ({
  default: () => null,
}));

const mockUseAuth = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

/** Install a clipboard mock and return its writeText spy. */
function mockClipboard(impl?: (text: string) => Promise<void>) {
  const writeText = vi.fn<(text: string) => Promise<void>>(
    impl ?? (() => Promise.resolve()),
  );
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  });
  return writeText;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({
    isLoading: false,
    currentUser: { email: 'admin@benkile.com' },
    logout: vi.fn(),
  });
});

describe('AgentsPage — nav + route (protected)', () => {
  function renderAppShell(initialPath: string) {
    return render(
      <ThemeModeProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/login" element={<div>LoginPage</div>} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/agents" element={<AgentsPage />} />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeModeProvider>,
    );
  }

  it('shows Agents in the sidebar nav pointing at /agents', async () => {
    renderAppShell('/agents');
    // The permanent drawer plus temporary drawer both render — pick any link.
    const links = await screen.findAllByRole('link', { name: /agents/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute('href', '/agents');
  });

  it('renders AgentsPage at /agents behind ProtectedRoute', async () => {
    renderAppShell('/agents');
    expect(
      await screen.findByRole('heading', { name: 'Agents', level: 1 }),
    ).toBeInTheDocument();
  });

  it('redirects to /login when unauthenticated', () => {
    mockUseAuth.mockReturnValue({ isLoading: false, currentUser: null, logout: vi.fn() });
    renderAppShell('/agents');
    expect(screen.getByText('LoginPage')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Agents', level: 1 })).not.toBeInTheDocument();
  });
});

describe('AgentsPage — page content', () => {
  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/agents']}>
        <AgentsPage />
      </MemoryRouter>,
    );
  }

  it('renders the intro, embedded API keys section, and the prompt block', async () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Agents', level: 1 })).toBeInTheDocument();
    // Intro workflow — key phrases from the spec text (uniquely inside the alert).
    expect(screen.getByRole('heading', { name: /how the session works/i })).toBeInTheDocument();
    // "Revocation is immediate" appears only in the intro alert.
    expect(screen.getByText(/revocation is immediate/i)).toBeInTheDocument();
    // Embedded API keys section (its header is rendered here, not on Integrations).
    expect(await screen.findByRole('heading', { name: 'API keys' })).toBeInTheDocument();
    // Prompt block.
    const block = screen.getByTestId('agent-prompt-block');
    expect(block).toBeInTheDocument();
    // Monospace styling comes through as an inline style.
    expect(getComputedStyle(block).fontFamily).toMatch(/monospace/i);
  });
});

describe('agentPrompt template', () => {
  it('interpolates the base URL into the header line', () => {
    const out = buildAgentPrompt('https://example.test/api');
    expect(out).toContain('Base URL: https://example.test/api');
  });

  it('includes the required section headers verbatim', () => {
    const out = buildAgentPrompt('https://example.test/api');
    expect(out).toContain('# Portfolio v6 API: agent guide');
    expect(out).toContain('## Conventions');
    expect(out).toContain('## Content model');
    expect(out).toContain('## Endpoints available to your key');
    expect(out).toContain('## Common workflows');
    expect(out).toContain('## Rules');
  });

  it('resolves the base URL from VITE_API_BASE_URL and falls back when unset', () => {
    // Fallback: unset → prod gateway.
    vi.stubEnv('VITE_API_BASE_URL', '');
    expect(agentPrompt()).toContain('Base URL: https://api.benkile.com/portfolio-v6-api');

    // Configured → configured value.
    vi.stubEnv('VITE_API_BASE_URL', 'https://api-dev.example/portfolio-v6-api-dev');
    expect(agentPrompt()).toContain(
      'Base URL: https://api-dev.example/portfolio-v6-api-dev',
    );

    vi.unstubAllEnvs();
  });
});

describe('AgentsPage — copy button', () => {
  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/agents']}>
        <AgentsPage />
      </MemoryRouter>,
    );
  }

  it('writes the prompt to the clipboard and flips to a Copied state', async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();
    renderPage();

    await user.click(screen.getByTestId('copy-prompt-button'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const written = writeText.mock.calls[0][0] as string;
    expect(written).toContain('# Portfolio v6 API: agent guide');
    expect(written).toContain('Base URL: ');

    // The button flips to Copied.
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument();
  });

  it('tolerates a clipboard failure without throwing', async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard(() => Promise.reject(new Error('blocked')));
    renderPage();

    await user.click(screen.getByTestId('copy-prompt-button'));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    // No copied flip — the button label stays as Copy prompt.
    expect(screen.getByRole('button', { name: /copy prompt/i })).toBeInTheDocument();
  });
});
