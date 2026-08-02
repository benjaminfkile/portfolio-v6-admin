/**
 * Pages management screen (v1.1, §3.10, §4.2, §4.5). Lists the site's pages ordered by
 * `nav_position` and drives create / edit / hide-show / delete plus drag-reorder of the nav.
 *
 * Every edit carries `expected_updated_at`; a 409 raises the shared "changed since you
 * loaded it" dialog offering a refetch (§4.5). Delete is destructive in a way the admin must
 * understand first — the server deletes the page AND all of its sections (§4.2) — so it goes
 * through a ConfirmDialog whose message spells out the cascade.
 *
 * The `home` page is special: it renders at `/`, gets a badge, and is not deletable from the
 * client (the delete action is disabled). Slug rules are hinted client-side but the server is
 * authoritative, so a rejected create surfaces the server's message inline.
 *
 * Themed via MUI only (§14.4).
 */
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { Page } from '../types/admin';
import {
  ConflictError,
  createPage,
  deletePage,
  getPages,
  reorderPages,
  updatePage,
} from '../api/pagesApi';
import SortableList, { type DragHandleProps } from '../components/dnd/SortableList';
import PageRow, { HOME_SLUG } from '../components/pages/PageRow';
import PageFormDialog, { type PageFormValues } from '../components/pages/PageFormDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import ConflictDialog from '../components/ConflictDialog';

/** Pull a human-readable message out of a rejected write for inline display. */
function serverMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { errorMsg?: string } | undefined;
    if (body?.errorMsg) return body.errorMsg;
  }
  return fallback;
}

export default function PagesPage() {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Page | null>(null);
  const [deleting, setDeleting] = useState<Page | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [conflictOpen, setConflictOpen] = useState(false);
  const [toast, setToast] = useState('');

  const refetch = useCallback(async () => {
    const data = await getPages();
    setPages([...data].sort((a, b) => a.nav_position - b.nav_position));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      await refetch();
    } catch {
      setLoadError('Could not load the pages. Is the API reachable?');
    } finally {
      setLoading(false);
    }
  }, [refetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleReorder = async (orderedIds: string[]) => {
    // Optimistic: reflect the new order immediately, then persist the full array (§4.2).
    const byId = new Map(pages.map((p) => [p.id, p]));
    setPages(orderedIds.map((id) => byId.get(id)!).filter(Boolean));
    try {
      await reorderPages(orderedIds);
      await refetch();
    } catch {
      setToast('Could not save the new order.');
      await refetch();
    }
  };

  const handleCreate = async (values: PageFormValues) => {
    setSaving(true);
    setFormError('');
    try {
      await createPage({
        slug: values.slug,
        title: values.title,
        nav_label: values.nav_label === '' ? null : values.nav_label,
      });
      setCreating(false);
      await refetch();
      setToast('Page created.');
    } catch (err) {
      // Keep the dialog open and show the server's reason (e.g. duplicate/reserved slug).
      setFormError(serverMessage(err, 'Could not create the page.'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (values: PageFormValues) => {
    if (!editing) return;
    setSaving(true);
    setFormError('');
    try {
      await updatePage(editing.id, {
        slug: values.slug,
        title: values.title,
        nav_label: values.nav_label === '' ? null : values.nav_label,
        expected_updated_at: editing.updated_at,
      });
      setEditing(null);
      await refetch();
    } catch (err) {
      if (err instanceof ConflictError) {
        setEditing(null);
        setConflictOpen(true);
      } else {
        setFormError(serverMessage(err, 'Could not save the page.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleHidden = async (page: Page) => {
    try {
      await updatePage(page.id, {
        is_hidden: !page.is_hidden,
        expected_updated_at: page.updated_at,
      });
      await refetch();
    } catch (err) {
      if (err instanceof ConflictError) {
        setConflictOpen(true);
      } else {
        setToast('Could not update visibility.');
      }
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    // Guard: home is never deletable from the client (§3.10).
    if (deleting.slug === HOME_SLUG) {
      setDeleting(null);
      return;
    }
    try {
      await deletePage(deleting.id);
      setDeleting(null);
      await refetch();
      setToast('Page and its sections deleted.');
    } catch {
      setDeleting(null);
      setToast('Could not delete the page.');
    }
  };

  const handleRefetchFromConflict = async () => {
    setConflictOpen(false);
    await load();
  };

  return (
    <Box>
      <Stack
        direction="row"
        sx={{ mb: 3, alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Box>
          <Typography variant="h4" component="h1">
            Pages
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Each page owns its sections. The nav is the pages with a nav label, in this order —
            drag to reorder. The <strong>home</strong> page renders at <code>/</code>.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setFormError('');
            setCreating(true);
          }}
        >
          New page
        </Button>
      </Stack>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && loadError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void load()}>
              Retry
            </Button>
          }
        >
          {loadError}
        </Alert>
      )}

      {!loading && !loadError && pages.length === 0 && (
        <Alert severity="info">No pages yet. Create one to start building the site.</Alert>
      )}

      {!loading && !loadError && pages.length > 0 && (
        <SortableList
          items={pages}
          onReorder={handleReorder}
          renderItem={(page: Page, handle: DragHandleProps) => (
            <PageRow
              page={page}
              handle={handle}
              onEdit={() => {
                setFormError('');
                setEditing(page);
              }}
              onToggleHidden={() => void handleToggleHidden(page)}
              onDelete={() => setDeleting(page)}
            />
          )}
        />
      )}

      <PageFormDialog
        open={creating}
        page={null}
        saving={saving}
        serverError={formError}
        onSubmit={(values) => void handleCreate(values)}
        onClose={() => {
          if (!saving) setCreating(false);
        }}
      />

      {editing && (
        <PageFormDialog
          key={editing.id}
          open
          page={editing}
          saving={saving}
          serverError={formError}
          onSubmit={(values) => void handleEdit(values)}
          onClose={() => {
            if (!saving) setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={deleting ? `Delete "${deleting.title}"?` : 'Delete page?'}
        message={
          deleting
            ? `Deleting this page also permanently deletes ALL of its sections. This cannot ` +
              `be undone.`
            : ''
        }
        confirmLabel="Delete page & sections"
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleting(null)}
      />

      <ConflictDialog
        open={conflictOpen}
        onRefetch={() => void handleRefetchFromConflict()}
        onClose={() => setConflictOpen(false)}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
