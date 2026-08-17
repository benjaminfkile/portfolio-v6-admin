import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ResumesPage from './ResumesPage';
import AppShell from '../components/AppShell';
import ProtectedRoute from '../components/ProtectedRoute';
import { ThemeModeProvider } from '../theme/ThemeModeProvider';
import * as api from '../api/resumesApi';
import type { ResumeVersion } from '../types/resumes';

vi.mock('../api/resumesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/resumesApi')>();
  return {
    ...actual,
    getResumes: vi.fn(),
    deleteResume: vi.fn(),
    performResumeUpload: vi.fn(),
  };
});

// AppShell renders PublishSiteButton; keep it inert so the nav test does not need to
// mock the versions API.
vi.mock('../components/PublishSiteButton', () => ({
  default: () => null,
}));

const mockUseAuth = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

const newest: ResumeVersion = {
  id: 'r3',
  filename: 'resume-2026-08.pdf',
  s3_key: 'resumes/uuid-3/resume-2026-08.pdf',
  url: 'https://cdn.example.com/resumes/uuid-3/resume-2026-08.pdf',
  bytes: 200_000,
  confirmed_at: '2026-08-15T00:00:00Z',
  created_at: '2026-08-15T00:00:00Z',
};
const middle: ResumeVersion = {
  id: 'r2',
  filename: 'resume-2026-05.pdf',
  s3_key: 'resumes/uuid-2/resume-2026-05.pdf',
  url: 'https://cdn.example.com/resumes/uuid-2/resume-2026-05.pdf',
  bytes: 150_000,
  confirmed_at: '2026-05-01T00:00:00Z',
  created_at: '2026-05-01T00:00:00Z',
};
const oldest: ResumeVersion = {
  id: 'r1',
  filename: 'resume-2026-01.pdf',
  s3_key: 'resumes/uuid-1/resume-2026-01.pdf',
  url: 'https://cdn.example.com/resumes/uuid-1/resume-2026-01.pdf',
  bytes: 120_000,
  confirmed_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({
    isLoading: false,
    currentUser: { email: 'admin@benkile.com' },
    logout: vi.fn(),
  });
  // Return in an intentionally-shuffled order to prove the page re-sorts newest-first.
  vi.mocked(api.getResumes).mockResolvedValue([middle, oldest, newest]);
});

