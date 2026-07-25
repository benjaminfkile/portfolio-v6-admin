/**
 * The block editor — the largest admin component (§8.3). Holds the post's `Block[]` in
 * memory (controlled by the parent editor page, which saves it wholesale, §4.2) and drives
 * every array operation as a plain transformation: the add-block menu appends (all 8 types,
 * §3.7), drag-and-drop reorders (§14.4), delete removes, and each per-type editor replaces
 * its block in place. All ordering/mutation goes through the pure helpers in `lib/blocks.ts`
 * so the logic is unit-tested without simulating drags.
 */
import {
  Alert,
  Box,
  Stack,
  Typography,
} from '@mui/material';
import type { Block, BlockType } from '../../types/content';
import { addBlock, removeBlockAt, reorderBlocksByIds, updateBlockAt } from '../../lib/blocks';
import SortableList, { type DragHandleProps } from '../dnd/SortableList';
import AddBlockMenu from './AddBlockMenu';
import BlockCard from './blocks/BlockCard';

interface BlockEditorProps {
  value: Block[];
  onChange: (blocks: Block[]) => void;
}

// dnd-kit needs a stable id per row. Blocks have no id of their own (§3.7 — like Links they
// are never addressed independently), so we key on array index, stable for one edit session.
interface BlockRow {
  id: string;
  block: Block;
  index: number;
}

export default function BlockEditor({ value, onChange }: BlockEditorProps) {
  const blocks = Array.isArray(value) ? value : [];
  const rows: BlockRow[] = blocks.map((block, index) => ({ id: String(index), block, index }));

  const handleAdd = (type: BlockType) => onChange(addBlock(blocks, type));
  const handleDelete = (index: number) => onChange(removeBlockAt(blocks, index));
  const handleBlockChange = (index: number, block: Block) =>
    onChange(updateBlockAt(blocks, index, block));
  const handleReorder = (orderedIds: string[]) => onChange(reorderBlocksByIds(blocks, orderedIds));

  return (
    <Box>
      <Stack
        direction="row"
        sx={{ mb: 2, alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="h6" component="h2">
          Body
        </Typography>
        <AddBlockMenu onAdd={handleAdd} />
      </Stack>

      {blocks.length === 0 ? (
        <Alert severity="info">No blocks yet. Use “Add block” to start writing.</Alert>
      ) : (
        <SortableList
          items={rows}
          onReorder={handleReorder}
          renderItem={(row: BlockRow, handle: DragHandleProps) => (
            <BlockCard
              block={row.block}
              index={row.index}
              handle={handle}
              onChange={(block) => handleBlockChange(row.index, block)}
              onDelete={() => handleDelete(row.index)}
            />
          )}
        />
      )}
    </Box>
  );
}
