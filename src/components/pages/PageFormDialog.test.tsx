import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PageFormDialog, { RESERVED_SLUGS, slugHint } from './PageFormDialog';

describe('slugHint — client-side reserved-slug list (task #103)', () => {
  it('rejects an empty slug, formatting violations, and the still-reserved slugs', () => {
    expect(slugHint('')).toMatch(/required/i);
    expect(slugHint('Has Spaces')).toMatch(/lowercase/i);
    expect(slugHint('api')).toMatch(/reserved/i);
    expect(slugHint('admin')).toMatch(/reserved/i);
  });

  it('accepts "blog" now that it is no longer reserved', () => {
    // Task #103: the Blog is admin-composable as a page, so `blog` needs to be a usable slug.
    expect(slugHint('blog')).toBe('');
  });

  it('exposes exactly the still-reserved slugs — no legacy "blog" entry', () => {
    expect([...RESERVED_SLUGS]).toEqual(['api', 'admin']);
    expect((RESERVED_SLUGS as readonly string[]).includes('blog')).toBe(false);
  });
});

describe('PageFormDialog — create flow with the "blog" slug (AC #400)', () => {
  it('allows creating a page slugged "blog" — client validation no longer blocks it', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <PageFormDialog
        open
        page={null}
        saving={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Slug'), 'blog');
    await user.type(screen.getByLabelText('Title'), 'Blog');

    const submit = screen.getByRole('button', { name: /create page/i });
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({ slug: 'blog', title: 'Blog', nav_label: '' });
  });

  it('still blocks the "api" and "admin" slugs client-side', async () => {
    const user = userEvent.setup();
    render(
      <PageFormDialog
        open
        page={null}
        saving={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const slug = screen.getByLabelText('Slug');
    await user.type(slug, 'api');
    await user.type(screen.getByLabelText('Title'), 'Anything');

    // Submit stays disabled and the reserved reason is surfaced as helper text.
    expect(screen.getByRole('button', { name: /create page/i })).toBeDisabled();
    expect(screen.getByText(/"api" is reserved/i)).toBeInTheDocument();

    await user.clear(slug);
    await user.type(slug, 'admin');
    expect(screen.getByText(/"admin" is reserved/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create page/i })).toBeDisabled();
  });
});
