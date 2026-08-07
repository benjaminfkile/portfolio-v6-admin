import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IconPicker from './IconPicker';
import * as api from '../../api/iconsApi';
import type { DeviconIcon } from '../../api/iconsApi';

vi.mock('../../api/iconsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/iconsApi')>();
  return {
    ...actual,
    getDeviconManifest: vi.fn(),
    importIcon: vi.fn(),
  };
});

const ICONS: DeviconIcon[] = [
  { name: 'react', altnames: ['reactjs'], tags: ['ui'], versions: ['original', 'plain', 'line'], color: '#61DAFB' },
  { name: 'postgresql', altnames: ['postgres'], tags: ['database'], versions: ['original', 'plain-wordmark'], color: '#336791' },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getDeviconManifest).mockResolvedValue({ version: 'v2.16.0', icons: ICONS });
  vi.mocked(api.importIcon).mockResolvedValue('https://cdn.example.com/icons/devicon/react-original@v2.16.0.svg');
});

describe('IconPicker', () => {
  it('filters the manifest by search query (name/altnames/tags)', async () => {
    const user = userEvent.setup();
    render(<IconPicker open onClose={() => {}} onSelect={() => {}} />);

    // Both icons show before searching.
    await screen.findByRole('button', { name: /select react/i });
    expect(screen.getByRole('button', { name: /select postgresql/i })).toBeInTheDocument();

    // Searching by tag "database" narrows to postgresql only.
    await user.type(screen.getByLabelText(/search icons/i), 'database');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /select react/i })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /select postgresql/i })).toBeInTheDocument();
  });

  it('selecting an icon + variant and confirming imports and returns the CDN url', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<IconPicker open onClose={onClose} onSelect={onSelect} />);

    // "Use this icon" is disabled until an icon (and thus a default variant) is chosen.
    const confirm = screen.getByRole('button', { name: /use this icon/i });
    expect(confirm).toBeDisabled();

    await user.click(await screen.findByRole('button', { name: /select react/i }));

    // Variant chips (light+dark swatch) appear; pick "plain".
    expect(confirm).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /variant plain$/i }));
    await user.click(confirm);

    await waitFor(() => expect(api.importIcon).toHaveBeenCalledWith('react', 'plain'));
    expect(onSelect).toHaveBeenCalledWith(
      'https://cdn.example.com/icons/devicon/react-original@v2.16.0.svg',
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('previews each variant on a light and a dark swatch', async () => {
    const user = userEvent.setup();
    render(<IconPicker open onClose={() => {}} onSelect={() => {}} />);

    await user.click(await screen.findByRole('button', { name: /select react/i }));

    // The "original" variant shows the same source twice — once per swatch. The imgs carry
    // alt="" (presentational), so query the DOM directly rather than by the "img" role.
    const originalVariant = screen.getByRole('button', { name: /variant original$/i });
    const imgs = originalVariant.querySelectorAll('img');
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toHaveAttribute(
      'src',
      'https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/react/react-original.svg',
    );
  });
});
