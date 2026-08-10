/**
 * Blogs management screen (Blogs v1.13). Lists the site's blogs and drives create / rename /
 * re-slug / delete. A blog groups posts under a slug; posts reference it by `blog_id`.
 *
 * Every edit carries `expected_updated_at`; a 409 raises the shared "changed since you loaded
 * it" dialog offering a refetch (§4.5). Delete is NOT a cascade — the server unassigns this
 * blog's posts (`blog_id -> null`) and never deletes them — so the ConfirmDialog spells out
 * exactly that: N posts become unassigned, none are deleted.
 *
 * Themed via MUI only (§14.4). Follows the PagesPage pattern.
 */
import { useCallback, useEffect, useState } from 'react';
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
import type { Blog } from '../types/admin';
import {
  ConflictError,
  createBlog,
  deleteBlog,
  getBlogs,
  updateBlog,
} from '../api/blogsApi';
import BlogRow from '../components/blogs/BlogRow';
import BlogFormDialog, { type BlogFormValues } from '../components/blogs/BlogFormDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import ConflictDialog from '../components/ConflictDialog';
import { serverMessage } from '../api/serverMessage';

export default function BlogsPage() {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Blog | null>(null);
  const [deleting, setDeleting] = useState<Blog | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [conflictOpen, setConflictOpen] = useState(false);
  const [toast, setToast] = useState('');

  const refetch = useCallback(async () => {
    const data = await getBlogs();
    setBlogs([...data].sort((a, b) => a.name.localeCompare(b.name)));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      await refetch();
    } catch (err) {
      setLoadError(serverMessage(err, 'Could not load the blogs. Is the API reachable?'));
    } finally {
      setLoading(false);
    }
  }, [refetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (values: BlogFormValues) => {
    setSaving(true);
    setFormError('');
    try {
      await createBlog({ slug: values.slug, name: values.name });
      setCreating(false);
      await refetch();
      setToast('Blog created.');
    } catch (err) {
      // Keep the dialog open and show the server's reason (e.g. duplicate slug).
      setFormError(serverMessage(err, 'Could not create the blog. The slug may already be in use.'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (values: BlogFormValues) => {
    if (!editing) return;
    setSaving(true);
    setFormError('');
    try {
      await updateBlog(editing.id, {
        slug: values.slug,
        name: values.name,
        expected_updated_at: editing.updated_at,
      });
      setEditing(null);
      await refetch();
      setToast('Blog saved.');
    } catch (err) {
      if (err instanceof ConflictError) {
        setEditing(null);
        setConflictOpen(true);
      } else {
        setFormError(serverMessage(err, 'Could not save the blog. The slug may already be in use.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteBlog(deleting.id);
      setDeleting(null);
      await refetch();
      setToast('Blog deleted; its posts are now unassigned.');
    } catch (err) {
      setDeleting(null);
      setToast(serverMessage(err, 'Could not delete the blog.'));
    }
  };

  const handleRefetchFromConflict = async () => {
    setConflictOpen(false);
    await load();
  };

  const deletingCount = deleting?.post_count ?? 0;

  return (
    <Box>
      <Stack
        direction="row"
        sx={{ mb: 3, alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Box>
          <Typography variant="h4" component="h1">
            Blogs
          </Typography>
          <Typography variant="body2" color="text.secondary">
            A blog groups posts under a slug. Posts pick their blog in the post editor; deleting
            a blog unassigns its posts — it never deletes them.
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
          New blog
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

      {!loading && !loadError && blogs.length === 0 && (
        <Alert severity="info">No blogs yet. Create one to group your posts.</Alert>
      )}

      {!loading && !loadError && blogs.length > 0 && (
        <Box>
          {blogs.map((blog) => (
            <BlogRow
              key={blog.id}
              blog={blog}
              onEdit={() => {
                setFormError('');
                setEditing(blog);
              }}
              onDelete={() => setDeleting(blog)}
            />
          ))}
        </Box>
      )}

      <BlogFormDialog
        open={creating}
        blog={null}
        saving={saving}
        serverError={formError}
        onSubmit={(values) => void handleCreate(values)}
        onClose={() => {
          if (!saving) setCreating(false);
        }}
      />

      {editing && (
        <BlogFormDialog
          key={editing.id}
          open
          blog={editing}
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
        title={deleting ? `Delete "${deleting.name}"?` : 'Delete blog?'}
        message={
          deleting
            ? deletingCount > 0
              ? `This unassigns ${deletingCount} ${deletingCount === 1 ? 'post' : 'posts'} from ` +
                `this blog (their blog is set to none). No posts are deleted. This cannot be undone.`
              : `This blog has no posts assigned. Deleting it removes the blog only — no posts ` +
                `are affected. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete blog"
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
