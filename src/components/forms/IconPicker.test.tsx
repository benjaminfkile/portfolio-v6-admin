import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IconPicker from './IconPicker';
import * as api from '../../api/iconsApi';
import type { DeviconIcon, SimpleIcon } from '../../api/iconsApi';

vi.mock('../../api/iconsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/iconsApi')>();
  return {
    ...actual,
    getDeviconManifest: vi.fn(),
    importIcon: vi.fn(),
    getSimpleIconsManifest: vi.fn(),
    importSimpleIcon: vi.fn(),
    fetchTintedSimpleIcon: vi.fn(),
  };
});

/** The data URI the mocked pinned-tint fetch resolves to (see beforeEach). */
const TINT_DATA_URI = 'data:image/svg+xml;utf8,%3Csvg%20fill%3D%22%23abcdef%22%2F%3E';

const ICONS: DeviconIcon[] = [
  { name: 'react', altnames: ['reactjs'], tags: ['ui'], versions: ['original', 'plain', 'line'], color: '#61DAFB' },
  { name: 'postgresql', altnames: ['postgres'], tags: ['database'], versions: ['original', 'plain-wordmark'], color: '#336791' },
];

const SIMPLE_ICONS: SimpleIcon[] = [
  { slug: 'express', title: 'Express' },
  { slug: 'vercel', title: 'Vercel' },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getDeviconManifest).mockResolvedValue({ version: 'v2.16.0', icons: ICONS });
  vi.mocked(api.importIcon).mockResolvedValue('https://cdn.example.com/icons/devicon/react-original@v2.16.0.svg');
  vi.mocked(api.getSimpleIconsManifest).mockResolvedValue({ version: '13.0.0', icons: SIMPLE_ICONS });
  vi.mocked(api.importSimpleIcon).mockResolvedValue('https://cdn.example.com/icons/simpleicons/express-EDF1F7.svg');
  vi.mocked(api.fetchTintedSimpleIcon).mockResolvedValue(TINT_DATA_URI);
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

  it('a light field shows no tabs (devicon-only)', async () => {
    render(<IconPicker open onClose={() => {}} onSelect={() => {}} />);
    await screen.findByRole('button', { name: /select react/i });
    expect(screen.queryByRole('tab', { name: /tinted/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /devicon/i })).not.toBeInTheDocument();
  });
});

describe('IconPicker — dark override (tint-first, Icons v1.6.1)', () => {
  it('opens on the "Tinted (recommended)" tab by default for a dark field', async () => {
    render(<IconPicker open dark onClose={() => {}} onSelect={() => {}} />);

    // Both tabs exist; the tint search + a Simple Icons result are shown, not devicon.
    expect(screen.getByRole('tab', { name: /tinted \(recommended\)/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /^devicon$/i })).toBeInTheDocument();
    await screen.findByRole('button', { name: /select express/i });
    expect(screen.queryByRole('button', { name: /select react/i })).not.toBeInTheDocument();
  });

  it('preset ink chip → import posts { source, slug, color } and returns the CDN url', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<IconPicker open dark onClose={onClose} onSelect={onSelect} />);

    await user.click(await screen.findByRole('button', { name: /select express/i }));
    // Default tint is the first preset (Text bright, EDF1F7); confirm imports it.
    await user.click(screen.getByRole('button', { name: /use this icon/i }));

    await waitFor(() => expect(api.importSimpleIcon).toHaveBeenCalledWith('express', 'EDF1F7'));
    expect(onSelect).toHaveBeenCalledWith(
      'https://cdn.example.com/icons/simpleicons/express-EDF1F7.svg',
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('picking the amber preset chip imports with that ink', async () => {
    const user = userEvent.setup();
    render(<IconPicker open dark onClose={() => {}} onSelect={() => {}} />);

    await user.click(await screen.findByRole('button', { name: /select express/i }));
    await user.click(screen.getByRole('button', { name: /tint amber accent/i }));
    await user.click(screen.getByRole('button', { name: /use this icon/i }));

    await waitFor(() => expect(api.importSimpleIcon).toHaveBeenCalledWith('express', 'E8A33D'));
  });

  it('free hex input tints the import (and the preview lands on the dark swatch)', async () => {
    const user = userEvent.setup();
    render(<IconPicker open dark onClose={() => {}} onSelect={() => {}} />);

    await user.click(await screen.findByRole('button', { name: /select express/i }));

    const hex = screen.getByLabelText(/hex/i);
    await user.clear(hex);
    await user.type(hex, 'abcdef');

    // Preview resolves through the PINNED tint pipeline (jsDelivr raw +
    // client-side tint → data URI) — never live cdn.simpleicons.org, which
    // 404s icons removed upstream since the pin (the AWS icons regression).
    await waitFor(() =>
      expect(api.fetchTintedSimpleIcon).toHaveBeenCalledWith('13.0.0', 'express', 'abcdef'),
    );
    const preview = screen.getByTestId('tint-preview').querySelector('img');
    await waitFor(() => expect(preview).toHaveAttribute('src', TINT_DATA_URI));

    await user.click(screen.getByRole('button', { name: /use this icon/i }));
    await waitFor(() => expect(api.importSimpleIcon).toHaveBeenCalledWith('express', 'abcdef'));
  });

  it('an invalid hex disables Confirm and never imports', async () => {
    const user = userEvent.setup();
    render(<IconPicker open dark onClose={() => {}} onSelect={() => {}} />);

    await user.click(await screen.findByRole('button', { name: /select express/i }));
    const hex = screen.getByLabelText(/hex/i);
    await user.clear(hex);
    await user.type(hex, 'xyz');

    expect(screen.getByRole('button', { name: /use this icon/i })).toBeDisabled();
    expect(api.importSimpleIcon).not.toHaveBeenCalled();
  });

  it('the Devicon tab still runs the unchanged catalog import (regression)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<IconPicker open dark onClose={() => {}} onSelect={onSelect} />);

    await user.click(screen.getByRole('tab', { name: /^devicon$/i }));
    await user.click(await screen.findByRole('button', { name: /select react/i }));
    await user.click(screen.getByRole('button', { name: /variant plain$/i }));
    await user.click(screen.getByRole('button', { name: /use this icon/i }));

    await waitFor(() => expect(api.importIcon).toHaveBeenCalledWith('react', 'plain'));
    expect(api.importSimpleIcon).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(
      'https://cdn.example.com/icons/devicon/react-original@v2.16.0.svg',
    );
  });

  it('pre-seeds the tint search from a devicon-imported light icon name', async () => {
    render(
      <IconPicker
        open
        dark
        seedSearch="vercel"
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );

    // Seeded query narrows the catalog to matching slugs/titles immediately.
    await screen.findByRole('button', { name: /select vercel/i });
    expect(screen.queryByRole('button', { name: /select express/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/search simple icons/i)).toHaveValue('vercel');
  });
});
