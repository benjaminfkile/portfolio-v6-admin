import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError } from 'axios';
import type { ReactNode } from 'react';
import SectionsPage from './SectionsPage';
import { ConflictError } from '../api/sectionsApi';
import * as api from '../api/sectionsApi';
import * as pagesApi from '../api/pagesApi';
import type { AdminSection, Page } from '../types/admin';

/** A rejected write carrying the §4.3 error envelope, as axios surfaces it. */
function envelopeError(status: number, errorMsg: string): AxiosError {
  const err = new AxiosError('Request failed with status code ' + status);
  err.response = {
    status,
    statusText: '',
    headers: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: {} as any,
    data: { error: true, errorMsg },
  };
  return err;
}

// Mock the API module but keep the real ConflictError class (the page checks
// `err instanceof ConflictError`).
vi.mock('../api/sectionsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/sectionsApi')>();
  return {
    ...actual,
    getSections: vi.fn(),
    updateSection: vi.fn(),
    reorderSections: vi.fn(),
    deleteSection: vi.fn(),
    createSection: vi.fn(),
  };
});

// The Pages list feeds the page selector; mock it so the working set is page-scoped.
vi.mock('../api/pagesApi', () => ({
  getPages: vi.fn(),
}));

// Drag reorder can't be simulated in jsdom (no layout for collision detection), so stand in a
// list that renders the same cards and exposes a button to fire onReorder deterministically.
vi.mock('../components/dnd/SortableList', () => ({
  default: ({
    items,
    onReorder,
    renderItem,
  }: {
    items: AdminSection[];
    onReorder: (ids: string[]) => void;
    renderItem: (
      item: AdminSection,
      handle: { attributes: object; listeners: object },
    ) => ReactNode;
  }) => (
    <div>
      <button type="button" onClick={() => onReorder([...items].reverse().map((i) => i.id))}>
        trigger reorder
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

const about: Page = {
  id: 'p2',
  slug: 'about',
  title: 'About',
  nav_label: 'About',
  nav_position: 1,
  is_hidden: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const hero: AdminSection = {
  id: 's1',
  page_id: 'p1',
  type: 'hero',
  position: 0,
  is_hidden: false,
  data: { title: 'Hello' },
  items: [],
  updated_at: '2026-01-01T00:00:00Z',
};

function renderPage(initialPath = '/sections') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SectionsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pagesApi.getPages).mockResolvedValue([home, about]);
  vi.mocked(api.getSections).mockResolvedValue([hero]);
  vi.mocked(api.createSection).mockResolvedValue(hero);
  vi.mocked(api.updateSection).mockResolvedValue(hero);
  vi.mocked(api.reorderSections).mockResolvedValue();
});

describe('SectionsPage', () => {
  it('loads and renders the working set as section cards', async () => {
    renderPage();
    expect(await screen.findByTestId('section-card')).toBeInTheDocument();
    expect(screen.getByText('Hero')).toBeInTheDocument();
    expect(api.getSections).toHaveBeenCalledTimes(1);
  });

  it('renders a tab per page and scopes the initial listing to the home page (§3.10)', async () => {
    renderPage();
    await screen.findByTestId('section-card');

    // The selector shows every page…
    expect(screen.getByRole('tab', { name: 'Ben Kile' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'About' })).toBeInTheDocument();
    // …and, with no ?page= param, defaults to home and lists that page's sections.
    expect(api.getSections).toHaveBeenCalledWith('p1');
  });

  it('honours the ?page= slug so a refresh keeps the page context', async () => {
    renderPage('/sections?page=about');
    await screen.findByTestId('section-card');
    expect(api.getSections).toHaveBeenCalledWith('p2');
  });

  it('creates a section on the selected page, passing its page_id (§3.10)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('section-card');

    await user.click(screen.getByRole('button', { name: 'Add section' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Add section' }));

    await waitFor(() =>
      expect(api.createSection).toHaveBeenCalledWith('hero', expect.any(Object), 'p1'),
    );
  });

  it('reorders within the selected page, passing its page_id (§3.10)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('section-card');

    await user.click(screen.getByRole('button', { name: /trigger reorder/i }));

    await waitFor(() => expect(api.reorderSections).toHaveBeenCalledWith('p1', ['s1']));
  });

  it('moves a section to another page via PATCH page_id and drops it from the list (§3.10)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('section-card');

    await user.click(screen.getByRole('button', { name: /move hero to another page/i }));
    // The menu lists the other pages; pick About.
    await user.click(await screen.findByRole('menuitem', { name: 'About' }));

    await waitFor(() =>
      expect(api.updateSection).toHaveBeenCalledWith('s1', {
        page_id: 'p2',
        expected_updated_at: '2026-01-01T00:00:00Z',
      }),
    );
    expect(await screen.findByText(/moved to "about"/i)).toBeInTheDocument();
  });

  it('surfaces the 409 refetch dialog when a save conflicts, and refetches on confirm (§4.5)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateSection).mockRejectedValueOnce(new ConflictError());

    renderPage();
    await screen.findByTestId('section-card');

    // Toggling visibility is a PATCH carrying expected_updated_at — force a conflict.
    await user.click(screen.getByRole('button', { name: /hide hero/i }));

    // The conflict dialog appears rather than silently losing the change.
    expect(await screen.findByText(/changed since you loaded it/i)).toBeInTheDocument();
    expect(api.updateSection).toHaveBeenCalledWith('s1', {
      is_hidden: true,
      expected_updated_at: '2026-01-01T00:00:00Z',
    });

    // Refetch pulls fresh state and dismisses the dialog.
    await user.click(screen.getByRole('button', { name: /refetch latest/i }));
    await waitFor(() =>
      expect(screen.queryByText(/changed since you loaded it/i)).not.toBeInTheDocument(),
    );
    expect(api.getSections).toHaveBeenCalledTimes(2);
  });

  it("surfaces the server's errorMsg in the failure toast when a save is rejected with an envelope", async () => {
    const user = userEvent.setup();
    // A 400 with a specific reason (e.g. a zod validation detail) — exactly what used to be
    // dropped in favour of the generic "Could not save the section." string.
    vi.mocked(api.updateSection).mockRejectedValueOnce(
      envelopeError(400, 'Invalid data: sphere_detail must be between 1 and 100.'),
    );

    renderPage();
    await screen.findByTestId('section-card');

    await user.click(screen.getByRole('button', { name: /edit hero/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));

    // The server's reason reaches the toast verbatim, not the generic fallback.
    expect(
      await screen.findByText(/invalid data: sphere_detail must be between 1 and 100\./i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Could not save the section.')).not.toBeInTheDocument();
  });

  it('falls back to the generic toast when the save fails with no envelope (network error)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateSection).mockRejectedValueOnce(new Error('Network Error'));

    renderPage();
    await screen.findByTestId('section-card');

    await user.click(screen.getByRole('button', { name: /edit hero/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText('Could not save the section.')).toBeInTheDocument();
  });

});
