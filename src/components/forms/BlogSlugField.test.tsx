import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FieldRenderer from './FieldRenderer';
import { SECTION_TYPES } from '../../lib/sectionRegistry';
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

// The exact descriptor the blog section ships (Blogs v1.13) — renders through FieldRenderer.
const blogField = SECTION_TYPES.blog.fields.find((f) => f.key === 'blog')!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(blogsApi.getBlogs).mockResolvedValue([notes]);
});

describe('FieldRenderer — blogSlug field (Blogs v1.13)', () => {
  it('renders the blog section field as a select of blog slugs', async () => {
    render(<FieldRenderer field={blogField} value="" onChange={vi.fn()} />);
    await waitFor(() => expect(blogsApi.getBlogs).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('combobox', { name: /blog/i }));
    expect(await screen.findByRole('option', { name: /all blogs/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Notes \(notes\)/ })).toBeInTheDocument();
  });

  it('writes the chosen slug via onChange', async () => {
    const onChange = vi.fn();
    render(<FieldRenderer field={blogField} value="" onChange={onChange} />);
    await waitFor(() => expect(blogsApi.getBlogs).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('combobox', { name: /blog/i }));
    await userEvent.click(await screen.findByRole('option', { name: /Notes \(notes\)/ }));

    expect(onChange).toHaveBeenCalledWith('blog', 'notes');
  });

  it('flags a since-deleted slug that would block publish', async () => {
    render(<FieldRenderer field={blogField} value="gone" onChange={vi.fn()} />);
    await waitFor(() => expect(blogsApi.getBlogs).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('combobox', { name: /blog/i }));
    expect(
      await screen.findByRole('option', { name: /no longer exists \(blocks publish\)/i }),
    ).toBeInTheDocument();
  });
});
