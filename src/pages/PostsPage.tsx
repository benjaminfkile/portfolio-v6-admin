/**
 * Posts list page (§3.6, §4.2, Blogs v1.13). Lists every post, drafts included, with a
 * draft/published status chip, its blog (as a chip), and the `published_at` date, plus a
 * create flow. A blog filter select narrows the list to one blog (or the unassigned posts).
 * Creating a post opens the block editor for it; clicking a row opens it for editing.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { Post } from '../types/content';
import type { Blog } from '../types/admin';
import { createPost, getPosts } from '../api/postsApi';
import { getBlogs } from '../api/blogsApi';
import { serverMessage } from '../api/serverMessage';
import { formatDate } from '../lib/media';
import CreatePostDialog from '../components/posts/CreatePostDialog';

/** Blog-filter sentinels; real blog ids never collide with these. */
const ALL_BLOGS = '__all__';
const NO_BLOG = '__none__';

export default function PostsPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [blogFilter, setBlogFilter] = useState<string>(ALL_BLOGS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [creating, setCreating] = useState(false);
  const [savingCreate, setSavingCreate] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [postData, blogData] = await Promise.all([
        getPosts(),
        // The filter is a convenience; a failed blog list must not break the posts list.
        getBlogs().catch(() => [] as Blog[]),
      ]);
      // Newest published first; drafts (null published_at) sort after every dated post,
      // then fall back to most-recently-updated so recent draft edits stay near the top
      // of that trailing block (task #134).
      setPosts(
        [...postData].sort((a, b) => {
          if (a.published_at && b.published_at) {
            return b.published_at.localeCompare(a.published_at);
          }
          if (a.published_at) return -1;
          if (b.published_at) return 1;
          return b.updated_at.localeCompare(a.updated_at);
        }),
      );
      setBlogs(blogData);
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

  const filteredPosts = useMemo(() => {
    if (blogFilter === ALL_BLOGS) return posts;
    if (blogFilter === NO_BLOG) return posts.filter((p) => p.blog_id == null);
    return posts.filter((p) => p.blog_id === blogFilter);
  }, [posts, blogFilter]);

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

      {!loading && !loadError && posts.length > 0 && (
        <TextField
          select
          label="Filter by blog"
          size="small"
          value={blogFilter}
          onChange={(e) => setBlogFilter(e.target.value)}
          sx={{ mb: 2, minWidth: 220 }}
        >
          <MenuItem value={ALL_BLOGS}>All blogs</MenuItem>
          <MenuItem value={NO_BLOG}>No blog</MenuItem>
          {blogs.map((blog) => (
            <MenuItem key={blog.id} value={blog.id}>
              {blog.name}
            </MenuItem>
          ))}
        </TextField>
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

      {!loading && !loadError && posts.length === 0 && (
        <Alert severity="info">No posts yet. Create one to start writing.</Alert>
      )}

      {!loading && !loadError && posts.length > 0 && filteredPosts.length === 0 && (
        <Alert severity="info">No posts match this blog filter.</Alert>
      )}

      {!loading && !loadError && filteredPosts.length > 0 && (
        <Stack spacing={1.5}>
          {filteredPosts.map((post) => {
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
                  {post.blog && (
                    <Chip
                      size="small"
                      color="primary"
                      variant="outlined"
                      label={post.blog.name}
                      data-testid="post-blog-chip"
                    />
                  )}
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
                    data-testid="post-published-at"
                  >
                    {post.published_at ? formatDate(post.published_at) : 'Draft'}
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
