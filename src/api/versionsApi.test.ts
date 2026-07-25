import { describe, it, expect, afterEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import apiClient from './apiClient';
import { getVersions, publishSite, PublishValidationError, restoreVersion } from './versionsApi';
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

  it('publishSite POSTs to /api/admin/publish and returns the new version', async () => {
    const created: Version = {
      version: 3,
      published_at: '2026-07-25T00:00:00Z',
      published_by: 'ben@example.com',
    };
    mock.onPost('/api/admin/publish').reply(200, ok(created));
    expect(await publishSite()).toEqual(created);
    expect(mock.history.post[0].url).toBe('/api/admin/publish');
  });

  it('publishSite maps a 422 into PublishValidationError with the per-issue list (§3.9)', async () => {
    mock.onPost('/api/admin/publish').reply(422, {
      status: 'error',
      error: true,
      errorMsg: 'Working set failed validation.',
      errors: ['hero: title is required', 'portfolio item 2: missing media'],
    });
    await expect(publishSite()).rejects.toMatchObject({
      name: 'PublishValidationError',
      issues: ['hero: title is required', 'portfolio item 2: missing media'],
    });
  });

  it('publishSite rethrows a non-validation failure as a plain Error', async () => {
    mock.onPost('/api/admin/publish').reply(500, { status: 'error', error: true });
    await expect(publishSite()).rejects.not.toBeInstanceOf(PublishValidationError);
  });
});
