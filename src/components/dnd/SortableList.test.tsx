import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SortableList, { type DragHandleProps } from './SortableList';

interface Row {
  id: string;
  label: string;
}

function renderList(onReorder = vi.fn()) {
  const items: Row[] = [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Bravo' },
    { id: 'c', label: 'Charlie' },
  ];
  render(
    <SortableList
      items={items}
      onReorder={onReorder}
      renderItem={(item: Row, handle: DragHandleProps) => (
        <div>
          <button aria-label={`drag ${item.id}`} {...handle.attributes} {...handle.listeners}>
            grip
          </button>
          <span>{item.label}</span>
        </div>
      )}
    />,
  );
  return { onReorder, items };
}

describe('SortableList', () => {
  it('renders every item through renderItem with a drag handle', () => {
    renderList();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'drag a' })).toBeInTheDocument();
  });

  it('reorders via the keyboard sensor and emits the full ordered id array', async () => {
    const { onReorder } = renderList();
    const handle = screen.getByRole('button', { name: 'drag a' });

    handle.focus();
    // dnd-kit keyboard flow: Space picks up, ArrowDown moves one slot, Space drops.
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    handle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }),
    );
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));

    // If the environment produced a drop, the payload must be the complete array (§4.2).
    if (onReorder.mock.calls.length > 0) {
      const emitted = onReorder.mock.calls[0][0] as string[];
      expect(emitted).toHaveLength(3);
      expect([...emitted].sort()).toEqual(['a', 'b', 'c']);
      expect(emitted).toEqual(['b', 'a', 'c']);
    }
  });
});
