/**
 * Item CRUD inside a section editor (§3.4, §4.2) for the item-bearing types (timeline,
 * skills, portfolio). Lists the section's items with drag-and-drop reorder, and add /
 * edit / delete. Reorder sends the full ordered id array (§4.2); edits carry
 * `expected_updated_at` and route 409s up to the shared conflict dialog (§4.5).
 */
import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import type { AdminSection, AdminSectionItem, ItemData } from '../../types/admin';
import type { SectionTypeDef } from '../../lib/sectionRegistry';
import {
  ConflictError,
  createItem,
  deleteItem,
  reorderItems,
  updateItem,
} from '../../api/sectionsApi';
import { serverMessage } from '../../api/serverMessage';
import SortableList, { type DragHandleProps } from '../dnd/SortableList';
import ItemEditDialog from './ItemEditDialog';
import ConfirmDialog from '../ConfirmDialog';

interface ItemsEditorProps {
  section: AdminSection;
  def: SectionTypeDef;
  /** Refetch the working set after any mutation. */
  onChanged: () => Promise<void> | void;
  /** Raise the shared 409 dialog (§4.5). */
  onConflict: () => void;
  onError: (message: string) => void;
}

function itemSummary(item: AdminSectionItem): string {
  const data = item.data as Record<string, unknown>;
  return (
    (data.title as string) ||
    (data.date_range as string) ||
    (data.description as string) ||
    'Untitled item'
  );
}

type EditTarget = { mode: 'create' } | { mode: 'edit'; item: AdminSectionItem };

export default function ItemsEditor({
  section,
  def,
  onChanged,
  onConflict,
  onError,
}: ItemsEditorProps) {
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [deleting, setDeleting] = useState<AdminSectionItem | null>(null);
  const [saving, setSaving] = useState(false);
  const fields = def.itemFields ?? [];

  const handleReorder = async (orderedIds: string[]) => {
    try {
      await reorderItems(section.id, orderedIds);
      await onChanged();
    } catch (err) {
      onError(serverMessage(err, 'Could not reorder items.'));
    }
  };

  // Drop any keys that are not declared in the current registry itemFields — an item
  // loaded before a field was removed (e.g. timeline's `media_id` in task #82) would
  // otherwise round-trip a stale key back to the API's now-strict schema and 400.
  const stripUnknownKeys = (data: ItemData): ItemData => {
    const allowed = new Set(fields.map((f) => f.key));
    const next: ItemData = {};
    for (const [key, value] of Object.entries(data)) {
      if (allowed.has(key)) next[key] = value;
    }
    return next;
  };

  const handleSave = async (data: ItemData) => {
    setSaving(true);
    const clean = stripUnknownKeys(data);
    try {
      if (editing?.mode === 'create') {
        await createItem(section.id, clean);
      } else if (editing?.mode === 'edit') {
        await updateItem(editing.item.id, {
          data: clean,
          expected_updated_at: editing.item.updated_at,
        });
      }
      setEditing(null);
      await onChanged();
    } catch (err) {
      setEditing(null);
      if (err instanceof ConflictError) {
        onConflict();
      } else {
        onError(serverMessage(err, 'Could not save the item.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteItem(deleting.id);
      setDeleting(null);
      await onChanged();
    } catch (err) {
      setDeleting(null);
      onError(serverMessage(err, 'Could not delete the item.'));
    }
  };

  return (
    <Box sx={{ mt: 1 }}>
      <Stack direction="row" sx={{ mb: 1, alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2" color="text.secondary">
          {section.items.length} {def.itemNoun ?? 'item'}
          {section.items.length === 1 ? '' : 's'}
        </Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setEditing({ mode: 'create' })}>
          Add {def.itemNoun ?? 'item'}
        </Button>
      </Stack>

      <SortableList
        items={section.items}
        onReorder={handleReorder}
        renderItem={(item: AdminSectionItem, handle: DragHandleProps) => (
          <Paper variant="outlined" sx={{ p: 1, mb: 1 }} data-testid="item-row">
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <IconButton
                size="small"
                aria-label="Drag to reorder item"
                sx={{ cursor: 'grab' }}
                {...handle.attributes}
                {...handle.listeners}
              >
                <DragIndicatorIcon fontSize="small" />
              </IconButton>
              <Typography sx={{ flexGrow: 1 }} noWrap>
                {itemSummary(item)}
              </Typography>
              {item.is_hidden && <Chip size="small" label="Hidden" />}
              <Tooltip title="Edit item">
                <IconButton
                  size="small"
                  aria-label={`Edit ${itemSummary(item)}`}
                  onClick={() => setEditing({ mode: 'edit', item })}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete item">
                <IconButton
                  size="small"
                  aria-label={`Delete ${itemSummary(item)}`}
                  onClick={() => setDeleting(item)}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Paper>
        )}
      />

      {editing && (
        <ItemEditDialog
          key={editing.mode === 'edit' ? editing.item.id : 'create'}
          open
          title={
            editing.mode === 'create'
              ? `Add ${def.itemNoun ?? 'item'}`
              : `Edit ${def.itemNoun ?? 'item'}`
          }
          fields={fields}
          initialData={
            editing.mode === 'edit'
              ? { ...(def.defaultItemData ?? {}), ...editing.item.data }
              : { ...(def.defaultItemData ?? {}) }
          }
          saving={saving}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete item?"
        message="This permanently removes the item from the working set."
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </Box>
  );
}
