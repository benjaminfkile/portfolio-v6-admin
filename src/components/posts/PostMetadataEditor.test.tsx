import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PostMetadataEditor, {
  type PostMetadataValue,
  isoToDatetimeLocalInput,
  datetimeLocalInputToIso,
} from './PostMetadataEditor';
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
  published_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(blogsApi.getBlogs).mockResolvedValue([notes]);
});

function slugInput(): HTMLInputElement {
  // The slug TextField's <input>, found via its accessible label.
  return screen.getByRole('textbox', { name: /slug/i }) as HTMLInputElement;
}

describe('PostMetadataEditor, slug lock after first publish (§3.6)', () => {
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

describe('PostMetadataEditor, fields', () => {
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

describe('PostMetadataEditor, blog select (Blogs v1.13)', () => {
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

describe('PostMetadataEditor: Published on date + time control (task #134)', () => {
  function publishedAtInput(): HTMLInputElement {
    return screen.getByTestId('published-at-input') as HTMLInputElement;
  }

  it('renders the Published on control with the documented empty-state hint', () => {
    render(<PostMetadataEditor value={value} onChange={vi.fn()} slugLocked={false} />);
    expect(screen.getByLabelText(/published on/i)).toBeInTheDocument();
    expect(
      screen.getByText(/leave empty to use the publish time\. republishing keeps this date\./i),
    ).toBeInTheDocument();
  });

  it('renders empty when published_at is null', () => {
    render(<PostMetadataEditor value={value} onChange={vi.fn()} slugLocked={false} />);
    expect(publishedAtInput().value).toBe('');
  });

  it('prefills the input from published_at, rendered in the browser local timezone', () => {
    // 2026-08-21T14:30:00Z rendered as local time via isoToDatetimeLocalInput.
    const iso = '2026-08-21T14:30:00.000Z';
    const expected = isoToDatetimeLocalInput(iso);
    render(
      <PostMetadataEditor
        value={{ ...value, published_at: iso }}
        onChange={vi.fn()}
        slugLocked={false}
      />,
    );
    expect(publishedAtInput().value).toBe(expected);
  });

  it('is editable for a draft (never-published) post', () => {
    render(<PostMetadataEditor value={value} onChange={vi.fn()} slugLocked={false} />);
    expect(publishedAtInput()).not.toBeDisabled();
  });

  it('is editable for a published (slug-locked) post', () => {
    render(
      <PostMetadataEditor
        value={{ ...value, published_at: '2026-08-21T14:30:00.000Z' }}
        onChange={vi.fn()}
        slugLocked
      />,
    );
    expect(publishedAtInput()).not.toBeDisabled();
  });

  it('writes an ISO UTC string on edit', () => {
    const onChange = vi.fn();
    render(<PostMetadataEditor value={value} onChange={onChange} slugLocked={false} />);
    // fireEvent.change bypasses the finicky datetime-local keyboard emulation and
    // still routes through React's synthetic event system so the controlled onChange fires.
    fireEvent.change(publishedAtInput(), { target: { value: '2026-08-21T14:30' } });
    const iso = datetimeLocalInputToIso('2026-08-21T14:30');
    expect(iso).not.toBeNull();
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ published_at: iso }),
    );
  });

  it('clearing the field writes null (stamp at first publish)', () => {
    const onChange = vi.fn();
    render(
      <PostMetadataEditor
        value={{ ...value, published_at: '2026-08-21T14:30:00.000Z' }}
        onChange={onChange}
        slugLocked={false}
      />,
    );
    fireEvent.change(publishedAtInput(), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ published_at: null }),
    );
  });
});

describe('PostMetadataEditor: datetime helpers', () => {
  it('isoToDatetimeLocalInput returns empty for null / invalid', () => {
    expect(isoToDatetimeLocalInput(null)).toBe('');
    expect(isoToDatetimeLocalInput('not-a-date')).toBe('');
  });

  it('datetimeLocalInputToIso returns null for empty input', () => {
    expect(datetimeLocalInputToIso('')).toBeNull();
  });

  it('round-trips a datetime-local value through ISO and back', () => {
    const local = '2026-08-21T14:30';
    const iso = datetimeLocalInputToIso(local);
    expect(iso).not.toBeNull();
    // Round-trip preserves the same minute in the browser's local timezone.
    expect(isoToDatetimeLocalInput(iso)).toBe(local);
  });
});
