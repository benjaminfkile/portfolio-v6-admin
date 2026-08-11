import { useState } from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import apiClient from '../../api/apiClient';
import PostRefsField, { MAX_POST_REFS } from './PostRefsField';
import ItemEditDialog from '../sections/ItemEditDialog';
import { SECTION_TYPES } from '../../lib/sectionRegistry';
import { getIdToken } from '../../lib/cognitoClient';

vi.mock('../../lib/cognitoClient');
vi.mocked(getIdToken).mockResolvedValue('test-token');

const mock = new MockAdapter(apiClient);
const ok = <T,>(data: T) => ({ status: 'ok', error: false, data });

/** Build a fake admin Post; only the fields the catalog reads matter. */
const post = (
  id: string,
  title: string,
  opts: { blog?: { slug: string; name: string } | null; published?: boolean } = {},
) => ({
  id,
  slug: id,
  title,
  excerpt: '',
  cover_media_id: null,
  tags: [],
  blog_id: opts.blog ? 'b1' : null,
  blog: opts.blog ?? null,
  draft_body: [],
  published_body: null,
  published_at: opts.published ? '2026-01-01T00:00:00Z' : null,
  created_at: 't',
  updated_at: 't',
});

/** react = published under the "Engineering" blog; vue = draft; unassigned = published, no blog. */
const POSTS = [
  post('po-react', 'React internals', { blog: { slug: 'eng', name: 'Engineering' }, published: true }),
  post('po-vue', 'Vue draft notes', { blog: { slug: 'eng', name: 'Engineering' }, published: false }),
  post('po-solo', 'Standalone piece', { blog: null, published: true }),
];

beforeEach(() => {
  mock.onGet('/api/admin/posts').reply(200, ok({ posts: POSTS }));
});

afterEach(() => {
  mock.reset();
  vi.clearAllMocks();
  vi.mocked(getIdToken).mockResolvedValue('test-token');
});

/** Stateful wrapper so reorder/remove/add reflect in the controlled `value`. */
function Harness({ initial, onChange }: { initial: string[]; onChange: (v: string[]) => void }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <PostRefsField
      label="Related posts"
      value={value}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

describe('PostRefsField (Post Refs v1.14)', () => {
  it('resolves referenced ids to the post title, blog name, and published state', async () => {
    render(<Harness initial={['po-react']} onChange={vi.fn()} />);
    expect(await screen.findByText('React internals')).toBeInTheDocument();
    // The blog name appears (chip) and the published state is shown.
    expect(screen.getAllByText('Engineering').length).toBeGreaterThan(0);
  });

  it('Add post… lists only not-yet-referenced posts, searchable by title, and appends the id', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={['po-react']} onChange={onChange} />);

    await screen.findByText('React internals');
    await user.click(screen.getByRole('button', { name: /add post/i }));

    // Already-referenced React is absent from the menu; the others are present.
    expect(screen.queryByRole('button', { name: 'Add React internals' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Vue draft notes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Standalone piece' })).toBeInTheDocument();

    // Search narrows by title.
    await user.type(screen.getByLabelText(/search posts/i), 'vue');
    expect(screen.queryByRole('button', { name: 'Add Standalone piece' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add Vue draft notes' }));
    expect(onChange).toHaveBeenLastCalledWith(['po-react', 'po-vue']);
  });

  it('remove drops the ref', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={['po-react']} onChange={onChange} />);

    await user.click(await screen.findByRole('button', { name: 'Remove React internals' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('up/down controls reorder (selection order = render order)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={['po-react', 'po-solo']} onChange={onChange} />);

    await user.click(await screen.findByRole('button', { name: 'Move Standalone piece up' }));
    expect(onChange).toHaveBeenLastCalledWith(['po-solo', 'po-react']);
  });

  it('a ref to a deleted/unknown post renders a removable "missing — blocks publish" error chip', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={['po-ghost']} onChange={onChange} />);

    expect(await screen.findByText(/missing — blocks publish/i)).toBeInTheDocument();
    // Still removable so a broken ref can be fixed.
    await user.click(screen.getByRole('button', { name: /remove po-ghost/i }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('a ref to a draft post renders a "draft — hidden until published" warning chip', async () => {
    render(<Harness initial={['po-vue']} onChange={vi.fn()} />);
    expect(await screen.findByText(/draft — hidden until published/i)).toBeInTheDocument();
    expect(screen.getByText('Vue draft notes')).toBeInTheDocument();
  });

  it('enforces the max of 12 refs: the add control is disabled at the cap', async () => {
    const eleven = Array.from({ length: MAX_POST_REFS - 1 }, (_, i) => `po-x${i}`);
    const { unmount } = render(<Harness initial={eleven.concat('po-react')} onChange={vi.fn()} />);

    // 12 refs → cap reached → add disabled + notice shown.
    await screen.findByText('React internals');
    expect(screen.getByRole('button', { name: /add post/i })).toBeDisabled();
    expect(screen.getByText(/maximum of 12 posts reached/i)).toBeInTheDocument();
    unmount();

    // Below the cap the add control is enabled again.
    render(<Harness initial={['po-react']} onChange={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add post/i })).toBeEnabled(),
    );
  });

  it('portfolio item save payload includes the ordered post_refs', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const fields = SECTION_TYPES.portfolio.itemFields ?? [];
    render(
      <ItemEditDialog
        open
        title="Edit project"
        fields={fields}
        initialData={{
          title: 'T',
          intro: '',
          description: 'D',
          media_id: 'm1',
          skill_refs: [],
          post_refs: ['po-react', 'po-solo'],
          links: [],
        }}
        saving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    // Reorder so solo comes first, then save; the payload must carry the ordered ids.
    await user.click(await screen.findByRole('button', { name: 'Move Standalone piece up' }));
    const save = screen.getByRole('button', { name: /^save$/i });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].post_refs).toEqual(['po-solo', 'po-react']);
  });
});
