/**
 * Post-references field (Post Refs v1.14) — the composite control for a portfolio item's
 * `post_refs`. A portfolio item can REFERENCE up to 12 blog posts by id; the ordered ids
 * decide the order the related posts render on the public site. This mirrors the
 * {@link SkillRefsField} pattern: refs are stored as a raw `string[]` and resolved against a
 * catalog loaded once when the field opens.
 *
 * On open it loads EVERY post — drafts included — via `getPosts()` (GET /api/admin/posts).
 * Each catalog entry keeps the post's blog name and its draft/published state, because a ref
 * to a draft is legal but simply does not appear publicly until the post publishes, while a
 * ref to a deleted/unknown post fails publish with a 422.
 *
 * The value renders as an ORDERED list of chips (selection order = render order): the post
 * title, its blog name + draft/published state, up/down reorder controls, and a remove
 * button. "Add post…" opens a searchable menu (by title) of not-yet-referenced posts. A ref
 * whose id is not in the catalog renders an error chip ("missing — blocks publish"); a ref
 * to a draft post renders a warning chip ("draft — hidden until published"). Both stay
 * removable so a broken ref can be fixed — drafts are lenient, publish is the gate. At most
 * 12 refs are accepted: past the cap the add control is disabled. Emits `string[]` via
 * `onChange`.
 *
 * Styling is MUI theme + `sx` (§14.4).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Popover,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import CloseIcon from '@mui/icons-material/Close';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import { getPosts } from '../../api/postsApi';
import { serverMessage } from '../../api/serverMessage';

/** The maximum number of post refs a portfolio item may carry (Post Refs v1.14 api). */
export const MAX_POST_REFS = 12;

interface PostRefsFieldProps {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  helperText?: string;
}

/** One post as it sits in the catalog, with the fields the chips gate on. */
export interface PostCatalogEntry {
  id: string;
  title: string;
  /** The assigned blog's display name, or null when unassigned. */
  blogName: string | null;
  /** True when the post has never been published (`published_at === null`). */
  isDraft: boolean;
}

/** Load every post (drafts included) into a flat catalog keyed by id (Post Refs v1.14). */
export async function loadPostsCatalog(): Promise<PostCatalogEntry[]> {
  const posts = await getPosts();
  return posts.map((post) => ({
    id: post.id,
    title: post.title || '(untitled post)',
    blogName: post.blog?.name ?? null,
    isDraft: post.published_at === null,
  }));
}

export default function PostRefsField({ label, value, onChange, helperText }: PostRefsFieldProps) {
  const refs = Array.isArray(value) ? value : [];

  const [catalog, setCatalog] = useState<PostCatalogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError('');
    loadPostsCatalog()
      .then((entries) => {
        if (alive) setCatalog(entries);
      })
      .catch((err) => {
        if (alive) setLoadError(serverMessage(err, 'Could not load the posts list.'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // Load once when the field opens; the catalog is stable for the edit session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = useMemo(() => {
    const map = new Map<string, PostCatalogEntry>();
    for (const entry of catalog ?? []) map.set(entry.id, entry);
    return map;
  }, [catalog]);

  // Posts not already referenced, filtered by the search box (over title).
  const addable = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (catalog ?? [])
      .filter((entry) => !refs.includes(entry.id))
      .filter((entry) => (q ? entry.title.toLowerCase().includes(q) : true));
  }, [catalog, refs, search]);

  const atMax = refs.length >= MAX_POST_REFS;

  const removeAt = (index: number) => {
    onChange(refs.filter((_, i) => i !== index));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= refs.length) return;
    const next = [...refs];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const addPost = (id: string) => {
    if (refs.length >= MAX_POST_REFS) return;
    onChange([...refs, id]);
    setSearch('');
    setAnchorEl(null);
  };

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        {label}
      </Typography>

      {loading && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', py: 1 }}>
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">
            Loading posts…
          </Typography>
        </Stack>
      )}

      {!loading && loadError && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {loadError}
        </Alert>
      )}

      {!loading && refs.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          No posts referenced yet.
        </Typography>
      )}

      <Stack spacing={1}>
        {refs.map((id, index) => {
          const entry = byId.get(id);
          const missing = !loading && !loadError && catalog !== null && !entry;
          const draft = Boolean(entry?.isDraft);

          // Border/tone signals the chip's state; the reorder + remove controls are the same
          // on every variant so a broken ref is still fixable.
          const borderColor = missing ? 'error.main' : draft ? 'warning.main' : 'divider';
          const name = entry?.title ?? id;

          return (
            <Stack
              key={`${id}-${index}`}
              direction="row"
              spacing={1}
              data-testid="post-ref-chip"
              sx={{
                alignItems: 'center',
                border: 1,
                borderColor,
                borderRadius: 1,
                px: 1,
                py: 0.5,
              }}
            >
              {missing ? (
                <ErrorOutlineIcon fontSize="small" color="error" />
              ) : (
                <ArticleOutlinedIcon
                  fontSize="small"
                  color={draft ? 'warning' : 'action'}
                />
              )}

              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap>
                  {name}
                </Typography>
                {missing ? (
                  <Typography variant="caption" color="error">
                    missing — blocks publish
                  </Typography>
                ) : draft ? (
                  <Typography variant="caption" color="warning.main">
                    draft — hidden until published
                  </Typography>
                ) : (
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {entry?.blogName ? `${entry.blogName} · published` : 'published'}
                  </Typography>
                )}
              </Box>

              {!missing && entry?.blogName && (
                <Chip label={entry.blogName} size="small" variant="outlined" />
              )}

              <IconButton
                size="small"
                aria-label={`Move ${name} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUpwardIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                aria-label={`Move ${name} down`}
                disabled={index === refs.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDownwardIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                aria-label={`Remove ${name}`}
                onClick={() => removeAt(index)}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          );
        })}
      </Stack>

      <Button
        startIcon={<AddIcon />}
        size="small"
        sx={{ mt: 1 }}
        disabled={loading || Boolean(loadError) || atMax}
        onClick={(e) => {
          setSearch('');
          setAnchorEl(e.currentTarget);
        }}
      >
        Add post…
      </Button>

      {atMax && (
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          Maximum of {MAX_POST_REFS} posts reached.
        </Typography>
      )}

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 320 } } }}
      >
        <Box sx={{ p: 1 }}>
          <TextField
            label="Search posts"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
            size="small"
            autoFocus
          />
        </Box>
        <List dense sx={{ maxHeight: 320, overflowY: 'auto', pt: 0 }}>
          {addable.length === 0 ? (
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {(catalog ?? []).length === 0
                  ? 'No posts exist yet — create one on the Posts screen first.'
                  : 'No matching posts.'}
              </Typography>
            </Box>
          ) : (
            addable.map((entry) => (
              <ListItemButton
                key={entry.id}
                aria-label={`Add ${entry.title}`}
                onClick={() => addPost(entry.id)}
              >
                <ListItemText
                  primary={entry.title}
                  secondary={
                    [entry.blogName, entry.isDraft ? 'draft' : 'published']
                      .filter(Boolean)
                      .join(' · ')
                  }
                />
              </ListItemButton>
            ))
          )}
        </List>
      </Popover>

      {helperText && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {helperText}
        </Typography>
      )}
    </Box>
  );
}
