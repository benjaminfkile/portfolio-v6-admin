import type { ReactNode } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PagesPage from './PagesPage';
import { ConflictError } from '../api/pagesApi';
import * as api from '../api/pagesApi';
import type { Page } from '../types/admin';

// Mock the API module but keep the real ConflictError class (the page checks
// `err instanceof ConflictError`).
vi.mock('../api/pagesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/pagesApi')>();
  return {
    ...actual,
    getPages: vi.fn(),
    createPage: vi.fn(),
    updatePage: vi.fn(),
    deletePage: vi.fn(),
    reorderPages: vi.fn(),
  };
});

// dnd-kit's drag needs real layout, which jsdom lacks. Swap SortableList for a stub that
// renders the rows and exposes onReorder via a button, so the reorder wiring is testable.
vi.mock('../components/dnd/SortableList', () => ({
  default: ({
    items,
    onReorder,
    renderItem,
  }: {
    items: { id: string }[];
    onReorder: (ids: string[]) => void;
    renderItem: (item: { id: string }, handle: unknown) => ReactNode;
  }) => (
    <div>
      <button onClick={() => onReorder([...items].reverse().map((it) => it.id))}>
        stub-reorder-reverse
      </button>
      {items.map((item) => (
        <div key={item.id}>{renderItem(item, { attributes: {}, listeners: {} })}</div>
      ))}
    </div>
  ),
}));

const home: Page = {
  id: 'p1',
  slug: 'home',
  title: 'Ben Kile',
  nav_label: 'Home',
  nav_position: 0,
  is_hidden: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const projects: Page = {
  id: 'p2',
  slug: 'projects',
  title: 'Projects',
  nav_label: 'Projects',
  nav_position: 1,
  is_hidden: false,
  created_at: '2026-02-01T00:00:00Z',
  updated_at: '2026-02-02T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Deliberately out of nav order so the sort is exercised.
  vi.mocked(api.getPages).mockResolvedValue([projects, home]);
});

describe('PagesPage (§3.10, §4.2, §4.5)', () => {
  it('renders pages ordered by nav_position with the home badge', async () => {
    render(<PagesPage />);
    const rows = await screen.findAllByTestId('page-row');
    expect(rows).toHaveLength(2);

    // Sorted by nav_position asc: home (0) then projects (1).
    expect(within(rows[0]).getByText('Ben Kile')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Projects')).toBeInTheDocument();

    // The home page carries a badge and its delete is disabled client-side.
    expect(within(rows[0]).getByText('Home', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: /delete ben kile/i })).toBeDisabled();
    expect(within(rows[1]).getByRole('button', { name: /delete projects/i })).toBeEnabled();
  });

  it('create flow calls the api with the entered fields', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createPage).mockResolvedValue({ ...projects, id: 'p9', slug: 'about' });

    render(<PagesPage />);
    await screen.findAllByTestId('page-row');

    await user.click(screen.getByRole('button', { name: /new page/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Slug'), 'about');
    await user.type(within(dialog).getByLabelText('Title'), 'About');
    await user.type(within(dialog).getByLabelText('Nav label'), 'About');
    await user.click(within(dialog).getByRole('button', { name: /create page/i }));

    await waitFor(() =>
      expect(api.createPage).toHaveBeenCalledWith({
        slug: 'about',
        title: 'About',
        nav_label: 'About',
      }),
    );
    // Refreshes the list after creating.
    await waitFor(() => expect(api.getPages).toHaveBeenCalledTimes(2));
  });

  it('edit sends expected_updated_at and surfaces the 409 refetch flow (§4.5)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updatePage).mockRejectedValueOnce(new ConflictError());

    render(<PagesPage />);
    const rows = await screen.findAllByTestId('page-row');

    await user.click(within(rows[1]).getByRole('button', { name: /edit projects/i }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));

    // The PATCH carried the row's optimistic-concurrency precondition.
    await waitFor(() =>
      expect(api.updatePage).toHaveBeenCalledWith('p2', {
        slug: 'projects',
        title: 'Projects',
        nav_label: 'Projects',
        expected_updated_at: '2026-02-02T00:00:00Z',
      }),
    );

    // The conflict dialog appears rather than silently losing the change.
    expect(await screen.findByText(/changed since you loaded it/i)).toBeInTheDocument();

    // Refetch pulls fresh state and dismisses the dialog.
    await user.click(screen.getByRole('button', { name: /refetch latest/i }));
    await waitFor(() =>
      expect(screen.queryByText(/changed since you loaded it/i)).not.toBeInTheDocument(),
    );
    expect(api.getPages).toHaveBeenCalledTimes(2);
  });

  it('delete is gated behind an explicit cascade warning', async () => {
    const user = userEvent.setup();
    vi.mocked(api.deletePage).mockResolvedValue();

    render(<PagesPage />);
    const rows = await screen.findAllByTestId('page-row');

    await user.click(within(rows[1]).getByRole('button', { name: /delete projects/i }));

    const dialog = await screen.findByRole('dialog');
    // The warning must state the page's sections are deleted with it.
    expect(within(dialog).getByText(/permanently deletes ALL of its sections/i)).toBeInTheDocument();

    // Nothing fired yet — the warning is a hard gate.
    expect(api.deletePage).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /delete page & sections/i }));
    await waitFor(() => expect(api.deletePage).toHaveBeenCalledWith('p2'));
  });

  it('reorder persists the full ordered id array (§4.2)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.reorderPages).mockResolvedValue();

    render(<PagesPage />);
    await screen.findAllByTestId('page-row');

    await user.click(screen.getByRole('button', { name: /stub-reorder-reverse/i }));

    // Sorted order is [home, projects] → reversed is [projects, home].
    await waitFor(() => expect(api.reorderPages).toHaveBeenCalledWith(['p2', 'p1']));
  });
});
