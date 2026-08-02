/**
 * Sections page (§4.2, §3.4, §4.5, §14.4). Loads the working set, renders ordered section
 * cards with drag-and-drop reorder, and drives create / edit / hide-show / delete plus
 * per-item CRUD inside the item-bearing types. Every save carries `expected_updated_at`;
 * a 409 raises the shared "changed since you loaded it" dialog offering a refetch (§4.5).
 *
 * This is also where the working set is published live: the "Publish" action snapshots the
 * current sections/items as a new version via `POST /api/admin/publish` (§4.2). The API
 * re-validates the whole working set first (§3.9), so a validation refusal is surfaced as a
 * clear per-issue list rather than an opaque toast.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PublishIcon from '@mui/icons-material/Publish';
import type { AdminSection, Page } from '../types/admin';
import type { SectionType } from '../types/content';
import { getSectionTypeDef } from '../lib/sectionRegistry';
import {
  ConflictError,
  createSection,
  deleteSection,
  getSections,
  reorderSections,
  updateSection,
} from '../api/sectionsApi';
import { getPages } from '../api/pagesApi';
import { PublishValidationError, publishSite } from '../api/versionsApi';
import SortableList, { type DragHandleProps } from '../components/dnd/SortableList';
import SectionCard from '../components/sections/SectionCard';
import CreateSectionDialog from '../components/sections/CreateSectionDialog';
import SectionEditDialog from '../components/sections/SectionEditDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import ConflictDialog from '../components/ConflictDialog';

/** Resolve the `?page=` param (id or slug) to a page, defaulting to home then the first page. */
function resolveSelected(pages: Page[], param: string | null): Page | null {
  return (
    pages.find((p) => p.slug === param || p.id === param) ??
    pages.find((p) => p.slug === 'home') ??
    pages[0] ??
    null
  );
}

