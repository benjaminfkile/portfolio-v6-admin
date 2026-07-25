/**
 * Post editor page (§3.6, §3.7, §4.2, §4.5, §8.3). Loads one post, holds its metadata and
 * `Block[]` body in memory, and drives the three lifecycle actions:
 *
 *  - **Save** — a wholesale `PATCH` of the metadata and `draft_body` array carrying
 *    `expected_updated_at`; a 409 raises the shared "changed since you loaded it" dialog
 *    (§4.5), identical to the sections flow.
 *  - **Publish / Unpublish** — confirm-gated `POST`s. Publish re-validates server-side and
 *    surfaces any validation failure clearly (§3.9 item 3) rather than as an opaque toast.
 *
 * The slug locks in the metadata editor once the post has been published at least once
 * (`published_body` is non-null even after unpublish — §3.6).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  Paper,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import PublishIcon from '@mui/icons-material/Publish';
import UnpublishedIcon from '@mui/icons-material/Unpublished';
import type { Block, Post } from '../types/content';
import {
  ConflictError,
  PostValidationError,
  getPost,
  publishPost,
  unpublishPost,
  updatePost,
} from '../api/postsApi';
import { formatDate } from '../lib/media';
import BlockEditor from '../components/posts/BlockEditor';
import PostMetadataEditor, {
  type PostMetadataValue,
} from '../components/posts/PostMetadataEditor';
import ConfirmDialog from '../components/ConfirmDialog';
import ConflictDialog from '../components/ConflictDialog';

function metadataOf(post: Post): PostMetadataValue {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    tags: post.tags,
    cover_media_id: post.cover_media_id,
  };
}

export default function PostEditorPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [metadata, setMetadata] = useState<PostMetadataValue>({
    title: '',
    slug: '',
    excerpt: '',
    tags: [],
    cover_media_id: null,
  });
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [baseline, setBaseline] = useState('');

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [validationIssues, setValidationIssues] = useState<string[]>([]);
  const [toast, setToast] = useState('');

  const seed = useCallback((p: Post) => {
    setPost(p);
    const meta = metadataOf(p);
    const body = Array.isArray(p.draft_body) ? p.draft_body : [];
    setMetadata(meta);
    setBlocks(body);
    setBaseline(JSON.stringify({ meta, body }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      seed(await getPost(id));
    } catch {
      setLoadError('Could not load this post. Is the API reachable?');
    } finally {
      setLoading(false);
    }
  }, [id, seed]);

  useEffect(() => {
    void load();
  }, [load]);

  // Slug locks once the post has ever been published — published_body survives unpublish (§3.6).
  const slugLocked = post?.published_body != null;
  const isPublished = post?.published_at != null;

  const dirty = useMemo(
    () => baseline !== JSON.stringify({ meta: metadata, body: blocks }),
    [baseline, metadata, blocks],
  );

  const handleSave = async () => {
    if (!post) return;
    setSaving(true);
    try {
      const updated = await updatePost(post.id, {
        title: metadata.title,
        // Omit the slug once locked — it must be impossible to change after publish (§3.6).
        ...(slugLocked ? {} : { slug: metadata.slug }),
        excerpt: metadata.excerpt,
        tags: metadata.tags,
        cover_media_id: metadata.cover_media_id,
        draft_body: blocks,
        expected_updated_at: post.updated_at,
      });
      seed(updated);
      setToast('Draft saved.');
    } catch (err) {
      if (err instanceof ConflictError) {
        setConflictOpen(true);
      } else {
        setToast('Could not save the draft.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!post) return;
    setConfirmPublish(false);
    setPublishing(true);
    setValidationIssues([]);
    try {
      seed(await publishPost(post.id));
      setToast('Post published.');
    } catch (err) {
      if (err instanceof PostValidationError) {
        setValidationIssues([err.message, ...err.issues]);
      } else {
        setToast('Could not publish the post.');
      }
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!post) return;
    setConfirmUnpublish(false);
    setPublishing(true);
    try {
      seed(await unpublishPost(post.id));
      setToast('Post unpublished.');
    } catch {
      setToast('Could not unpublish the post.');
    } finally {
      setPublishing(false);
    }
  };

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
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/posts')} sx={{ mb: 2 }}>
          Back to posts
        </Button>
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
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/posts')} sx={{ mb: 2 }}>
        Back to posts
      </Button>

      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 3, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Typography variant="h4" component="h1" noWrap>
            {metadata.title || 'Untitled post'}
          </Typography>
          <Chip
            size="small"
            color={isPublished ? 'success' : 'default'}
            label={isPublished ? 'Published' : 'Draft'}
          />
          {isPublished && post.published_at && (
            <Typography variant="body2" color="text.secondary">
              {formatDate(post.published_at)}
            </Typography>
          )}
          {dirty && <Chip size="small" color="warning" variant="outlined" label="Unsaved changes" />}
        </Stack>

        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={() => void handleSave()}
            disabled={saving || publishing || !dirty}
          >
            {saving ? 'Saving…' : 'Save draft'}
          </Button>
          {isPublished ? (
            <Button
              color="warning"
              variant="outlined"
              startIcon={<UnpublishedIcon />}
              onClick={() => setConfirmUnpublish(true)}
              disabled={saving || publishing}
            >
              Unpublish
            </Button>
          ) : (
            <Tooltip title={dirty ? 'Save your draft before publishing.' : ''}>
              <span>
                <Button
                  color="success"
                  variant="contained"
                  startIcon={<PublishIcon />}
                  onClick={() => setConfirmPublish(true)}
                  disabled={saving || publishing || dirty}
                >
                  Publish
                </Button>
              </span>
            </Tooltip>
          )}
          {isPublished && (
            <Tooltip title={dirty ? 'Save your draft before re-publishing.' : ''}>
              <span>
                <Button
                  color="success"
                  variant="contained"
                  startIcon={<PublishIcon />}
                  onClick={() => setConfirmPublish(true)}
                  disabled={saving || publishing || dirty}
                >
                  Re-publish
                </Button>
              </span>
            </Tooltip>
          )}
        </Stack>
      </Stack>

      {validationIssues.length > 0 && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setValidationIssues([])}>
          <AlertTitle>Publish failed validation</AlertTitle>
          <List dense disablePadding>
            {validationIssues.map((issue, i) => (
              <ListItem key={i} disableGutters sx={{ py: 0 }}>
                <ListItemText primary={issue} />
              </ListItem>
            ))}
          </List>
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
          Metadata
        </Typography>
        <PostMetadataEditor value={metadata} onChange={setMetadata} slugLocked={slugLocked} />
      </Paper>

      <Divider sx={{ mb: 3 }} />

      <Paper variant="outlined" sx={{ p: 3 }}>
        <BlockEditor value={blocks} onChange={setBlocks} />
      </Paper>

      <ConfirmDialog
        open={confirmPublish}
        title={isPublished ? 'Re-publish post?' : 'Publish post?'}
        message={
          isPublished
            ? 'This replaces the live version with your current saved draft. The post stays public.'
            : 'This makes the post public at /blog/' +
              metadata.slug +
              '. The slug locks after publishing and can no longer be changed.'
        }
        confirmLabel={isPublished ? 'Re-publish' : 'Publish'}
        onConfirm={() => void handlePublish()}
        onClose={() => setConfirmPublish(false)}
      />

      <ConfirmDialog
        open={confirmUnpublish}
        title="Unpublish post?"
        message="This removes the post from the public site. Your published copy is retained and the slug stays locked, so you can re-publish later."
        confirmLabel="Unpublish"
        onConfirm={() => void handleUnpublish()}
        onClose={() => setConfirmUnpublish(false)}
      />

      <ConflictDialog
        open={conflictOpen}
        onRefetch={() => {
          setConflictOpen(false);
          void load();
        }}
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
