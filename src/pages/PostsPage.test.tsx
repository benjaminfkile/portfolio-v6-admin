import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PostsPage from './PostsPage';
import * as postsApi from '../api/postsApi';
import * as blogsApi from '../api/blogsApi';
import type { Post } from '../types/content';

vi.mock('../api/postsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/postsApi')>();
  return {
    ...actual,
    getPosts: vi.fn(),
    createPost: vi.fn(),
  };
});
vi.mock('../api/blogsApi');

const base: Omit<Post, 'id' | 'slug' | 'title' | 'published_at' | 'updated_at'> = {
  excerpt: '',
  cover_media_id: null,
  tags: [],
  blog_id: null,
  blog: null,
  draft_body: [],
  published_body: null,
  created_at: '2026-01-01T00:00:00Z',
};

const oldPublished: Post = {
  ...base,
  id: 'p1',
  slug: 'a',
  title: 'A',
  published_at: '2026-01-10T00:00:00.000Z',
  updated_at: '2026-01-10T00:00:00Z',
};

const newPublished: Post = {
  ...base,
  id: 'p2',
  slug: 'b',
  title: 'B',
  published_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-02-01T00:00:00Z',
};

const draftRecent: Post = {
  ...base,
  id: 'p3',
  slug: 'c',
  title: 'C',
  published_at: null,
  updated_at: '2026-09-01T00:00:00Z',
};

const draftOld: Post = {
  ...base,
  id: 'p4',
  slug: 'd',
  title: 'D',
  published_at: null,
  updated_at: '2026-03-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(blogsApi.getBlogs).mockResolvedValue([]);
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/posts']}>
      <Routes>
        <Route path="/posts" element={<PostsPage />} />
        <Route path="/posts/:id" element={<div>Editor</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PostsPage — published_at column and sort (task #134)', () => {
  it('sorts posts by published_at desc; drafts fall to the end by most-recently-updated', async () => {
    vi.mocked(postsApi.getPosts).mockResolvedValue([oldPublished, draftOld, newPublished, draftRecent]);
    renderPage();
    const rows = await screen.findAllByTestId('post-row');
    // Published posts first (newest published_at first), then drafts by updated_at desc.
    expect(within(rows[0]).getByText('B')).toBeInTheDocument();
    expect(within(rows[1]).getByText('A')).toBeInTheDocument();
    expect(within(rows[2]).getByText('C')).toBeInTheDocument();
    expect(within(rows[3]).getByText('D')).toBeInTheDocument();
  });

  it('shows the published_at date on published rows and "Draft" for null', async () => {
    vi.mocked(postsApi.getPosts).mockResolvedValue([newPublished, draftRecent]);
    renderPage();
    await waitFor(() => expect(postsApi.getPosts).toHaveBeenCalled());
    const cells = await screen.findAllByTestId('post-published-at');
    expect(cells).toHaveLength(2);
    // Published row shows a formatted date (contains the year at minimum).
    expect(cells[0].textContent).toMatch(/2026/);
    expect(cells[0].textContent).not.toBe('Draft');
    // Draft row shows the literal "Draft" label in the date column.
    expect(cells[1].textContent).toBe('Draft');
  });
});
