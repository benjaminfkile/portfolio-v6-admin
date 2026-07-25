/**
 * One block row in the block editor (§3.7, §8.3). Chrome only: a drag handle for reorder
 * (§14.4), the type label, a one-line summary, and a delete button — with the per-type
 * editor ({@link BlockBodyEditor}) rendered below. The drag grip is the explicit handle
 * spread from {@link SortableList}, not the whole row.
 */
import {
  Chip,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import type { Block } from '../../../types/content';
import { blockSummary } from '../../../lib/blocks';
import { getBlockTypeDef } from '../../../lib/blockRegistry';
import type { DragHandleProps } from '../../dnd/SortableList';
import BlockBodyEditor from './BlockBodyEditor';

interface BlockCardProps {
  block: Block;
  index: number;
  handle: DragHandleProps;
  onChange: (block: Block) => void;
  onDelete: () => void;
}

export default function BlockCard({ block, index, handle, onChange, onDelete }: BlockCardProps) {
  const def = getBlockTypeDef(block.type);

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }} data-testid="block-card">
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
        <IconButton
          size="small"
          aria-label={`Drag to reorder block ${index + 1}`}
          sx={{ cursor: 'grab' }}
          {...handle.attributes}
          {...handle.listeners}
        >
          <DragIndicatorIcon fontSize="small" />
        </IconButton>
        <Chip size="small" label={def.label} color="primary" variant="outlined" />
        <Typography variant="body2" color="text.secondary" noWrap sx={{ flexGrow: 1 }}>
          {blockSummary(block)}
        </Typography>
        <Tooltip title="Delete block">
          <IconButton
            size="small"
            aria-label={`Delete block ${index + 1}`}
            onClick={onDelete}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <BlockBodyEditor block={block} onChange={onChange} />
    </Paper>
  );
}
