import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PostMetadataEditor, { type PostMetadataValue } from './PostMetadataEditor';

const value: PostMetadataValue = {
  title: 'Hello world',
  slug: 'hello-world',
  excerpt: '',
  tags: ['react'],
  cover_media_id: null,
};

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
