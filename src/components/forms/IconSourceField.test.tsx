import { useState } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IconSourceField from './IconSourceField';
import * as api from '../../api/iconsApi';
import type { DeviconIcon } from '../../api/iconsApi';

vi.mock('../../api/iconsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/iconsApi')>();
  return {
    ...actual,
    getDeviconManifest: vi.fn(),
    importIcon: vi.fn(),
    getSimpleIconsManifest: vi.fn(),
    importSimpleIcon: vi.fn(),
  };
});

const ICONS: DeviconIcon[] = [
  { name: 'react', altnames: [], tags: ['ui'], versions: ['original', 'plain'], color: '#61DAFB' },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getDeviconManifest).mockResolvedValue({ version: 'v2.16.0', icons: ICONS });
  vi.mocked(api.importIcon).mockResolvedValue('https://cdn.example.com/icons/devicon/react-plain@v2.16.0.svg');
  vi.mocked(api.getSimpleIconsManifest).mockResolvedValue({
    version: '13.0.0',
    icons: [
      { slug: 'react', title: 'React' },
      { slug: 'express', title: 'Express' },
    ],
  });
  vi.mocked(api.importSimpleIcon).mockResolvedValue(
    'https://cdn.example.com/icons/simpleicons/react-EDF1F7.svg',
  );
});

describe('IconSourceField', () => {
  it('manual-URL escape hatch: typing writes a custom URL through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // Stateful wrapper so the controlled `value` reflects each keystroke — otherwise a
    // controlled input pinned at "" would report only the last character typed.
    function Harness() {
      const [value, setValue] = useState('');
      return (
        <IconSourceField
          label="Icon"
          value={value}
          required
          onChange={(v) => {
            onChange(v);
            setValue(v ?? '');
          }}
        />
      );
    }
    render(<Harness />);

    // The text field is read-only until the manual affordance is toggled on.
    await user.click(screen.getByRole('button', { name: /enter url manually/i }));
    await user.type(screen.getByLabelText(/icon/i), 'https://cdn.simpleicons.org/react');

    // Last onChange carries the full manually-entered URL.
    expect(onChange).toHaveBeenLastCalledWith('https://cdn.simpleicons.org/react');
  });

  it('clearing an optional field passes undefined so the key is removed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <IconSourceField
        label="Dark theme icon"
        value="https://cdn.example.com/icons/devicon/react-original@v2.16.0.svg"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^clear$/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('picking an icon through the dialog imports and writes the CDN url (dark round-trip)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<IconSourceField label="Dark theme icon" value="" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /choose/i }));
    await user.click(await screen.findByRole('button', { name: /select react/i }));
    await user.click(screen.getByRole('button', { name: /variant plain$/i }));
    await user.click(screen.getByRole('button', { name: /use this icon/i }));

    await waitFor(() => expect(api.importIcon).toHaveBeenCalledWith('react', 'plain'));
    expect(onChange).toHaveBeenCalledWith(
      'https://cdn.example.com/icons/devicon/react-plain@v2.16.0.svg',
    );
  });

  it('dark field opens the tint-first picker and imports a tinted CDN url', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<IconSourceField label="Dark theme icon" value="" dark onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /choose/i }));

    // Tint tab is the default for a dark field.
    expect(screen.getByRole('tab', { name: /tinted \(recommended\)/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(await screen.findByRole('button', { name: /select express/i }));
    await user.click(screen.getByRole('button', { name: /use this icon/i }));

    await waitFor(() => expect(api.importSimpleIcon).toHaveBeenCalledWith('express', 'EDF1F7'));
    expect(onChange).toHaveBeenCalledWith(
      'https://cdn.example.com/icons/simpleicons/react-EDF1F7.svg',
    );
  });

  it('pre-seeds the tint search from a devicon-imported light icon (one-click same-logo tint)', async () => {
    const user = userEvent.setup();
    render(
      <IconSourceField
        label="Dark theme icon"
        value=""
        dark
        lightIconUrl="https://cdn.example.com/icons/devicon/react-original@v2.16.0.svg"
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /choose/i }));

    // The search is seeded with "react" (parsed from the light icon URL) — Express is filtered out.
    expect(await screen.findByLabelText(/search simple icons/i)).toHaveValue('react');
    await screen.findByRole('button', { name: /select react/i });
    expect(screen.queryByRole('button', { name: /select express/i })).not.toBeInTheDocument();
  });
});
