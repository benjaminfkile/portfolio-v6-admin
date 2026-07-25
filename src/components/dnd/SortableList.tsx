/**
 * Generic vertical drag-and-drop list built on dnd-kit (§14.4 — reorder is drag-and-drop,
 * no up/down-button interim). One maintained library, pinned. Used for both the section
 * list and the item list inside a section, plus the Link editor rows.
 *
 * On drop it computes the full reordered id array via the pure {@link reorderIds} helper
 * and hands it to `onReorder`, which is exactly the shape the `PUT .../order` routes want
 * (§4.2). The consumer's `renderItem` receives a `handle` to spread onto whatever element
 * should act as the drag grip, so the grip is explicit rather than the whole row.
 */
import { type ReactNode } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Box } from '@mui/material';
import { reorderIds } from '../../lib/reorder';

// Derive the handle prop types from useSortable's own return so we never deep-import
// dnd-kit internals (their paths shift between minor versions).
type SortableReturn = ReturnType<typeof useSortable>;
export interface DragHandleProps {
  attributes: SortableReturn['attributes'];
  listeners: SortableReturn['listeners'];
}

interface SortableListProps<T extends { id: string }> {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
  renderItem: (item: T, handle: DragHandleProps) => ReactNode;
  disabled?: boolean;
}

function SortableRow<T extends { id: string }>({
  item,
  renderItem,
  disabled,
}: {
  item: T;
  renderItem: (item: T, handle: DragHandleProps) => ReactNode;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Box ref={setNodeRef} style={style}>
      {renderItem(item, { attributes, listeners })}
    </Box>
  );
}

export default function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  disabled,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = items.map((it) => it.id);
    onReorder(reorderIds(ids, String(active.id), String(over.id)));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableRow key={item.id} item={item} renderItem={renderItem} disabled={disabled} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
