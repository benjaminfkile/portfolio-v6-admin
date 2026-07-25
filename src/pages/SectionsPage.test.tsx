import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SectionsPage from './SectionsPage';
import { ConflictError } from '../api/sectionsApi';
import * as api from '../api/sectionsApi';
import * as versionsApi from '../api/versionsApi';
import type { AdminSection } from '../types/admin';

// Mock the API module but keep the real ConflictError class (the page checks
// `err instanceof ConflictError`).
vi.mock('../api/sectionsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/sectionsApi')>();
  return {
    ...actual,
    getSections: vi.fn(),
    updateSection: vi.fn(),
    reorderSections: vi.fn(),
    deleteSection: vi.fn(),
    createSection: vi.fn(),
  };
});

// Mock publishSite but keep the real PublishValidationError class (the page checks
// `err instanceof PublishValidationError`).
vi.mock('../api/versionsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/versionsApi')>();
  return {
    ...actual,
    publishSite: vi.fn(),
  };
});

const hero: AdminSection = {
  id: 's1',
  type: 'hero',
  position: 0,
  is_hidden: false,
  data: { title: 'Hello' },
  items: [],
  updated_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getSections).mockResolvedValue([hero]);
});

describe('SectionsPage', () => {
  it('loads and renders the working set as section cards', async () => {
    render(<SectionsPage />);
    expect(await screen.findByTestId('section-card')).toBeInTheDocument();
    expect(screen.getByText('Hero')).toBeInTheDocument();
    expect(api.getSections).toHaveBeenCalledTimes(1);
  });

  it('surfaces the 409 refetch dialog when a save conflicts, and refetches on confirm (§4.5)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateSection).mockRejectedValueOnce(new ConflictError());

    render(<SectionsPage />);
    await screen.findByTestId('section-card');

    // Toggling visibility is a PATCH carrying expected_updated_at — force a conflict.
    await user.click(screen.getByRole('button', { name: /hide hero/i }));

    // The conflict dialog appears rather than silently losing the change.
    expect(await screen.findByText(/changed since you loaded it/i)).toBeInTheDocument();
    expect(api.updateSection).toHaveBeenCalledWith('s1', {
      is_hidden: true,
      expected_updated_at: '2026-01-01T00:00:00Z',
    });

    // Refetch pulls fresh state and dismisses the dialog.
    await user.click(screen.getByRole('button', { name: /refetch latest/i }));
    await waitFor(() =>
      expect(screen.queryByText(/changed since you loaded it/i)).not.toBeInTheDocument(),
    );
    expect(api.getSections).toHaveBeenCalledTimes(2);
  });

  it('publishes the working set and reports the new version (§4.2)', async () => {
    const user = userEvent.setup();
    vi.mocked(versionsApi.publishSite).mockResolvedValue({
      version: 7,
      published_at: '2026-07-25T00:00:00Z',
      published_by: 'ben@example.com',
    });

    render(<SectionsPage />);
    await screen.findByTestId('section-card');

    await user.click(screen.getByRole('button', { name: /^publish$/i }));
    await user.click(screen.getByRole('button', { name: /publish now/i }));

    await waitFor(() => expect(versionsApi.publishSite).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/published version 7/i)).toBeInTheDocument();
  });

  it('lists validation issues inline and keeps the dialog open when publish is refused (§3.9)', async () => {
    const user = userEvent.setup();
    vi.mocked(versionsApi.publishSite).mockRejectedValue(
      new versionsApi.PublishValidationError('The page failed validation and was not published.', [
        'hero: title is required',
      ]),
    );

    render(<SectionsPage />);
    await screen.findByTestId('section-card');

    await user.click(screen.getByRole('button', { name: /^publish$/i }));
    await user.click(screen.getByRole('button', { name: /publish now/i }));

    expect(await screen.findByText(/hero: title is required/i)).toBeInTheDocument();
    // The dialog stays open on validation failure so the issues can be read and fixed.
    expect(screen.getByRole('button', { name: /publish now/i })).toBeInTheDocument();
  });
});
