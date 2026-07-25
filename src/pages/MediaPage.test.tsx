import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MediaPage from './MediaPage';
import * as api from '../api/mediaApi';
import type { MediaAsset } from '../types/media';

vi.mock('../api/mediaApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/mediaApi')>();
  return {
    ...actual,
    getMedia: vi.fn(),
    deleteMedia: vi.fn(),
    runSweep: vi.fn(),
  };
});

const referenced: MediaAsset = {
  id: 'm1',
  s3_key: 'media/uuid-1/hero.png',
  url: 'https://cdn.example.com/media/uuid-1/hero.png',
  mime: 'image/png',
  bytes: 2048,
  confirmed_at: '2026-07-20T00:00:00Z',
  unreferenced_at: null,
  created_at: '2026-07-20T00:00:00Z',
};

const orphan: MediaAsset = {
  id: 'm2',
  s3_key: 'media/uuid-2/old.png',
  url: 'https://cdn.example.com/media/uuid-2/old.png',
  mime: 'image/png',
  bytes: 4096,
  confirmed_at: '2026-06-01T00:00:00Z',
  unreferenced_at: '2026-07-20T00:00:00Z', // +7 days => 2026-07-27
  created_at: '2026-06-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getMedia).mockResolvedValue([referenced, orphan]);
  vi.mocked(api.runSweep).mockResolvedValue({ orphaned: 0, rescued: 1, deleted: 0 });
});

describe('MediaPage', () => {
  it('renders the grid with orphan status and a scheduled deletion date (§6.9)', async () => {
    render(<MediaPage />);
    const cards = await screen.findAllByTestId('media-card');
    expect(cards).toHaveLength(2);

    // The orphaned asset shows the Orphan badge and a deletion date; the referenced one doesn't.
    const orphanCard = cards.find((c) => within(c).queryByText('Orphan'));
    expect(orphanCard).toBeTruthy();
    const deletion = within(orphanCard as HTMLElement).getByTestId('deletion-date');
    expect(deletion).toHaveTextContent(/Deletes/);
    // 7-day grace after 2026-07-20 lands on 2026-07-27.
    expect(deletion).toHaveTextContent(/Jul 27, 2026/);

    // A page-level warning summarises the orphan count.
    expect(screen.getByText(/1 asset is orphaned/i)).toBeInTheDocument();
  });

  it('wires the "run sweep" action to POST /api/admin/media/sweep and refetches', async () => {
    const user = userEvent.setup();
    render(<MediaPage />);
    await screen.findAllByTestId('media-card');

    await user.click(screen.getByRole('button', { name: /run sweep/i }));

    await waitFor(() => expect(api.runSweep).toHaveBeenCalledTimes(1));
    // After a sweep the library is refetched (initial load + post-sweep).
    await waitFor(() => expect(api.getMedia).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/sweep complete/i)).toBeInTheDocument();
  });

  it('deletes an asset after confirmation', async () => {
    const user = userEvent.setup();
    vi.mocked(api.deleteMedia).mockResolvedValue();
    render(<MediaPage />);
    await screen.findAllByTestId('media-card');

    await user.click(screen.getByRole('button', { name: /delete hero\.png/i }));
    // Confirm dialog appears; confirm the destructive action.
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(api.deleteMedia).toHaveBeenCalledWith('m1'));
  });
});
