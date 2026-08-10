import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BlogsPage from './BlogsPage';
import { ConflictError } from '../api/blogsApi';
import * as api from '../api/blogsApi';
import type { Blog } from '../types/admin';

// Mock the API module but keep the real ConflictError class (the page checks
// `err instanceof ConflictError`).
vi.mock('../api/blogsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/blogsApi')>();
  return {
    ...actual,
    getBlogs: vi.fn(),
    createBlog: vi.fn(),
    updateBlog: vi.fn(),
    deleteBlog: vi.fn(),
  };
});

const notes: Blog = {
  id: 'b1',
  slug: 'notes',
  name: 'Notes',
  post_count: 3,
  updated_at: '2026-01-01T00:00:00Z',
};

const devlog: Blog = {
  id: 'b2',
  slug: 'devlog',
  name: 'Devlog',
  post_count: 0,
  updated_at: '2026-02-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getBlogs).mockResolvedValue([notes, devlog]);
});

describe('BlogsPage (Blogs v1.13)', () => {
  it('renders blogs with name, slug, and post count', async () => {
    render(<BlogsPage />);
    const rows = await screen.findAllByTestId('blog-row');
    expect(rows).toHaveLength(2);

    // Sorted by name asc: Devlog then Notes.
    expect(within(rows[0]).getByText('Devlog')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Notes')).toBeInTheDocument();
    expect(within(rows[1]).getByText('/notes')).toBeInTheDocument();
    expect(within(rows[1]).getByText('3 posts')).toBeInTheDocument();
    expect(within(rows[0]).getByText('0 posts')).toBeInTheDocument();
  });

  it('create flow posts the entered name + slug', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createBlog).mockResolvedValue({ ...notes, id: 'b9', slug: 'ideas', name: 'Ideas' });

    render(<BlogsPage />);
    await screen.findAllByTestId('blog-row');

    await user.click(screen.getByRole('button', { name: /new blog/i }));

    const dialog = await screen.findByRole('dialog');
    // Typing the name auto-seeds the slug via slugify.
    await user.type(within(dialog).getByLabelText('Name'), 'Ideas');
    await user.click(within(dialog).getByRole('button', { name: /create blog/i }));

    await waitFor(() =>
      expect(api.createBlog).toHaveBeenCalledWith({ slug: 'ideas', name: 'Ideas' }),
    );
    // Refreshes the list after creating.
    await waitFor(() => expect(api.getBlogs).toHaveBeenCalledTimes(2));
  });

  it('edit sends expected_updated_at and surfaces the 409 refetch flow (§4.5)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateBlog).mockRejectedValueOnce(new ConflictError());

    render(<BlogsPage />);
    const rows = await screen.findAllByTestId('blog-row');

    // Row 1 is Notes (sorted). Edit it.
    await user.click(within(rows[1]).getByRole('button', { name: /edit notes/i }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(api.updateBlog).toHaveBeenCalledWith('b1', {
        slug: 'notes',
        name: 'Notes',
        expected_updated_at: '2026-01-01T00:00:00Z',
      }),
    );

    expect(await screen.findByText(/changed since you loaded it/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /refetch latest/i }));
    await waitFor(() =>
      expect(screen.queryByText(/changed since you loaded it/i)).not.toBeInTheDocument(),
    );
  });

  it('delete warns that N posts become unassigned (never deleted)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.deleteBlog).mockResolvedValue();

    render(<BlogsPage />);
    const rows = await screen.findAllByTestId('blog-row');

    // Notes has 3 posts.
    await user.click(within(rows[1]).getByRole('button', { name: /delete notes/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/unassigns 3 posts/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/No posts are deleted/i)).toBeInTheDocument();

    // Nothing fired yet — the warning is a hard gate.
    expect(api.deleteBlog).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /delete blog/i }));
    await waitFor(() => expect(api.deleteBlog).toHaveBeenCalledWith('b1'));
  });

  it('delete warning for an empty blog notes no posts are affected', async () => {
    const user = userEvent.setup();
    render(<BlogsPage />);
    const rows = await screen.findAllByTestId('blog-row');

    // Devlog (row 0) has 0 posts.
    await user.click(within(rows[0]).getByRole('button', { name: /delete devlog/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/no posts assigned/i)).toBeInTheDocument();
  });
});