export default function SectionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const pageParam = searchParams.get('page');

  const [pages, setPages] = useState<Page[]>([]);
  const [sections, setSections] = useState<AdminSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const selectedPage = useMemo(() => resolveSelected(pages, pageParam), [pages, pageParam]);
  const selectedPageId = selectedPage?.id ?? null;

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminSection | null>(null);
  const [deleting, setDeleting] = useState<AdminSection | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [toast, setToast] = useState('');

  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishIssues, setPublishIssues] = useState<string[]>([]);

  // Refetch just the sections for the currently selected page (used after every mutation).
  const refetch = useCallback(async () => {
    if (!selectedPageId) {
      setSections([]);
      return;
    }
    const data = await getSections(selectedPageId);
    setSections([...data].sort((a, b) => a.position - b.position));
  }, [selectedPageId]);

  // Load the page list and the selected page's sections together. Re-runs when `?page=`
  // changes (switching pages) so the working set always matches the URL context.
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const loadedPages = [...(await getPages())].sort((a, b) => a.nav_position - b.nav_position);
      setPages(loadedPages);
      const selected = resolveSelected(loadedPages, pageParam);
      if (selected) {
        const data = await getSections(selected.id);
        setSections([...data].sort((a, b) => a.position - b.position));
      } else {
        setSections([]);
      }
    } catch {
      setLoadError('Could not load the working set. Is the API reachable?');
    } finally {
      setLoading(false);
    }
  }, [pageParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSelectPage = (page: Page) => {
    // Persist the selection in the URL (by slug) so a refresh keeps the page context.
    setSearchParams({ page: page.slug }, { replace: true });
  };

  const handleReorder = async (orderedIds: string[]) => {
    if (!selectedPageId) return;
    // Optimistic: reflect the new order immediately, then persist the full array (§4.2).
    const byId = new Map(sections.map((s) => [s.id, s]));
    setSections(orderedIds.map((id) => byId.get(id)!).filter(Boolean));
    try {
      await reorderSections(selectedPageId, orderedIds);
      await refetch();
    } catch {
      setToast('Could not save the new order.');
      await refetch();
    }
  };

  const handleCreate = async (type: SectionType) => {
    setCreating(false);
    if (!selectedPageId) return;
    try {
      await createSection(type, { ...getSectionTypeDef(type).defaultData }, selectedPageId);
      await refetch();
    } catch {
      setToast('Could not create the section.');
    }
  };

  const handleMove = async (section: AdminSection, targetPageId: string) => {
    const target = pages.find((p) => p.id === targetPageId);
    try {
      await updateSection(section.id, {
        page_id: targetPageId,
        expected_updated_at: section.updated_at,
      });
      // The section left the current page — drop it from the list and confirm with a toast.
      await refetch();
      setToast(`Moved to "${target?.title ?? 'page'}".`);
    } catch (err) {
      if (err instanceof ConflictError) {
        setConflictOpen(true);
      } else {
        setToast('Could not move the section.');
      }
    }
  };

  const handleSaveSection = async (data: Record<string, unknown>) => {
    if (!editing) return;
    setSaving(true);
    try {
      await updateSection(editing.id, { data, expected_updated_at: editing.updated_at });
      setEditing(null);
      await refetch();
    } catch (err) {
      setEditing(null);
      if (err instanceof ConflictError) {
        setConflictOpen(true);
      } else {
        setToast('Could not save the section.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleHidden = async (section: AdminSection) => {
    try {
      await updateSection(section.id, {
        is_hidden: !section.is_hidden,
        expected_updated_at: section.updated_at,
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
    try {
      await deleteSection(deleting.id);
      setDeleting(null);
      await refetch();
    } catch {
      setDeleting(null);
      setToast('Could not delete the section.');
    }
  };

  const handleRefetchFromConflict = async () => {
    setConflictOpen(false);
    await load();
  };

  const handlePublish = async () => {
    setPublishing(true);
    setPublishIssues([]);
    try {
      const version = await publishSite();
      setPublishOpen(false);
      setToast(`Published version ${version.version}. It is now live.`);
    } catch (err) {
      if (err instanceof PublishValidationError) {
        // Keep the dialog open and list every failure inline (§3.9).
        setPublishIssues([err.message, ...err.issues]);
      } else {
        setPublishOpen(false);
        setToast('Could not publish the page. Is the API reachable?');
      }
    } finally {
      setPublishing(false);
    }
  };

  const closePublish = () => {
    if (publishing) return;
    setPublishOpen(false);
    setPublishIssues([]);
  };

  return (
    <Box>
      <Stack
        direction="row"
        sx={{ mb: 3, alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="h4" component="h1">
          Sections
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setCreating(true)}
            disabled={!selectedPageId}
          >
            Add section
          </Button>
          <Button
            variant="contained"
            startIcon={<PublishIcon />}
            onClick={() => {
              setPublishIssues([]);
              setPublishOpen(true);
            }}
          >
            Publish
          </Button>
        </Stack>
      </Stack>

      {pages.length > 0 && (
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs
            value={selectedPageId ?? false}
            onChange={(_e, value: string) => {
              const page = pages.find((p) => p.id === value);
              if (page) handleSelectPage(page);
            }}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="Select a page"
          >
            {pages.map((page) => (
              <Tab key={page.id} value={page.id} label={page.title} />
            ))}
          </Tabs>
        </Box>
      )}

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
        <Alert severity="info">
          No pages yet. Create a page first, then add sections to it.
        </Alert>
      )}

      {!loading && !loadError && pages.length > 0 && sections.length === 0 && (
        <Alert severity="info">
          No sections on <strong>{selectedPage?.title}</strong> yet. Add one to start building this
          page.
        </Alert>
      )}

      {!loading && !loadError && sections.length > 0 && (
        <SortableList
          items={sections}
          onReorder={handleReorder}
          renderItem={(section: AdminSection, handle: DragHandleProps) => (
            <SectionCard
              section={section}
              handle={handle}
              pages={pages}
              onEdit={() => setEditing(section)}
              onToggleHidden={() => void handleToggleHidden(section)}
              onDelete={() => setDeleting(section)}
              onMove={(pageId) => void handleMove(section, pageId)}
              onChanged={refetch}
              onConflict={() => setConflictOpen(true)}
              onError={(msg) => setToast(msg)}
            />
          )}
        />
      )}

      <CreateSectionDialog
        open={creating}
        onCreate={(type) => void handleCreate(type)}
        onClose={() => setCreating(false)}
      />

      {editing && (
        <SectionEditDialog
          key={editing.id}
          open
          section={editing}
          saving={saving}
          onSave={(data) => void handleSaveSection(data)}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete section?"
        message="This permanently removes the section and all of its items from the working set."
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleting(null)}
      />

      <ConflictDialog
        open={conflictOpen}
        onRefetch={() => void handleRefetchFromConflict()}
        onClose={() => setConflictOpen(false)}
      />

      <Dialog open={publishOpen} onClose={closePublish} maxWidth="sm" fullWidth>
        <DialogTitle>Publish the page?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This snapshots the current working set as a new version and makes it live on the
            public site immediately (§4.2). The whole page is validated first — if anything is
            invalid, nothing is published.
          </DialogContentText>
          {publishIssues.length > 0 && (
            <Alert severity="error" sx={{ mt: 2 }}>
              <AlertTitle>Publish failed validation</AlertTitle>
              <List dense disablePadding>
                {publishIssues.map((issue, i) => (
                  <ListItem key={i} disableGutters sx={{ py: 0 }}>
                    <ListItemText primary={issue} />
                  </ListItem>
                ))}
              </List>
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closePublish} disabled={publishing}>
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={<PublishIcon />}
            onClick={() => void handlePublish()}
            disabled={publishing}
          >
            {publishing ? 'Publishing…' : 'Publish now'}
          </Button>
        </DialogActions>
      </Dialog>

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
