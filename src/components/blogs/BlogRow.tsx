/**
 * One row in the admin blog list (Blogs v1.13). Shows the blog name, its slug, the number of
 * posts assigned to it, and when it was last updated, with edit / delete actions.
 *
 * Delete is not a cascade — the server unassigns this blog's posts rather than deleting them —
 * so the destructive styling lives on the confirm dialog, not here.
 */
import { Box, Chip, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import type { Blog } from '../../types/admin';
import { formatDate } from '../../lib/media';

interface BlogRowProps {
  blog: Blog;
  onEdit: () => void;
  onDelete: () => void;
}

export default function BlogRow({ blog, onEdit, onDelete }: BlogRowProps) {
  const count = blog.post_count;
  return (
    <Paper variant="outlined" data-testid="blog-row" sx={{ p: 1.5, mb: 1.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600 }}>
              {blog.name}
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              label={`${count} ${count === 1 ? 'post' : 'posts'}`}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary" noWrap>
            /{blog.slug}
          </Typography>
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: { xs: 'none', sm: 'block' }, minWidth: 96, textAlign: 'right' }}
        >
          {formatDate(blog.updated_at)}
        </Typography>

        <Tooltip title="Edit blog">
          <IconButton size="small" aria-label={`Edit ${blog.name}`} onClick={onEdit}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete blog">
          <IconButton size="small" aria-label={`Delete ${blog.name}`} onClick={onDelete}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  );
}
