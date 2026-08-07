import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import PublishSiteButton from './PublishSiteButton';
import * as versionsApi from '../api/versionsApi';

/** A rejected publish carrying the §4.3 error envelope (a non-validation failure). */
function envelopeError(status: number, errorMsg: string): AxiosError {
  const err = new AxiosError('Request failed with status code ' + status);
  err.response = {
    status,
    statusText: '',
    headers: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: {} as any,
    data: { error: true, errorMsg },
  };
  return err;
}

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

  it("surfaces the server's errorMsg in the toast for a non-validation publish failure", async () => {
    const user = userEvent.setup();
    vi.mocked(versionsApi.publishSite).mockRejectedValue(
      envelopeError(500, 'Snapshot store is unavailable — try again shortly.'),
    );

    render(<PublishSiteButton />);

    await user.click(screen.getByRole('button', { name: /publish site/i }));
    await user.click(screen.getByRole('button', { name: /publish now/i }));

    expect(
      await screen.findByText(/snapshot store is unavailable/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Could not publish the site. Is the API reachable?'),
    ).not.toBeInTheDocument();
  });

  it('falls back to the generic toast when publish fails with no envelope (network error)', async () => {
    const user = userEvent.setup();
    vi.mocked(versionsApi.publishSite).mockRejectedValue(new Error('Network Error'));

    render(<PublishSiteButton />);

    await user.click(screen.getByRole('button', { name: /publish site/i }));
    await user.click(screen.getByRole('button', { name: /publish now/i }));

    expect(
      await screen.findByText('Could not publish the site. Is the API reachable?'),
    ).toBeInTheDocument();
  });

  it('cancelling does not publish', async () => {
    const user = userEvent.setup();
    render(<PublishSiteButton />);

    await user.click(screen.getByRole('button', { name: /publish site/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(versionsApi.publishSite).not.toHaveBeenCalled();
  });
});
