import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PostEditorPage from './PostEditorPage';
import * as postsApi from '../api/postsApi';
import * as blogsApi from '../api/blogsApi';
import type { Post } from '../types/content';

vi.mock('../api/postsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/postsApi')>();
  return {
    ...actual,
    getPost: vi.fn(),
    updatePost: vi.fn(),
    publishPost: vi.fn(),
    unpublishPost: vi.fn(),
  };
});
vi.mock('../api/blogsApi');

const draftPost: Post = {
  id: 'p1',
  slug: 'my-post',
  title: 'My Post',
  excerpt: '',
  cover_media_id: null,
  tags: [],
  blog_id: null,
  blog: null,
  draft_body: [],
  published_body: null,
  published_at: null,
  created_at: '2026-07-20T00:00:00Z',
  updated_at: '2026-07-20T00:00:00Z',
};

const publishedPost: Post = {
  ...draftPost,
  id: 'p2',
  slug: 'published',
  title: 'Published',
  published_at: '2026-08-21T14:30:00.000Z',
  published_body: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(blogsApi.getBlogs).mockResolvedValue([]);
  vi.mocked(postsApi.updatePost).mockImplementation(async (id, payload) => ({
    ...draftPost,
    id,
    updated_at: '2026-08-21T15:00:00.000Z',
    published_at: payload.published_at ?? null,
  }));
});

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/posts/${id}`]}>
      <Routes>
        <Route path="/posts/:id" element={<PostEditorPage />} />
        <Route path="/posts" element={<div>Posts list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PostEditorPage — Published on wiring (task #134)', () => {
  it('prefills the Published on control from post.published_at', async () => {
    vi.mocked(postsApi.getPost).mockResolvedValue(publishedPost);
    renderAt('p2');
    await screen.findByLabelText(/published on/i);
    const input = screen.getByTestId('published-at-input') as HTMLInputElement;
    // The prefilled value renders the stored ISO in the browser's local timezone.
    expect(input.value).not.toBe('');
    const asDate = new Date(input.value);
    expect(asDate.toISOString()).toBe('2026-08-21T14:30:00.000Z');
  });

  it('renders empty for a draft post that has never been published', async () => {
    vi.mocked(postsApi.getPost).mockResolvedValue(draftPost);
    renderAt('p1');
    await screen.findByLabelText(/published on/i);
    const input = screen.getByTestId('published-at-input') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('sends published_at as an ISO UTC string in the metadata PATCH after editing', async () => {
    vi.mocked(postsApi.getPost).mockResolvedValue(draftPost);
    renderAt('p1');
    const input = (await screen.findByTestId('published-at-input')) as HTMLInputElement;

    fireEvent.change(input, { target: { value: '2026-08-21T14:30' } });

    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => expect(postsApi.updatePost).toHaveBeenCalled());
    const [, payload] = vi.mocked(postsApi.updatePost).mock.calls[0];
    expect(payload.expected_updated_at).toBe(draftPost.updated_at);
    expect(payload.published_at).toBeTypeOf('string');
    // Round-trips through Date -> same wall-clock minute in the local tz.
    expect(new Date(payload.published_at as string).toISOString()).toBe(
      new Date('2026-08-21T14:30').toISOString(),
    );
  });

  it('sends published_at: null when the field is cleared on a published post', async () => {
    vi.mocked(postsApi.getPost).mockResolvedValue(publishedPost);
    renderAt('p2');
    const input = (await screen.findByTestId('published-at-input')) as HTMLInputElement;
    // Force the metadata state to "dirty" so Save is enabled: clear the field.
    fireEvent.change(input, { target: { value: '' } });

    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => expect(postsApi.updatePost).toHaveBeenCalled());
    const [, payload] = vi.mocked(postsApi.updatePost).mock.calls[0];
    expect(payload.published_at).toBeNull();
  });
});
