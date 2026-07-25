/**
 * One section card in the working-set list (§4.2). Shows the section type, hidden state,
 * and item count, with a drag handle for reorder (§14.4) and edit / hide-show / delete
 * actions. For the item-bearing types (timeline, skills, portfolio) it expands into the
 * {@link ItemsEditor} for per-item CRUD.
 */
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  IconButton,
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
import type { AdminSection } from '../../types/admin';
import { getSectionTypeDef } from '../../lib/sectionRegistry';
import type { DragHandleProps } from '../dnd/SortableList';
import ItemsEditor from './ItemsEditor';

interface SectionCardProps {
  section: AdminSection;
  handle: DragHandleProps;
  onEdit: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
  onChanged: () => Promise<void> | void;
  onConflict: () => void;
  onError: (message: string) => void;
}

export default function SectionCard({
  section,
  handle,
  onEdit,
  onToggleHidden,
  onDelete,
  onChanged,
  onConflict,
  onError,
}: SectionCardProps) {
  const def = getSectionTypeDef(section.type);

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
