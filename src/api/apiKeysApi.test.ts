import { describe, it, expect, afterEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import apiClient from './apiClient';
import { createApiKey, getApiKeys, revokeApiKey } from './apiKeysApi';
import { getIdToken } from '../lib/cognitoClient';
import type { ApiKey, MintedApiKey } from '../types/admin';

vi.mock('../lib/cognitoClient');
vi.mocked(getIdToken).mockResolvedValue('test-token');

const mock = new MockAdapter(apiClient);

afterEach(() => {
  mock.reset();
});

const ok = <T>(data: T) => ({ status: 'ok', error: false, data });

const active: ApiKey = {
  id: 'k1',
  name: 'CI publisher',
  key_prefix: 'pv6k_abc1234',
  created_at: '2026-08-01T00:00:00Z',
  last_used_at: '2026-08-05T00:00:00Z',
  revoked_at: null,
};

const minted: MintedApiKey = {
  ...active,
  id: 'k9',
  name: 'New key',
  key_prefix: 'pv6k_xyz9876',
  key: 'pv6k_xyz9876deadbeefcafef00d',
  last_used_at: null,
  revoked_at: null,
};

describe('apiKeysApi (API Keys v1.16)', () => {
  it('getApiKeys unwraps a bare array in data', async () => {
    mock.onGet('/api/admin/api-keys').reply(200, ok([active]));
    expect(await getApiKeys()).toEqual([active]);
  });

  it('getApiKeys also accepts a keyed { api_keys: [...] } payload (defensive)', async () => {
    mock.onGet('/api/admin/api-keys').reply(200, ok({ api_keys: [active] }));
    expect(await getApiKeys()).toEqual([active]);
  });

  it('createApiKey posts { name } and returns the full one-time key', async () => {
    mock.onPost('/api/admin/api-keys').reply(201, ok(minted));
    const result = await createApiKey('New key');
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ name: 'New key' });
    expect(result.key).toBe('pv6k_xyz9876deadbeefcafef00d');
    expect(result.key_prefix).toBe('pv6k_xyz9876');
  });

  it('createApiKey surfaces a server rejection to the caller', async () => {
    mock.onPost('/api/admin/api-keys').reply(422, {
      status: 'error',
      error: true,
      errorMsg: 'name is required',
    });
    await expect(createApiKey('')).rejects.toBeDefined();
  });

  it('revokeApiKey POSTs to the revoke route', async () => {
    mock.onPost('/api/admin/api-keys/k1/revoke').reply(200, ok({}));
    await revokeApiKey('k1');
    expect(mock.history.post[0].url).toBe('/api/admin/api-keys/k1/revoke');
  });

  it('revokeApiKey surfaces a 404 unknown-id rejection to the caller', async () => {
    mock.onPost('/api/admin/api-keys/nope/revoke').reply(404, { status: 'error', error: true });
    await expect(revokeApiKey('nope')).rejects.toBeDefined();
  });
});
