import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PreviewPage from './PreviewPage';
import * as previewApi from '../api/previewApi';
import * as pagesApi from '../api/pagesApi';
import type { Page } from '../types/admin';

vi.mock('../api/previewApi', () => ({
  mintPreviewToken: vi.fn(),
}));

vi.mock('../api/pagesApi', () => ({
  getPages: vi.fn(),
}));

const home: Page = {
  id: 'p1',
  slug: 'home',
  title: 'Ben Kile',
  nav_label: 'Home',
  nav_position: 0,
  is_hidden: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const about: Page = {
  id: 'p2',
  slug: 'about',
  title: 'About',
  nav_label: 'About',
  nav_position: 1,
  is_hidden: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://public.example.com');
  vi.mocked(previewApi.mintPreviewToken).mockResolvedValue({ token: 'tok-page' });
  vi.mocked(pagesApi.getPages).mockResolvedValue([home, about]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('PreviewPage (§7)', () => {
  it('defaults to home and iframes it at /?preview=<token>', async () => {
    render(<PreviewPage />);

    const iframe = await screen.findByTestId('preview-iframe');
    expect(iframe).toHaveAttribute('src', 'https://public.example.com/?preview=tok-page');
    expect(previewApi.mintPreviewToken).toHaveBeenCalledTimes(1);
  });

  it('shows the target URL with an open-in-new-tab action', async () => {
    render(<PreviewPage />);
    await screen.findByTestId('preview-iframe');

    const openLink = screen.getByRole('link', { name: /open preview in a new tab/i });
    expect(openLink).toHaveAttribute('href', 'https://public.example.com/?preview=tok-page');
    expect(openLink).toHaveAttribute('target', '_blank');
  });

  it('retargets the iframe to /<slug> when another page is selected (§3.10)', async () => {
    const user = userEvent.setup();
    render(<PreviewPage />);
    await screen.findByTestId('preview-iframe');

    // The selector lists every page; switch to About.
    await user.click(await screen.findByRole('tab', { name: 'About' }));

    const iframe = await screen.findByTestId('preview-iframe');
    expect(iframe).toHaveAttribute('src', 'https://public.example.com/about?preview=tok-page');
  });
});
