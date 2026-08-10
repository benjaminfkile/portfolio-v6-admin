import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PostMetadataEditor, { type PostMetadataValue } from './PostMetadataEditor';
import * as blogsApi from '../../api/blogsApi';
import type { Blog } from '../../types/admin';

vi.mock('../../api/blogsApi');

const notes: Blog = {
  id: 'b1',
  slug: 'notes',
  name: 'Notes',
  post_count: 2,
  updated_at: '2026-01-01T00:00:00Z',
};

const value: PostMetadataValue = {
  title: 'Hello world',
  slug: 'hello-world',
  excerpt: '',
  tags: ['react'],
  cover_media_id: null,
  blog_id: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(blogsApi.getBlogs).mockResolvedValue([notes]);
});

function slugInput(): HTMLInputElement {
  // The slug TextField's <input>, found via its accessible label.
  return screen.getByRole('textbox', { name: /slug/i }) as HTMLInputElement;
}

describe('PostMetadataEditor — slug lock after first publish (§3.6)', () => {
  it('slug is editable before first publish', () => {
    render(<PostMetadataEditor value={value} onChange={vi.fn()} slugLocked={false} />);
    expect(slugInput()).not.toBeDisabled();
    expect(screen.getByText(/editable until the post is first published/i)).toBeInTheDocument();
  });

  it('slug is disabled and explains the lock once published', () => {
    render(<PostMetadataEditor value={value} onChange={vi.fn()} slugLocked />);
    expect(slugInput()).toBeDisabled();
    expect(screen.getByText(/locked after first publish/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/slug locked/i)).toBeInTheDocument();
  });
});

describe('PostMetadataEditor — fields', () => {
  it('renders title, excerpt, tags, and a cover picker', () => {
    render(<PostMetadataEditor value={value} onChange={vi.fn()} slugLocked={false} />);
    expect(screen.getByRole('textbox', { name: /title/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /excerpt/i })).toBeInTheDocument();
    // Existing tag renders as a chip.
    expect(screen.getByText('react')).toBeInTheDocument();
    // Cover media reuses MediaIdField → a "Choose…" button.
    expect(screen.getByRole('button', { name: /choose/i })).toBeInTheDocument();
  });
});

describe('PostMetadataEditor — blog select (Blogs v1.13)', () => {
  it('populates the select from GET /api/admin/blogs with a "No blog" option', async () => {
    render(<PostMetadataEditor value={value} onChange={vi.fn()} slugLocked={false} />);
    await waitFor(() => expect(blogsApi.getBlogs).toHaveBeenCalled());
    const select = screen.getByRole('combobox', { name: /blog/i });
    await userEvent.click(select);
    // The unassign option plus the fetched blog are both offered.
    expect(await screen.findByRole('option', { name: /no blog/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Notes' })).toBeInTheDocument();
  });

  it('writes the chosen blog id via onChange', async () => {
    const onChange = vi.fn();
    render(<PostMetadataEditor value={value} onChange={onChange} slugLocked={false} />);
    await waitFor(() => expect(blogsApi.getBlogs).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('combobox', { name: /blog/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Notes' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ blog_id: 'b1' }));
  });

  it('mapping "No blog" back to null unassigns the post', async () => {
    const onChange = vi.fn();
    render(
      <PostMetadataEditor
        value={{ ...value, blog_id: 'b1' }}
        onChange={onChange}
        slugLocked={false}
      />,
    );
    await waitFor(() => expect(blogsApi.getBlogs).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('combobox', { name: /blog/i }));
    await userEvent.click(await screen.findByRole('option', { name: /no blog/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ blog_id: null }));
  });
});
