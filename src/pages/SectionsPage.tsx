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
import { useCallback, useEffect, useState } from 'react';
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
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PublishIcon from '@mui/icons-material/Publish';
import type { AdminSection } from '../types/admin';
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
import { PublishValidationError, publishSite } from '../api/versionsApi';
import SortableList, { type DragHandleProps } from '../components/dnd/SortableList';
import SectionCard from '../components/sections/SectionCard';
import CreateSectionDialog from '../components/sections/CreateSectionDialog';
import SectionEditDialog from '../components/sections/SectionEditDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import ConflictDialog from '../components/ConflictDialog';

export default function SectionsPage() {
  const [sections, setSections] = useState<AdminSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminSection | null>(null);
  const [deleting, setDeleting] = useState<AdminSection | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [toast, setToast] = useState('');

  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishIssues, setPublishIssues] = useState<string[]>([]);

  const refetch = useCallback(async () => {
    const data = await getSections();
    setSections([...data].sort((a, b) => a.position - b.position));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      await refetch();
    } catch {
      setLoadError('Could not load the working set. Is the API reachable?');
    } finally {
      setLoading(false);
    }
  }, [refetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleReorder = async (orderedIds: string[]) => {
    // Optimistic: reflect the new order immediately, then persist the full array (§4.2).
    const byId = new Map(sections.map((s) => [s.id, s]));
    setSections(orderedIds.map((id) => byId.get(id)!).filter(Boolean));
    try {
      await reorderSections(orderedIds);
      await refetch();
    } catch {
      setToast('Could not save the new order.');
      await refetch();
    }
  };

  const handleCreate = async (type: SectionType) => {
    setCreating(false);
    try {
      await createSection(type, { ...getSectionTypeDef(type).defaultData });
      await refetch();
    } catch {
      setToast('Could not create the section.');
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
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
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

      {!loading && !loadError && sections.length === 0 && (
        <Alert severity="info">No sections yet. Add one to start building the page.</Alert>
      )}

      {!loading && !loadError && sections.length > 0 && (
        <SortableList
          items={sections}
          onReorder={handleReorder}
          renderItem={(section: AdminSection, handle: DragHandleProps) => (
            <SectionCard
              section={section}
              handle={handle}
              onEdit={() => setEditing(section)}
              onToggleHidden={() => void handleToggleHidden(section)}
              onDelete={() => setDeleting(section)}
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
