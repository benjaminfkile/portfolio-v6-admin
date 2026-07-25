import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VersionsPage from './VersionsPage';
import * as api from '../api/versionsApi';
import type { Version } from '../types/admin';

vi.mock('../api/versionsApi', () => ({
  getVersions: vi.fn(),
  restoreVersion: vi.fn(),
}));

const versions: Version[] = [
  { version: 1, published_at: '2026-07-20T00:00:00Z', published_by: 'ben@example.com' },
  { version: 3, published_at: '2026-07-24T00:00:00Z', published_by: 'ben@example.com' },
  { version: 2, published_at: '2026-07-22T00:00:00Z', published_by: 'ada@example.com' },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getVersions).mockResolvedValue(versions);
  vi.mocked(api.restoreVersion).mockResolvedValue();
});

describe('VersionsPage (§4.2)', () => {
  it('lists versions newest-first with number, date, and author', async () => {
    render(<VersionsPage />);
    const rows = await screen.findAllByTestId('version-row');
    expect(rows).toHaveLength(3);

    // Sorted by version desc regardless of API order: v3, v2, v1.
    expect(within(rows[0]).getByText('v3')).toBeInTheDocument();
    expect(within(rows[1]).getByText('v2')).toBeInTheDocument();
    expect(within(rows[2]).getByText('v1')).toBeInTheDocument();

    // The live (newest) row is badged and its Restore is disabled.
    expect(within(rows[0]).getByText('Live')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: /restore/i })).toBeDisabled();
    expect(within(rows[1]).getByRole('button', { name: /restore/i })).toBeEnabled();
    expect(within(rows[1]).getByText('ada@example.com')).toBeInTheDocument();
  });

  it('restore shows an explicit discard warning and only restores after confirming', async () => {
    const user = userEvent.setup();
    render(<VersionsPage />);
    const rows = await screen.findAllByTestId('version-row');

    // Open the confirm for v2.
    await user.click(within(rows[1]).getByRole('button', { name: /restore/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Restore version 2\?/i)).toBeInTheDocument();
    // The warning must state the current unpublished edits are DISCARDED.
    expect(within(dialog).getByText(/DISCARDED and replaced by this version/)).toBeInTheDocument();

    // Nothing fired yet — the warning is a hard gate.
    expect(api.restoreVersion).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /discard edits & restore/i }));

    await waitFor(() => expect(api.restoreVersion).toHaveBeenCalledWith(2));
    // Refreshes the list after restoring.
    expect(api.getVersions).toHaveBeenCalledTimes(2);
  });

  it('cancelling the warning does not restore', async () => {
    const user = userEvent.setup();
    render(<VersionsPage />);
    const rows = await screen.findAllByTestId('version-row');

    await user.click(within(rows[2]).getByRole('button', { name: /restore/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

    expect(api.restoreVersion).not.toHaveBeenCalled();
  });
});
