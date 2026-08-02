/**
 * One row in the admin page list (v1.1, §3.10). Shows the page title, its slug, nav label
 * and hidden state, with a drag handle for nav reorder (§14.4) and edit / hide-show / delete
 * actions.
 *
 * The `home` page is special (it renders at `/`): it gets a badge and its delete action is
 * disabled client-side — deleting it would leave the site without a root page. The server
 * may also refuse, but we do not rely on that (§3.10).
 */
import { Box, Chip, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import type { Page } from '../../types/admin';
import type { DragHandleProps } from '../dnd/SortableList';

export const HOME_SLUG = 'home';

interface PageRowProps {
  page: Page;
  handle: DragHandleProps;
  onEdit: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
}

export default function PageRow({ page, handle, onEdit, onToggleHidden, onDelete }: PageRowProps) {
  const isHome = page.slug === HOME_SLUG;
  const publicPath = isHome ? '/' : `/${page.slug}`;

  return (
    <Paper variant="outlined" data-testid="page-row" sx={{ p: 1.5, mb: 1.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <IconButton
          size="small"
          aria-label={`Drag to reorder ${page.title}`}
          sx={{ cursor: 'grab' }}
          {...handle.attributes}
          {...handle.listeners}
        >
          <DragIndicatorIcon />
        </IconButton>

        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600 }}>
              {page.title}
            </Typography>
            {isHome && <Chip size="small" color="primary" label="Home" />}
            {page.is_hidden && <Chip size="small" color="default" label="Hidden" />}
            {page.nav_label ? (
              <Chip size="small" variant="outlined" label={`Nav: ${page.nav_label}`} />
            ) : (
              <Chip size="small" variant="outlined" label="Not in nav" />
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary" noWrap>
            {publicPath}
          </Typography>
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        <Tooltip title="Edit page">
          <IconButton size="small" aria-label={`Edit ${page.title}`} onClick={onEdit}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={page.is_hidden ? 'Show page' : 'Hide page'}>
          <IconButton
            size="small"
            aria-label={page.is_hidden ? `Show ${page.title}` : `Hide ${page.title}`}
            onClick={onToggleHidden}
          >
            {page.is_hidden ? (
              <VisibilityOffIcon fontSize="small" />
            ) : (
              <VisibilityIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip title={isHome ? 'The home page cannot be deleted' : 'Delete page'}>
          {/* span wrapper so the tooltip still shows while the button is disabled */}
          <span>
            <IconButton
              size="small"
              aria-label={`Delete ${page.title}`}
              onClick={onDelete}
              disabled={isHome}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Paper>
  );
}
