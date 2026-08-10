import { describe, it, expect, afterEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import apiClient from './apiClient';
import {
  ConflictError,
  createBlog,
  deleteBlog,
  getBlogs,
  updateBlog,
} from './blogsApi';
import { getIdToken } from '../lib/cognitoClient';
import type { Blog } from '../types/admin';

vi.mock('../lib/cognitoClient');
vi.mocked(getIdToken).mockResolvedValue('test-token');

const mock = new MockAdapter(apiClient);

afterEach(() => {
  mock.reset();
});

const ok = <T>(data: T) => ({ status: 'ok', error: false, data });

const notes: Blog = {
  id: 'b1',
  slug: 'notes',
  name: 'Notes',
  post_count: 3,
  updated_at: '2026-01-01T00:00:00Z',
};

describe('blogsApi (Blogs v1.13)', () => {
  it('getBlogs unwraps a bare array in data', async () => {
    mock.onGet('/api/admin/blogs').reply(200, ok([notes]));
    expect(await getBlogs()).toEqual([notes]);
  });

  it('getBlogs also accepts a keyed { blogs: [...] } payload (defensive)', async () => {
    mock.onGet('/api/admin/blogs').reply(200, ok({ blogs: [notes] }));
    expect(await getBlogs()).toEqual([notes]);
  });

  it('createBlog posts slug/name', async () => {
    mock.onPost('/api/admin/blogs').reply(201, ok({ ...notes, id: 'b9', slug: 'devlog' }));
    await createBlog({ slug: 'devlog', name: 'Devlog' });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ slug: 'devlog', name: 'Devlog' });
  });

  it('deleteBlog issues a DELETE to the row', async () => {
    mock.onDelete('/api/admin/blogs/b1').reply(200, ok({}));
    await deleteBlog('b1');
    expect(mock.history.delete[0].url).toBe('/api/admin/blogs/b1');
  });
});

describe('blogsApi — optimistic concurrency (§4.5)', () => {
  it('updateBlog sends expected_updated_at', async () => {
    mock.onPatch('/api/admin/blogs/b1').reply(200, ok(notes));
    await updateBlog('b1', { name: 'Field Notes', expected_updated_at: '2026-01-01T00:00:00Z' });

    const body = JSON.parse(mock.history.patch[0].data);
    expect(body.expected_updated_at).toBe('2026-01-01T00:00:00Z');
    expect(body.name).toBe('Field Notes');
  });

  it('updateBlog throws ConflictError on 409', async () => {
    mock.onPatch('/api/admin/blogs/b1').reply(409, { status: 'error', error: true });
    await expect(
      updateBlog('b1', { name: 'x', expected_updated_at: 'stale' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('updateBlog re-throws non-409 errors untouched', async () => {
    mock.onPatch('/api/admin/blogs/b1').reply(500, { status: 'error', error: true });
    await expect(
      updateBlog('b1', { name: 'x', expected_updated_at: 'x' }),
    ).rejects.not.toBeInstanceOf(ConflictError);
  });

  it('createBlog surfaces a 409 duplicate-slug rejection to the caller', async () => {
    mock.onPost('/api/admin/blogs').reply(409, { status: 'error', error: true, errorMsg: 'dup' });
    await expect(createBlog({ slug: 'notes', name: 'Notes' })).rejects.toBeDefined();
  });
});
