import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PostPreviewPage from './PostPreviewPage';
import * as previewApi from '../api/previewApi';
import * as postsApi from '../api/postsApi';
import type { Post } from '../types/content';

vi.mock('../api/previewApi', () => ({
  mintPreviewToken: vi.fn(),
}));
vi.mock('../api/postsApi', () => ({
  getPost: vi.fn(),
}));

const post: Post = {
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://public.example.com');
  vi.mocked(previewApi.mintPreviewToken).mockResolvedValue({ token: 'tok-post' });
  vi.mocked(postsApi.getPost).mockResolvedValue(post);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/posts/:id/preview" element={<PostPreviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PostPreviewPage (§7)', () => {
  it('iframes the post preview at /blog/<slug>?preview=<token>&postId=<id> verbatim', async () => {
    renderAt('/posts/p1/preview');

    const iframe = await screen.findByTestId('preview-iframe');
    expect(iframe).toHaveAttribute(
      'src',
      'https://public.example.com/blog/my-post?preview=tok-post&postId=p1',
    );
    // The slug comes from the loaded post, not the route id.
    expect(postsApi.getPost).toHaveBeenCalledWith('p1');
  });

  it('exposes the same URL through the open-in-new-tab action', async () => {
    renderAt('/posts/p1/preview');
    await screen.findByTestId('preview-iframe');

    const openLink = screen.getByRole('link', { name: /open preview in a new tab/i });
    expect(openLink).toHaveAttribute(
      'href',
      'https://public.example.com/blog/my-post?preview=tok-post&postId=p1',
    );
  });
});
