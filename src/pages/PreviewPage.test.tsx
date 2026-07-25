import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PreviewPage from './PreviewPage';
import * as previewApi from '../api/previewApi';

vi.mock('../api/previewApi', () => ({
  mintPreviewToken: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://public.example.com');
  vi.mocked(previewApi.mintPreviewToken).mockResolvedValue({ token: 'tok-page' });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('PreviewPage (§7)', () => {
  it('mints a token and iframes the page preview at /?preview=<token>', async () => {
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
});
