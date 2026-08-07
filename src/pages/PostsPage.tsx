/**
 * Posts list page (§3.6, §4.2). Lists every post — drafts included — with a draft/published
 * status chip and the `published_at` date, plus a create flow. Creating a post opens the
 * block editor for it; clicking a row opens it for editing.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { Post } from '../types/content';
import { createPost, getPosts } from '../api/postsApi';
import { serverMessage } from '../api/serverMessage';
import { formatDate } from '../lib/media';
import CreatePostDialog from '../components/posts/CreatePostDialog';

export default function PostsPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [creating, setCreating] = useState(false);
  const [savingCreate, setSavingCreate] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getPosts();
      // Most recently updated first; a stable, predictable ordering for the list.
      setPosts([...data].sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    } catch (err) {
      setLoadError(serverMessage(err, 'Could not load posts. Is the API reachable?'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (payload: { title: string; slug: string }) => {
    setSavingCreate(true);
    try {
      const post = await createPost(payload);
      setCreating(false);
      navigate(`/posts/${post.id}`);
    } catch (err) {
      setToast(serverMessage(err, 'Could not create the post. The slug may already be in use.'));
    } finally {
      setSavingCreate(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" sx={{ mb: 3, alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h4" component="h1">
          Posts
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
          New post
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

      {!loading && !loadError && posts.length === 0 && (
        <Alert severity="info">No posts yet. Create one to start writing.</Alert>
      )}

      {!loading && !loadError && posts.length > 0 && (
        <Stack spacing={1.5}>
          {posts.map((post) => {
            const published = post.published_at !== null;
            return (
              <Paper
                key={post.id}
                variant="outlined"
                sx={{ p: 2, cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }}
                onClick={() => navigate(`/posts/${post.id}`)}
                data-testid="post-row"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigate(`/posts/${post.id}`);
                }}
              >
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
                      {post.title || 'Untitled'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      /{post.slug}
                    </Typography>
                  </Box>
                  {post.tags.length > 0 && (
                    <Stack direction="row" spacing={0.5} sx={{ display: { xs: 'none', sm: 'flex' } }}>
                      {post.tags.slice(0, 3).map((tag) => (
                        <Chip key={tag} label={tag} size="small" variant="outlined" />
                      ))}
                    </Stack>
                  )}
                  <Chip
                    size="small"
                    color={published ? 'success' : 'default'}
                    label={published ? 'Published' : 'Draft'}
                  />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ minWidth: 96, textAlign: 'right' }}
                  >
                    {published && post.published_at ? formatDate(post.published_at) : '—'}
                  </Typography>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}

      <CreatePostDialog
        open={creating}
        saving={savingCreate}
        onCreate={(payload) => void handleCreate(payload)}
        onClose={() => setCreating(false)}
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
