/**
 * Sections page (§4.2, §3.4, §4.5, §14.4). Loads the working set, renders ordered section
 * cards with drag-and-drop reorder, and drives create / edit / hide-show / delete plus
 * per-item CRUD inside the item-bearing types. Every save carries `expected_updated_at`;
 * a 409 raises the shared "changed since you loaded it" dialog offering a refetch (§4.5).
 *
 * Publishing is NOT here: publish is site-level (it snapshots every page, §3.10), so it
 * lives in the AppShell app bar as PublishSiteButton.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
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

  return (
    <Box>
      <Stack
        direction="row"
        sx={{ mb: 3, alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="h4" component="h1">
          Sections
        </Typography>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setCreating(true)}
          disabled={!selectedPageId}
        >
          Add section
        </Button>
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
