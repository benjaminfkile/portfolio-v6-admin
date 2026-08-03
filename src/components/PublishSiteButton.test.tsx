import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PublishSiteButton from './PublishSiteButton';
import * as versionsApi from '../api/versionsApi';

// Mock publishSite but keep the real PublishValidationError class (the component
// checks `err instanceof PublishValidationError`).
vi.mock('../api/versionsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/versionsApi')>();
  return {
    ...actual,
    publishSite: vi.fn(),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PublishSiteButton (§4.2, §3.10 site-level publish)', () => {
  it('publishes the whole site and reports the new version', async () => {
    const user = userEvent.setup();
    vi.mocked(versionsApi.publishSite).mockResolvedValue({
      version: 7,
      published_at: '2026-07-25T00:00:00Z',
      published_by: 'ben@example.com',
    });

    render(<PublishSiteButton />);

    await user.click(screen.getByRole('button', { name: /publish site/i }));
    // The confirm dialog states the site-wide scope before anything fires.
    expect(await screen.findByText(/snapshots all pages/i)).toBeInTheDocument();
    expect(versionsApi.publishSite).not.toHaveBeenCalled();

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

    render(<PublishSiteButton />);

    await user.click(screen.getByRole('button', { name: /publish site/i }));
    await user.click(screen.getByRole('button', { name: /publish now/i }));

    expect(await screen.findByText(/hero: title is required/i)).toBeInTheDocument();
    // The dialog stays open on validation failure so the issues can be read and fixed.
    expect(screen.getByRole('button', { name: /publish now/i })).toBeInTheDocument();
  });

  it('cancelling does not publish', async () => {
    const user = userEvent.setup();
    render(<PublishSiteButton />);

    await user.click(screen.getByRole('button', { name: /publish site/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(versionsApi.publishSite).not.toHaveBeenCalled();
  });
});
