/**
 * Create / edit dialog for a page (v1.1, §3.10). One form drives both flows: in "create"
 * mode it collects slug/title/nav-label; in "edit" mode it seeds from the existing page and
 * the caller sends the change with `expected_updated_at` (§4.5).
 *
 * The slug rules are enforced client-side as a *hint* only — lowercase letters/digits/hyphens
 * and not one of the reserved slugs (`api`, `admin`). The server is authoritative (it also owns
 * uniqueness), so a `serverError` handed back from a rejected write is surfaced inline rather
 * than swallowed. `blog` is NOT reserved: with the blog section's `mode: 'index'`, the Blog is
 * composed as an admin page and needs its own slug. Themed via MUI only (§14.4).
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
import type { Page } from '../../types/admin';

/**
 * Reserved slugs rejected on create/rename (§3.10): they collide with real routes.
 * `blog` was reserved historically but was unreserved alongside the blog-as-a-page
 * change, so the Blog can be composed as an admin page like any other.
 */
export const RESERVED_SLUGS = ['api', 'admin'] as const;
const SLUG_RE = /^[a-z0-9-]+$/;

/** Client-side slug hint. Returns an error string, or '' when the slug is acceptable. */
export function slugHint(slug: string): string {
  if (!slug) return 'A slug is required.';
  if (!SLUG_RE.test(slug)) return 'Use lowercase letters, digits, and hyphens only.';
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) {
    return `"${slug}" is reserved and cannot be used.`;
  }
  return '';
}

export interface PageFormValues {
  slug: string;
  title: string;
  /** Empty string is normalised to null by the caller (not shown in nav). */
  nav_label: string;
}

interface PageFormDialogProps {
  open: boolean;
  /** The page being edited, or null when creating. */
  page: Page | null;
  saving: boolean;
  /** A server-side rejection (e.g. duplicate slug) to show inline; '' hides it. */
  serverError?: string;
  onSubmit: (values: PageFormValues) => void;
  onClose: () => void;
}

export default function PageFormDialog({
  open,
  page,
  saving,
  serverError = '',
  onSubmit,
  onClose,
}: PageFormDialogProps) {
  const isEdit = page != null;
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [navLabel, setNavLabel] = useState('');

  // Reseed the fields whenever the dialog opens for a (possibly different) page.
  useEffect(() => {
    if (!open) return;
    setSlug(page?.slug ?? '');
    setTitle(page?.title ?? '');
    setNavLabel(page?.nav_label ?? '');
  }, [open, page]);

  const slugError = slugHint(slug.trim());
  const titleError = title.trim() === '' ? 'A title is required.' : '';
  const canSubmit = !saving && !slugError && !titleError;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({ slug: slug.trim(), title: title.trim(), nav_label: navLabel.trim() });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit page' : 'New page'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {serverError && <Alert severity="error">{serverError}</Alert>}
          <TextField
            label="Slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            error={Boolean(slug) && Boolean(slugError)}
            helperText={
              slug && slugError
                ? slugError
                : "Lowercase letters, digits and hyphens. 'home' renders at '/'."
            }
            fullWidth
            autoFocus={!isEdit}
          />
          <TextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={Boolean(title) && Boolean(titleError)}
            helperText="Shown as the page's heading and browser title."
            fullWidth
          />
          <TextField
            label="Nav label"
            value={navLabel}
            onChange={(e) => setNavLabel(e.target.value)}
            helperText="Leave blank to keep this page out of the nav (still reachable by link)."
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={!canSubmit}>
          {isEdit ? (saving ? 'Saving…' : 'Save') : saving ? 'Creating…' : 'Create page'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
