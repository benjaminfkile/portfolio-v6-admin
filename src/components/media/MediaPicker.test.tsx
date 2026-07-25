import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MediaPicker from './MediaPicker';
import * as api from '../../api/mediaApi';
import type { MediaAsset } from '../../types/media';

vi.mock('../../api/mediaApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/mediaApi')>();
  return {
    ...actual,
    getMedia: vi.fn(),
  };
});

const assets: MediaAsset[] = [
  {
    id: 'm1',
    s3_key: 'media/uuid-1/alpha.png',
    url: 'https://cdn.example.com/media/uuid-1/alpha.png',
    mime: 'image/png',
    bytes: 1024,
    alt: 'Alpha',
    confirmed_at: '2026-07-20T00:00:00Z',
    unreferenced_at: null,
    created_at: '2026-07-20T00:00:00Z',
  },
  {
    id: 'm2',
    s3_key: 'media/uuid-2/beta.png',
    url: 'https://cdn.example.com/media/uuid-2/beta.png',
    mime: 'image/png',
    bytes: 2048,
    confirmed_at: '2026-07-21T00:00:00Z',
    unreferenced_at: null,
    created_at: '2026-07-21T00:00:00Z',
  },
  {
    // Unconfirmed rows are not pickable — the object hasn't landed yet.
    id: 'm3',
    s3_key: 'media/uuid-3/pending.png',
    url: 'https://cdn.example.com/media/uuid-3/pending.png',
    mime: 'image/png',
    bytes: 512,
    confirmed_at: null,
    unreferenced_at: null,
    created_at: '2026-07-22T00:00:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getMedia).mockResolvedValue(assets);
});

describe('MediaPicker', () => {
  it('selecting an asset and confirming returns its media_id (round-trip)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MediaPicker open onClose={() => {}} onSelect={onSelect} />);

    // Only the two confirmed assets are offered.
    const cards = await screen.findAllByTestId('media-card');
    expect(cards).toHaveLength(2);

    // "Use this media" is disabled until something is chosen.
    const confirm = screen.getByRole('button', { name: /use this media/i });
    expect(confirm).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /select beta\.png/i }));
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith({ media_id: 'm2', alt: '' });
  });

  it('preselects the current value and returns edited alt text with the media_id', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MediaPicker open selectedId="m1" onClose={() => {}} onSelect={onSelect} />);

    await screen.findAllByTestId('media-card');

    // The alt field is prefilled from the preselected asset.
    const altField = screen.getByLabelText(/alt text/i);
    await waitFor(() => expect(altField).toHaveValue('Alpha'));

    await user.clear(altField);
    await user.type(altField, 'Updated alt');
    await user.click(screen.getByRole('button', { name: /use this media/i }));

    expect(onSelect).toHaveBeenCalledWith({ media_id: 'm1', alt: 'Updated alt' });
  });
});
