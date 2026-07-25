import { describe, it, expect, afterEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import apiClient from './apiClient';
import { getVersions, restoreVersion } from './versionsApi';
import { getIdToken } from '../lib/cognitoClient';
import type { Version } from '../types/admin';

vi.mock('../lib/cognitoClient');
vi.mocked(getIdToken).mockResolvedValue('test-token');

const mock = new MockAdapter(apiClient);

afterEach(() => {
  mock.reset();
});

const ok = <T>(data: T) => ({ status: 'ok', error: false, data });

const versions: Version[] = [
  { version: 2, published_at: '2026-07-24T00:00:00Z', published_by: 'ben@example.com' },
  { version: 1, published_at: '2026-07-20T00:00:00Z', published_by: 'ben@example.com' },
];

describe('versionsApi (§4.2)', () => {
  it('getVersions unwraps the envelope', async () => {
    mock.onGet('/api/admin/versions').reply(200, ok(versions));
    expect(await getVersions()).toEqual(versions);
  });

  it('restoreVersion POSTs to /api/admin/versions/:v/restore', async () => {
    mock.onPost('/api/admin/versions/2/restore').reply(200, ok({}));
    await restoreVersion(2);
    expect(mock.history.post[0].url).toBe('/api/admin/versions/2/restore');
  });
});
