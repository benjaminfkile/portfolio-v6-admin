/**
 * Create / edit dialog for a blog (Blogs v1.13). One form drives both flows: in "create"
 * mode it collects name + slug; in "edit" mode it seeds from the existing blog and the caller
 * sends the change with `expected_updated_at` (§4.5).
 *
 * The slug seeds from the name via the shared {@link slugify} helper until the user edits it
 * by hand (the same pattern the post/page create dialogs use). Slug rules are enforced
 * client-side as a *hint* only — lowercase letters/digits/hyphens; the server owns uniqueness,
 * so a `serverError` handed back from a rejected write (e.g. a duplicate slug 409) is surfaced
 * inline. Themed via MUI only (§14.4).
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import type { Blog } from '../../types/admin';
import { slugify } from '../../lib/slug';

const SLUG_RE = /^[a-z0-9-]+$/;

/** Client-side slug hint. Returns an error string, or '' when the slug is acceptable. */
export function blogSlugHint(slug: string): string {
  if (!slug) return 'A slug is required.';
  if (!SLUG_RE.test(slug)) return 'Use lowercase letters, digits, and hyphens only.';
  return '';
}

export interface BlogFormValues {
  slug: string;
  name: string;
}

interface BlogFormDialogProps {
  open: boolean;
  /** The blog being edited, or null when creating. */
  blog: Blog | null;
  saving: boolean;
  /** A server-side rejection (e.g. duplicate slug) to show inline; '' hides it. */
  serverError?: string;
  onSubmit: (values: BlogFormValues) => void;
  onClose: () => void;
}

export default function BlogFormDialog({
  open,
  blog,
  saving,
  serverError = '',
  onSubmit,
  onClose,
}: BlogFormDialogProps) {
  const isEdit = blog != null;
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);

  // Reseed the fields whenever the dialog opens for a (possibly different) blog.
  useEffect(() => {
    if (!open) return;
    setName(blog?.name ?? '');
    setSlug(blog?.slug ?? '');
    // Editing an existing blog: never auto-overwrite its slug from the name.
    setSlugEdited(isEdit);
  }, [open, blog, isEdit]);

  const handleName = (next: string) => {
    setName(next);
    if (!slugEdited) setSlug(slugify(next));
  };

  const handleSlug = (next: string) => {
    setSlugEdited(true);
    setSlug(next);
  };

  const slugError = blogSlugHint(slug.trim());
  const nameError = name.trim() === '' ? 'A name is required.' : '';
  const canSubmit = !saving && !slugError && !nameError;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({ slug: slug.trim(), name: name.trim() });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit blog' : 'New blog'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {serverError && <Alert severity="error">{serverError}</Alert>}
          <TextField
            label="Name"
            value={name}
            onChange={(e) => handleName(e.target.value)}
            error={Boolean(name) && Boolean(nameError)}
            helperText="Shown as the blog's display name."
            fullWidth
            autoFocus
          />
          <TextField
            label="Slug"
            value={slug}
            onChange={(e) => handleSlug(e.target.value)}
            error={Boolean(slug) && Boolean(slugError)}
            helperText={
              slug && slugError ? slugError : 'Lowercase letters, digits and hyphens. Used in URLs.'
            }
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={!canSubmit}>
          {isEdit ? (saving ? 'Saving…' : 'Save') : saving ? 'Creating…' : 'Create blog'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
