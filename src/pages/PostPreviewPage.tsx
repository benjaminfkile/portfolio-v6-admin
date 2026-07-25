/**
 * Per-post preview (§7). Reached from the post editor at `/posts/:id/preview`. Loads the
 * post to learn its slug, then embeds the public site's draft render of that post in an
 * iframe at `VITE_PUBLIC_SITE_URL + "/blog/<slug>?preview=<token>&postId=<post id>"`.
 *
 * A post body is blocks, media, and code that must be seen rendered before publishing, so it
 * gets the same iframe-the-real-renderer treatment the page does — no second renderer (§7).
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import type { Post } from '../types/content';
import { getPost } from '../api/postsApi';
import PreviewFrame from '../components/preview/PreviewFrame';
import { postPreviewUrl } from '../lib/previewUrl';

export default function PostPreviewPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setPost(await getPost(id));
    } catch {
      setLoadError('Could not load this post. Is the API reachable?');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const backButton = (
    <Button
      startIcon={<ArrowBackIcon />}
      onClick={() => navigate(`/posts/${id}`)}
      sx={{ mb: 2 }}
    >
      Back to editor
    </Button>
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (loadError || !post) {
    return (
      <Box>
        {backButton}
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void load()}>
              Retry
            </Button>
          }
        >
          {loadError || 'Post not found.'}
        </Alert>
      </Box>
    );
  }

  return (
    <Stack sx={{ minHeight: 'calc(100vh - 128px)' }}>
      {backButton}
      <Box sx={{ mb: 2 }}>
        <Typography variant="h4" component="h1" noWrap>
          Preview: {post.title || 'Untitled post'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The draft body of this post rendered by the public site inside an iframe (§7).
        </Typography>
      </Box>
      <PreviewFrame
        title={`Draft preview of ${post.title || 'post'}`}
        buildUrl={(token) => postPreviewUrl(post.slug, token, post.id)}
      />
    </Stack>
  );
}
