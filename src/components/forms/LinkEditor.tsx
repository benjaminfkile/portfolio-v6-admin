/**
 * Reusable Link[] editor (§3.4). Rows of { type (select over the 8 link types), label
 * (required), url (http/https only) } with add, remove, and drag-reorder. This is the
 * single implementation the portfolio item form uses now and the blog `links` block
 * (§3.7) will reuse later — hence it takes a plain `value`/`onChange` pair and knows
 * nothing about sections.
 *
 * Validation is surfaced inline per row; the parent gates its Save button on
 * {@link areLinksValid} so invalid content can reach neither a draft nor production.
 */
import {
  Box,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
  Button,
} from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import AddLinkIcon from '@mui/icons-material/AddLink';
import type { Link } from '../../types/content';
import { validateLink } from '../../lib/reorder';
import SortableList, { type DragHandleProps } from '../dnd/SortableList';

const LINK_TYPES: Link['type'][] = [
  'repo',
  'prod',
  'dev',
  'docs',
  'demo',
  'package',
  'article',
  'other',
];

interface LinkEditorProps {
  value: Link[];
  onChange: (links: Link[]) => void;
}

// dnd-kit needs a stable id per row. Links live inside `data` and have no id of their
// own (§3.4 — they are never addressed independently), so we key on array index, which
// is stable for the lifetime of a single edit session.
interface LinkRow {
  id: string;
  link: Link;
  index: number;
}

export default function LinkEditor({ value, onChange }: LinkEditorProps) {
  const links = Array.isArray(value) ? value : [];
  const rows: LinkRow[] = links.map((link, index) => ({ id: String(index), link, index }));

  const setAt = (index: number, next: Link) => {
    onChange(links.map((link, i) => (i === index ? next : link)));
  };
  const removeAt = (index: number) => {
    onChange(links.filter((_, i) => i !== index));
  };
  const add = () => onChange([...links, { type: 'repo', label: '', url: '' }]);

  const handleReorder = (orderedIds: string[]) => {
    // orderedIds are the stringified original indices in their new order.
    onChange(orderedIds.map((id) => links[Number(id)]));
  };

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        Links
      </Typography>
      {rows.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          No links yet.
        </Typography>
      )}
      <SortableList
        items={rows}
        onReorder={handleReorder}
        renderItem={(row: LinkRow, handle: DragHandleProps) => {
          const errors = validateLink(row.link);
          return (
            <Stack
              direction="row"
              spacing={1}
              sx={{ mb: 1.5, alignItems: 'flex-start' }}
              data-testid="link-row"
            >
              <IconButton
                size="small"
                aria-label="Drag to reorder link"
                sx={{ cursor: 'grab', mt: 1 }}
                {...handle.attributes}
                {...handle.listeners}
              >
                <DragIndicatorIcon fontSize="small" />
              </IconButton>
              <TextField
                select
                size="small"
                label="Type"
                value={row.link.type}
                onChange={(e) => setAt(row.index, { ...row.link, type: e.target.value as Link['type'] })}
                sx={{ minWidth: 120 }}
              >
                {LINK_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label="Label"
                required
                value={row.link.label}
                onChange={(e) => setAt(row.index, { ...row.link, label: e.target.value })}
                error={Boolean(errors.label)}
                helperText={errors.label}
                sx={{ minWidth: 160 }}
              />
              <TextField
                size="small"
                label="URL"
                fullWidth
                value={row.link.url}
                onChange={(e) => setAt(row.index, { ...row.link, url: e.target.value })}
                error={Boolean(errors.url)}
                helperText={errors.url}
              />
              <IconButton
                size="small"
                aria-label={`Remove link ${row.index + 1}`}
                onClick={() => removeAt(row.index)}
                sx={{ mt: 1 }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Stack>
          );
        }}
      />
      <Button startIcon={<AddLinkIcon />} size="small" onClick={add}>
        Add link
      </Button>
    </Box>
  );
}
