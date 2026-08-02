import { describe, it, expect, afterEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import apiClient from './apiClient';
import {
  ConflictError,
  createPage,
  deletePage,
  getPages,
  reorderPages,
  updatePage,
} from './pagesApi';
import { getIdToken } from '../lib/cognitoClient';
import type { Page } from '../types/admin';

vi.mock('../lib/cognitoClient');
vi.mocked(getIdToken).mockResolvedValue('test-token');

const mock = new MockAdapter(apiClient);

afterEach(() => {
  mock.reset();
});

const ok = <T>(data: T) => ({ status: 'ok', error: false, data });

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

describe('pagesApi (§3.10, §4.2)', () => {
  it('getPages unwraps a keyed { pages: [...] } payload', async () => {
    mock.onGet('/api/admin/pages').reply(200, ok({ pages: [home] }));
    expect(await getPages()).toEqual([home]);
  });

  it('getPages also accepts a bare array in data (defensive)', async () => {
    mock.onGet('/api/admin/pages').reply(200, ok([home]));
    expect(await getPages()).toEqual([home]);
  });

  it('createPage posts slug/title/nav_label', async () => {
    mock.onPost('/api/admin/pages').reply(200, ok({ ...home, id: 'p9', slug: 'about' }));
    await createPage({ slug: 'about', title: 'About', nav_label: 'About' });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({
      slug: 'about',
      title: 'About',
      nav_label: 'About',
    });
  });

  it('deletePage issues a DELETE to the row', async () => {
    mock.onDelete('/api/admin/pages/p1').reply(200, ok({}));
    await deletePage('p1');
    expect(mock.history.delete[0].url).toBe('/api/admin/pages/p1');
  });

  it('reorderPages PUTs the complete { ids } array (§4.2)', async () => {
    mock.onPut('/api/admin/pages/order').reply(200, ok({}));
    await reorderPages(['c', 'a', 'b']);

    expect(mock.history.put).toHaveLength(1);
    expect(mock.history.put[0].url).toBe('/api/admin/pages/order');
    expect(JSON.parse(mock.history.put[0].data)).toEqual({ ids: ['c', 'a', 'b'] });
  });
});

describe('pagesApi — optimistic concurrency (§4.5)', () => {
  it('updatePage sends expected_updated_at', async () => {
    mock.onPatch('/api/admin/pages/p1').reply(200, ok(home));
    await updatePage('p1', { title: 'Hi', expected_updated_at: '2026-01-01T00:00:00Z' });

    const body = JSON.parse(mock.history.patch[0].data);
    expect(body.expected_updated_at).toBe('2026-01-01T00:00:00Z');
    expect(body.title).toBe('Hi');
  });

  it('updatePage throws ConflictError on 409', async () => {
    mock.onPatch('/api/admin/pages/p1').reply(409, { status: 'error', error: true });
    await expect(
      updatePage('p1', { title: 'x', expected_updated_at: 'stale' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('updatePage re-throws non-409 errors untouched', async () => {
    mock.onPatch('/api/admin/pages/p1').reply(500, { status: 'error', error: true });
    await expect(
      updatePage('p1', { title: 'x', expected_updated_at: 'x' }),
    ).rejects.not.toBeInstanceOf(ConflictError);
  });
});
