/**
 * Post metadata editor (§3.6, Blogs v1.13): title, slug, excerpt, blog, tags, and cover media.
 * The slug is **freely editable until first publish, then locked** (§3.6) — once locked the
 * field is disabled and carries an explanatory tooltip, because changing it breaks every
 * inbound link. Cover selection reuses {@link MediaIdField} → the shared MediaPicker.
 *
 * The Blog select is populated from `GET /api/admin/blogs`; a "No blog" option maps to `null`
 * so a post can be unassigned. It writes `blog_id` on save (Blogs v1.13). MUI + `sx`.
 */
import { useEffect, useState } from 'react';
import { Box, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TagsInput from './TagsInput';
import MediaIdField from '../forms/MediaIdField';
import type { Blog } from '../../types/admin';
import { getBlogs } from '../../api/blogsApi';
import { serverMessage } from '../../api/serverMessage';

export interface PostMetadataValue {
  title: string;
  slug: string;
  excerpt: string;
  tags: string[];
  cover_media_id: string | null;
  /** The blog this post is assigned to, or null = unassigned (Blogs v1.13). */
  blog_id: string | null;
  /**
   * ISO 8601 UTC display date shown on the post (task #134), or null to defer the stamp
   * until first publish. The editor exposes this as a local date + time control and
   * writes back the ISO UTC equivalent; republish preserves whatever is stored here.
   */
  published_at: string | null;
}

interface PostMetadataEditorProps {
  value: PostMetadataValue;
  onChange: (value: PostMetadataValue) => void;
  /** True once the post has been published at least once — slug is locked (§3.6). */
  slugLocked: boolean;
}

const SLUG_LOCK_TOOLTIP =
  'The slug is locked because this post has been published. Changing it would break every ' +
  'inbound link, so it is fixed after first publish (§3.6).';

/** Sentinel value for the "No blog" option — MUI selects cannot hold a real `null`. */
const NO_BLOG = '';

/**
 * Format an ISO UTC timestamp for a `<input type="datetime-local">` in the browser's
 * local timezone (task #134). Returns an empty string when the value is null or invalid,
 * so the input renders empty and the "stamp at first publish" affordance stays available.
 */
export function isoToDatetimeLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * Convert a `datetime-local` input value (interpreted in the browser's local timezone)
 * to an ISO 8601 UTC string. An empty input becomes null so the API records
 * "stamp at first publish" (task #134).
 */
export function datetimeLocalInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function PostMetadataEditor({
  value,
  onChange,
  slugLocked,
}: PostMetadataEditorProps) {
  const set = <K extends keyof PostMetadataValue>(key: K, v: PostMetadataValue[K]) =>
    onChange({ ...value, [key]: v });

  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [blogsError, setBlogsError] = useState('');

  useEffect(() => {
    let alive = true;
    getBlogs()
      .then((data) => {
        if (alive) setBlogs(data);
      })
      .catch((err) => {
        if (alive) setBlogsError(serverMessage(err, 'Could not load the blog list.'));
      });
    return () => {
      alive = false;
    };
  }, []);

  // A post may reference a blog that isn't in the fetched list (e.g. list failed to load);
  // surface it as its own option so the current assignment is never silently dropped.
  const currentMissing =
    value.blog_id != null && !blogs.some((b) => b.id === value.blog_id);

  return (
    <Stack spacing={2.5}>
      <TextField
        label="Title"
        required
        fullWidth
        size="small"
        value={value.title}
        onChange={(e) => set('title', e.target.value)}
        error={!value.title.trim()}
      />

      <Tooltip title={slugLocked ? SLUG_LOCK_TOOLTIP : ''} disableHoverListener={!slugLocked}>
        <TextField
          label="Slug"
          required
          fullWidth
          size="small"
          value={value.slug}
          onChange={(e) => set('slug', e.target.value)}
          disabled={slugLocked}
          error={!slugLocked && !value.slug.trim()}
          helperText={
            slugLocked
              ? 'Locked after first publish — changing it would break inbound links.'
              : 'The URL segment (/blog/your-slug). Editable until the post is first published.'
          }
          slotProps={{
            input: {
              endAdornment: slugLocked ? (
                <LockIcon fontSize="small" color="disabled" aria-label="Slug locked" />
              ) : (
                <Tooltip title="Editable until first publish (§3.6).">
                  <InfoOutlinedIcon fontSize="small" color="disabled" />
                </Tooltip>
              ),
            },
          }}
        />
      </Tooltip>

      <TextField
        select
        label="Blog"
        fullWidth
        size="small"
        value={value.blog_id ?? NO_BLOG}
        onChange={(e) => set('blog_id', e.target.value === NO_BLOG ? null : e.target.value)}
        error={Boolean(blogsError)}
        helperText={
          blogsError ? blogsError : 'Which blog this post belongs to. Leave as "No blog" to leave it unassigned.'
        }
      >
        <MenuItem value={NO_BLOG}>No blog</MenuItem>
        {blogs.map((blog) => (
          <MenuItem key={blog.id} value={blog.id}>
            {blog.name}
          </MenuItem>
        ))}
        {currentMissing && (
          <MenuItem value={value.blog_id as string}>
            {value.blog_id} (current)
          </MenuItem>
        )}
      </TextField>

      <TextField
        label="Excerpt"
        fullWidth
        multiline
        minRows={2}
        size="small"
        value={value.excerpt}
        onChange={(e) => set('excerpt', e.target.value)}
        helperText="Short summary shown in blog teasers."
      />

      <TextField
        label="Published on"
        type="datetime-local"
        fullWidth
        size="small"
        value={isoToDatetimeLocalInput(value.published_at)}
        onChange={(e) => set('published_at', datetimeLocalInputToIso(e.target.value))}
        helperText="Leave empty to use the publish time. Republishing keeps this date."
        slotProps={{
          inputLabel: { shrink: true },
          htmlInput: { 'data-testid': 'published-at-input' },
        }}
      />

      <TagsInput value={value.tags} onChange={(tags) => set('tags', tags)} />

      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Cover image
        </Typography>
        <MediaIdField
          label="Cover media"
          value={value.cover_media_id ?? ''}
          onChange={(id) => set('cover_media_id', id ? id : null)}
          helperText="Optional cover shown on the post and in teasers."
        />
      </Box>
    </Stack>
  );
}
