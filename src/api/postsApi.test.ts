import { describe, it, expect, afterEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import apiClient from './apiClient';
import {
  ConflictError,
  PostValidationError,
  createPost,
  deletePost,
  getPost,
  getPosts,
  publishPost,
  unpublishPost,
  updatePost,
} from './postsApi';
import { getIdToken } from '../lib/cognitoClient';
import type { Block } from '../types/content';

vi.mock('../lib/cognitoClient');
vi.mocked(getIdToken).mockResolvedValue('test-token');

const mock = new MockAdapter(apiClient);

afterEach(() => {
  mock.reset();
});

const ok = <T>(data: T) => ({ status: 'ok', error: false, data });

describe('postsApi — reads and create', () => {
  it('getPosts unwraps the envelope', async () => {
    mock.onGet('/api/admin/posts').reply(200, ok({ posts: [{ id: 'p1', title: 'Hello' }] }));
    expect(await getPosts()).toEqual([{ id: 'p1', title: 'Hello' }]);
  });

  it('getPost fetches one post by id', async () => {
    mock.onGet('/api/admin/posts/p1').reply(200, ok({ id: 'p1', draft_body: [] }));
    expect(await getPost('p1')).toEqual({ id: 'p1', draft_body: [] });
  });

  it('createPost posts title + slug', async () => {
    mock.onPost('/api/admin/posts').reply(200, ok({ id: 'p9' }));
    await createPost({ title: 'My Post', slug: 'my-post' });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ title: 'My Post', slug: 'my-post' });
  });

  it('deletePost issues a DELETE to the row', async () => {
    mock.onDelete('/api/admin/posts/p1').reply(200, ok({}));
    await deletePost('p1');
    expect(mock.history.delete[0].url).toBe('/api/admin/posts/p1');
  });
});

describe('postsApi — wholesale draft_body PATCH (§4.2, §4.5)', () => {
  const body: Block[] = [
    { type: 'heading', level: 2, text: 'Intro' },
    { type: 'paragraph', text: 'Hello' },
  ];

  it('updatePost sends the complete draft_body array and expected_updated_at', async () => {
    mock.onPatch('/api/admin/posts/p1').reply(200, ok({ id: 'p1', updated_at: 'new' }));
    await updatePost('p1', {
      title: 'T',
      draft_body: body,
      expected_updated_at: '2026-01-01T00:00:00Z',
    });

    const sent = JSON.parse(mock.history.patch[0].data);
    // Wholesale: the entire block array goes in one PATCH, not per-block routes.
    expect(sent.draft_body).toEqual(body);
    expect(sent.draft_body).toHaveLength(2);
    expect(sent.expected_updated_at).toBe('2026-01-01T00:00:00Z');
    expect(sent.title).toBe('T');
  });

  it('updatePost throws ConflictError on 409', async () => {
    mock.onPatch('/api/admin/posts/p1').reply(409, { status: 'error', error: true });
    await expect(
      updatePost('p1', { draft_body: [], expected_updated_at: 'stale' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('updatePost re-throws non-409 errors untouched', async () => {
    mock.onPatch('/api/admin/posts/p1').reply(500, { status: 'error', error: true });
    await expect(
      updatePost('p1', { draft_body: [], expected_updated_at: 'x' }),
    ).rejects.not.toBeInstanceOf(ConflictError);
  });
});

describe('postsApi — publish / unpublish with validation surfacing (§3.6, §3.9)', () => {
  it('publishPost returns the updated post on success', async () => {
    mock.onPost('/api/admin/posts/p1/publish').reply(
      200,
      ok({ id: 'p1', published_at: '2026-07-25T00:00:00Z', published_body: [] }),
    );
    const post = await publishPost('p1');
    expect(post.published_at).toBe('2026-07-25T00:00:00Z');
  });

  it('publishPost throws PostValidationError with issues on 422', async () => {
    mock.onPost('/api/admin/posts/p1/publish').reply(422, {
      status: 'error',
      error: true,
      errorMsg: 'Validation failed',
      errors: ['Block 2: code language "cobol" is not allowed', 'Block 4: link url must be http(s)'],
    });

    await expect(publishPost('p1')).rejects.toMatchObject({
      name: 'PostValidationError',
      issues: [
        'Block 2: code language "cobol" is not allowed',
        'Block 4: link url must be http(s)',
      ],
    });
  });

  it('publishPost surfaces a bare 400 errorMsg as a validation error', async () => {
    mock.onPost('/api/admin/posts/p1/publish').reply(400, {
      status: 'error',
      error: true,
      errorMsg: 'Post body is empty',
    });
    const err = await publishPost('p1').catch((e) => e);
    expect(err).toBeInstanceOf(PostValidationError);
    expect(err.message).toBe('Post body is empty');
  });

  it('unpublishPost posts to the unpublish route', async () => {
    mock.onPost('/api/admin/posts/p1/unpublish').reply(200, ok({ id: 'p1', published_at: null }));
    const post = await unpublishPost('p1');
    expect(post.published_at).toBeNull();
    expect(mock.history.post[0].url).toBe('/api/admin/posts/p1/unpublish');
  });
});
