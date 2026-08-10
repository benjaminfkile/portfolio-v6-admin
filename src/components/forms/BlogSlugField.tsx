/**
 * Blog-slug select field (Blogs v1.13) — the control for the blog section's optional `blog`
 * key. A section may pin itself to one blog by that blog's slug; leaving it blank shows posts
 * from all blogs.
 *
 * On mount it fetches the existing blogs (`GET /api/admin/blogs`) and offers them as a select
 * of slugs, prefixed by a "(All blogs)" option that clears the value. Because publish gates on
 * the slug still existing, a value that is NOT among the fetched slugs (a since-deleted blog,
 * or a fetch failure) is kept as its own option and flagged, so the current selection is never
 * silently dropped. If the blog list cannot be loaded at all, it degrades to a free-text field
 * so the value stays editable. MUI + `sx` (§14.4).
 */
import { useEffect, useState } from 'react';
import { MenuItem, TextField } from '@mui/material';
import type { Blog } from '../../types/admin';
import { getBlogs } from '../../api/blogsApi';
import { serverMessage } from '../../api/serverMessage';

interface BlogSlugFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
}

/** Sentinel for the "(All blogs)" option — clears the value to '' (no pinned blog). */
const NONE = '';

export default function BlogSlugField({ label, value, onChange, helperText }: BlogSlugFieldProps) {
  const [blogs, setBlogs] = useState<Blog[] | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let alive = true;
    getBlogs()
      .then((data) => {
        if (alive) setBlogs(data);
      })
      .catch((err) => {
        if (alive) setLoadError(serverMessage(err, 'Could not load the blog list.'));
      });
    return () => {
      alive = false;
    };
  }, []);

  const current = value ?? '';

  // Blog list unavailable: fall back to free text so the value stays editable and saveable.
  if (loadError) {
    return (
      <TextField
        label={label}
        value={current}
        onChange={(e) => onChange(e.target.value)}
        fullWidth
        size="small"
        helperText={`${loadError} Enter a blog slug manually.`}
      />
    );
  }

  const slugs = (blogs ?? []).map((b) => b.slug);
  const currentMissing = current !== '' && !slugs.includes(current);

  return (
    <TextField
      select
      label={label}
      value={current}
      onChange={(e) => onChange(e.target.value === NONE ? '' : e.target.value)}
      fullWidth
      size="small"
      helperText={helperText}
    >
      <MenuItem value={NONE}>(All blogs)</MenuItem>
      {(blogs ?? []).map((blog) => (
        <MenuItem key={blog.id} value={blog.slug}>
          {blog.name} ({blog.slug})
        </MenuItem>
      ))}
      {currentMissing && (
        <MenuItem value={current}>{current} — no longer exists (blocks publish)</MenuItem>
      )}
    </TextField>
  );
}
