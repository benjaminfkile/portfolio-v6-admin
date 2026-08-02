/**
 * One section card in the working-set list (§4.2). Shows the section type, hidden state,
 * and item count, with a drag handle for reorder (§14.4) and edit / hide-show / delete
 * actions. For the item-bearing types (timeline, skills, portfolio) it expands into the
 * {@link ItemsEditor} for per-item CRUD.
 */
import { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  IconButton,
  ListSubheader,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import DriveFileMoveOutlinedIcon from '@mui/icons-material/DriveFileMoveOutlined';
import type { AdminSection, Page } from '../../types/admin';
import { getSectionTypeDef } from '../../lib/sectionRegistry';
import type { DragHandleProps } from '../dnd/SortableList';
import ItemsEditor from './ItemsEditor';

interface SectionCardProps {
  section: AdminSection;
  handle: DragHandleProps;
  /** All site pages, used to build the "Move to page…" menu (§3.10). */
  pages: Page[];
  onEdit: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
  /** Move this section to another page (PATCH page_id, §3.10). */
  onMove: (pageId: string) => void;
  onChanged: () => Promise<void> | void;
  onConflict: () => void;
  onError: (message: string) => void;
}

export default function SectionCard({
  section,
  handle,
  pages,
  onEdit,
  onToggleHidden,
  onDelete,
  onMove,
  onChanged,
  onConflict,
  onError,
}: SectionCardProps) {
  const def = getSectionTypeDef(section.type);
  const [moveAnchor, setMoveAnchor] = useState<HTMLElement | null>(null);
  const moveTargets = pages.filter((p) => p.id !== section.page_id);

  const header = (
    <Stack direction="row" spacing={1} sx={{ width: '100%', alignItems: 'center' }}>
      <IconButton
        size="small"
        aria-label={`Drag to reorder ${def.label}`}
        sx={{ cursor: 'grab' }}
        {...handle.attributes}
        {...handle.listeners}
        // Prevent the accordion from toggling when the user grabs the handle.
        onClick={(e) => e.stopPropagation()}
      >
        <DragIndicatorIcon />
      </IconButton>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {def.label}
      </Typography>
      {section.is_hidden && <Chip size="small" color="default" label="Hidden" />}
      {def.hasItems && (
        <Chip
          size="small"
          variant="outlined"
          label={`${section.items.length} ${def.itemNoun ?? 'item'}${
            section.items.length === 1 ? '' : 's'
          }`}
        />
      )}
      <Box sx={{ flexGrow: 1 }} />
      <Tooltip title="Edit section">
        <IconButton
          size="small"
          aria-label={`Edit ${def.label}`}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <EditIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={section.is_hidden ? 'Show section' : 'Hide section'}>
        <IconButton
          size="small"
          aria-label={section.is_hidden ? `Show ${def.label}` : `Hide ${def.label}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleHidden();
          }}
        >
          {section.is_hidden ? (
            <VisibilityOffIcon fontSize="small" />
          ) : (
            <VisibilityIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
      <Tooltip title="Move to page…">
        <IconButton
          size="small"
          aria-label={`Move ${def.label} to another page`}
          aria-haspopup="menu"
          onClick={(e) => {
            e.stopPropagation();
            setMoveAnchor(e.currentTarget);
          }}
        >
          <DriveFileMoveOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={moveAnchor}
        open={Boolean(moveAnchor)}
        onClose={() => setMoveAnchor(null)}
        // The menu lives inside the drag handle / accordion header; keep clicks local.
        onClick={(e) => e.stopPropagation()}
        slotProps={{ list: { 'aria-label': 'Move to page', dense: true } }}
      >
        <ListSubheader disableSticky>Move to page…</ListSubheader>
        {moveTargets.length === 0 ? (
          <MenuItem disabled>No other pages</MenuItem>
        ) : (
          moveTargets.map((p) => (
            <MenuItem
              key={p.id}
              onClick={() => {
                setMoveAnchor(null);
                onMove(p.id);
              }}
            >
              {p.title}
            </MenuItem>
          ))
        )}
      </Menu>
      <Tooltip title="Delete section">
        <IconButton
          size="small"
          aria-label={`Delete ${def.label}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );

  if (!def.hasItems) {
    return (
      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }} data-testid="section-card">
        {header}
      </Paper>
    );
  }

  return (
    <Accordion
      variant="outlined"
      disableGutters
      sx={{ mb: 1.5 }}
      data-testid="section-card"
      slotProps={{ transition: { unmountOnExit: true } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>{header}</AccordionSummary>
      <AccordionDetails>
        <ItemsEditor
          section={section}
          def={def}
          onChanged={onChanged}
          onConflict={onConflict}
          onError={onError}
        />
      </AccordionDetails>
    </Accordion>
  );
}
