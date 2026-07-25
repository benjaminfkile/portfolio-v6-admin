/**
 * Create-post dialog (§3.6). Collects the two identifying fields — title and slug — and
 * seeds the slug from the title until the user edits it by hand. The body starts empty and
 * is filled in the block editor. The slug is freely editable here (the post has never been
 * published yet); it only locks after first publish (§3.6).
 */
import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { slugify } from '../../lib/slug';

interface CreatePostDialogProps {
  open: boolean;
  saving: boolean;
  onCreate: (payload: { title: string; slug: string }) => void;
  onClose: () => void;
}

export default function CreatePostDialog({
  open,
  saving,
  onCreate,
  onClose,
}: CreatePostDialogProps) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);

  const handleTitle = (next: string) => {
    setTitle(next);
    if (!slugEdited) setSlug(slugify(next));
  };

  const handleSlug = (next: string) => {
    setSlugEdited(true);
    setSlug(next);
  };

  const canCreate = title.trim().length > 0 && slug.trim().length > 0;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New post</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <TextField
            label="Title"
            required
            fullWidth
            autoFocus
            value={title}
            onChange={(e) => handleTitle(e.target.value)}
          />
          <TextField
            label="Slug"
            required
            fullWidth
            value={slug}
            onChange={(e) => handleSlug(e.target.value)}
            helperText="The URL segment (/blog/your-slug). Editable until first publish."
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => onCreate({ title: title.trim(), slug: slug.trim() })}
          disabled={!canCreate || saving}
        >
          {saving ? 'Creating…' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