describe('ResumesPage — nav + route', () => {
  function renderAppShell(initialPath: string) {
    return render(
      <ThemeModeProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/login" element={<div>LoginPage</div>} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/resumes" element={<ResumesPage />} />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeModeProvider>,
    );
  }

  it('shows Resumes in the sidebar nav pointing at /resumes', async () => {
    renderAppShell('/resumes');
    const links = await screen.findAllByRole('link', { name: /resumes/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute('href', '/resumes');
  });

  it('renders ResumesPage at /resumes behind ProtectedRoute', async () => {
    renderAppShell('/resumes');
    expect(
      await screen.findByRole('heading', { name: 'Resumes', level: 1 }),
    ).toBeInTheDocument();
  });
});

describe('ResumesPage — versions list', () => {
  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/resumes']}>
        <ResumesPage />
      </MemoryRouter>,
    );
  }

  it('lists versions newest-first with a Live badge on the newest confirmed row', async () => {
    renderPage();
    const rows = await screen.findAllByTestId('resume-row');
    expect(rows).toHaveLength(3);

    // Newest-first: r3, r2, r1.
    expect(within(rows[0]).getByText('resume-2026-08.pdf')).toBeInTheDocument();
    expect(within(rows[1]).getByText('resume-2026-05.pdf')).toBeInTheDocument();
    expect(within(rows[2]).getByText('resume-2026-01.pdf')).toBeInTheDocument();

    // Only the newest confirmed row wears the Live badge.
    const liveBadges = screen.getAllByTestId('live-badge');
    expect(liveBadges).toHaveLength(1);
    expect(within(rows[0]).getByTestId('live-badge')).toBeInTheDocument();
  });

  it('renders a per-version Open link pointing at the CDN url', async () => {
    renderPage();
    const rows = await screen.findAllByTestId('resume-row');

    const openLink = within(rows[0]).getByRole('link', { name: /open resume-2026-08\.pdf/i });
    expect(openLink).toHaveAttribute('href', newest.url);
    expect(openLink).toHaveAttribute('target', '_blank');
    expect(openLink).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('explains in helper copy that deleting the live version promotes the next', async () => {
    renderPage();
    await screen.findAllByTestId('resume-row');
    expect(
      screen.getByText(/Deleting the live version promotes the next one/i),
    ).toBeInTheDocument();
  });

  it('shows the empty state when no resumes exist', async () => {
    vi.mocked(api.getResumes).mockResolvedValue([]);
    renderPage();

    expect(
      await screen.findByText(/public site shows nothing until you upload a first pdf/i),
    ).toBeInTheDocument();
    expect(screen.queryAllByTestId('resume-row')).toHaveLength(0);
  });
});

describe('ResumesPage — delete', () => {
  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/resumes']}>
        <ResumesPage />
      </MemoryRouter>,
    );
  }

  it('deletes a non-live version after confirmation', async () => {
    const user = userEvent.setup();
    vi.mocked(api.deleteResume).mockResolvedValue();
    renderPage();
    const rows = await screen.findAllByTestId('resume-row');

    // Delete the second (non-live) row.
    await user.click(
      within(rows[1]).getByRole('button', { name: /delete resume-2026-05\.pdf/i }),
    );

    const dialog = await screen.findByRole('dialog');
    // Non-live copy — the "promotes the next" warning MUST NOT appear.
    expect(within(dialog).queryByText(/promote the next/i)).not.toBeInTheDocument();
    // Nothing has been deleted before confirmation.
    expect(api.deleteResume).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(api.deleteResume).toHaveBeenCalledWith('r2'));
    // Refetches after delete.
    expect(api.getResumes).toHaveBeenCalledTimes(2);
  });

  it('warns that deleting the live version promotes the next before firing', async () => {
    const user = userEvent.setup();
    vi.mocked(api.deleteResume).mockResolvedValue();
    renderPage();
    const rows = await screen.findAllByTestId('resume-row');

    // Delete the live (newest) row.
    await user.click(
      within(rows[0]).getByRole('button', { name: /delete resume-2026-08\.pdf/i }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/promote the next version to live/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(api.deleteResume).toHaveBeenCalledWith('r3'));
  });

  it('cancelling the confirm does not delete', async () => {
    const user = userEvent.setup();
    renderPage();
    const rows = await screen.findAllByTestId('resume-row');

    await user.click(
      within(rows[2]).getByRole('button', { name: /delete resume-2026-01\.pdf/i }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

    expect(api.deleteResume).not.toHaveBeenCalled();
  });
});

describe('ResumesPage — upload flow', () => {
  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/resumes']}>
        <ResumesPage />
      </MemoryRouter>,
    );
  }

  it('rejects a non-PDF choice client-side before starting the upload', async () => {
    // Bypass the input's accept filter so the guard is exercised on our side, not just via
    // the OS file picker filter (some browsers hand a non-PDF through drag/drop anyway).
    const user = userEvent.setup({ applyAccept: false });
    renderPage();
    await screen.findAllByTestId('resume-row');

    await user.click(screen.getByRole('button', { name: /upload pdf/i }));
    const dialog = await screen.findByRole('dialog', { name: /upload resume/i });

    const png = new File(['not-a-pdf'], 'photo.png', { type: 'image/png' });
    const input = within(dialog).getByLabelText(/resume pdf to upload/i);
    await user.upload(input, png);

    // A helpful error tells the user why, and the Upload button stays disabled.
    expect(await within(dialog).findByText(/must be a pdf/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^upload$/i })).toBeDisabled();
    // No API call was made.
    expect(api.performResumeUpload).not.toHaveBeenCalled();
  });

  it('runs the three-step upload for a PDF and refetches on success', async () => {
    const user = userEvent.setup();
    const uploaded: ResumeVersion = {
      id: 'r4',
      filename: 'new-resume.pdf',
      s3_key: 'resumes/uuid-4/new-resume.pdf',
      url: 'https://cdn.example.com/resumes/uuid-4/new-resume.pdf',
      bytes: 12,
      confirmed_at: '2026-08-17T00:00:00Z',
      created_at: '2026-08-17T00:00:00Z',
    };
    vi.mocked(api.performResumeUpload).mockResolvedValue(uploaded);
    renderPage();
    await screen.findAllByTestId('resume-row');

    await user.click(screen.getByRole('button', { name: /upload pdf/i }));
    const dialog = await screen.findByRole('dialog', { name: /upload resume/i });

    const pdf = new File(['fake-pdf-bytes'], 'new-resume.pdf', { type: 'application/pdf' });
    const input = within(dialog).getByLabelText(/resume pdf to upload/i);
    await user.upload(input, pdf);

    await user.click(within(dialog).getByRole('button', { name: /^upload$/i }));

    // Upload helper is invoked with the chosen file.
    await waitFor(() => expect(api.performResumeUpload).toHaveBeenCalledTimes(1));
    const [passedFile] = vi.mocked(api.performResumeUpload).mock.calls[0];
    expect(passedFile.name).toBe('new-resume.pdf');
    expect(passedFile.type).toBe('application/pdf');
    // The list refetches after the confirmed upload (initial + after upload).
    await waitFor(() => expect(api.getResumes).toHaveBeenCalledTimes(2));
  });
});
