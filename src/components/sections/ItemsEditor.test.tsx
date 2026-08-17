import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import ItemsEditor from './ItemsEditor';
import { getSectionTypeDef } from '../../lib/sectionRegistry';
import * as api from '../../api/sectionsApi';
import type { AdminSection, AdminSectionItem } from '../../types/admin';

vi.mock('../../api/sectionsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/sectionsApi')>();
  return {
    ...actual,
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    reorderItems: vi.fn(),
  };
});

// jsdom can't drive @dnd-kit pointer collisions; stub SortableList to render children
// straight through so the tests can target the edit/delete buttons directly.
vi.mock('../dnd/SortableList', () => ({
  default: ({
    items,
    renderItem,
  }: {
    items: AdminSectionItem[];
    renderItem: (
      item: AdminSectionItem,
      handle: { attributes: object; listeners: object },
    ) => ReactNode;
  }) => (
    <div>
      {items.map((item) => (
        <div key={item.id}>{renderItem(item, { attributes: {}, listeners: {} })}</div>
      ))}
    </div>
  ),
}));

function makeTimelineSection(item: AdminSectionItem): AdminSection {
  return {
    id: 'sec-1',
    page_id: 'p1',
    type: 'timeline',
    position: 0,
    is_hidden: false,
    data: {},
    items: [item],
    updated_at: '2026-01-01T00:00:00Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.updateItem).mockResolvedValue({
    id: 'it-1',
    position: 0,
    is_hidden: false,
    data: {},
    updated_at: '2026-01-02T00:00:00Z',
  });
  vi.mocked(api.createItem).mockResolvedValue({
    id: 'it-2',
    position: 1,
    is_hidden: false,
    data: {},
    updated_at: '2026-01-02T00:00:00Z',
  });
});

describe('ItemsEditor — timeline strips media_id on save (task #82)', () => {
  it('drops a stale media_id key when editing a timeline entry loaded before the field was removed', async () => {
    const user = userEvent.setup();
    // Simulate an item loaded before the API migration: its `data` still carries `media_id`.
    const legacyEntry: AdminSectionItem = {
      id: 'it-1',
      position: 0,
      is_hidden: false,
      data: {
        date_range: '2024',
        title: 'Old role',
        description: 'What I did.',
        media_id: 'media-abc',
      },
      updated_at: '2026-01-01T00:00:00Z',
    };
    const section = makeTimelineSection(legacyEntry);
    const def = getSectionTypeDef('timeline');

    render(
      <ItemsEditor
        section={section}
        def={def}
        onChanged={vi.fn()}
        onConflict={vi.fn()}
        onError={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit old role/i }));
    // The dialog opens with the entry pre-populated; hit Save without changes.
    await user.click(await screen.findByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(api.updateItem).toHaveBeenCalledTimes(1));
    const [, payload] = vi.mocked(api.updateItem).mock.calls[0];
    // The stale media_id must NOT reach the API — the tightened schema would reject it.
    expect(payload.data).toBeDefined();
    expect(payload.data as Record<string, unknown>).not.toHaveProperty('media_id');
    // The remaining fields survive intact.
    expect(payload.data).toMatchObject({
      date_range: '2024',
      title: 'Old role',
      description: 'What I did.',
    });
    // The concurrency token still rides along.
    expect(payload.expected_updated_at).toBe('2026-01-01T00:00:00Z');
  });
});
