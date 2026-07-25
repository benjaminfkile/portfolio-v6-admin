import { describe, it, expect, afterEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import apiClient from './apiClient';
import { mintPreviewToken } from './previewApi';
import { getIdToken } from '../lib/cognitoClient';

vi.mock('../lib/cognitoClient');
vi.mocked(getIdToken).mockResolvedValue('test-token');

const mock = new MockAdapter(apiClient);

afterEach(() => {
  mock.reset();
});

const ok = <T>(data: T) => ({ status: 'ok', error: false, data });

describe('previewApi.mintPreviewToken (§7)', () => {
  it('POSTs to /api/admin/preview-token and unwraps the token', async () => {
    mock
      .onPost('/api/admin/preview-token')
      .reply(200, ok({ token: 'opaque-123', expires_at: '2026-07-25T12:15:00Z' }));

    const minted = await mintPreviewToken();
    expect(minted.token).toBe('opaque-123');
    expect(minted.expires_at).toBe('2026-07-25T12:15:00Z');
    expect(mock.history.post[0].url).toBe('/api/admin/preview-token');
  });

  it('propagates a failed mint so the UI can surface it', async () => {
    mock.onPost('/api/admin/preview-token').reply(500, { status: 'error', error: true });
    await expect(mintPreviewToken()).rejects.toBeDefined();
  });
});
