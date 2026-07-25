/**
 * Post metadata editor (§3.6): title, slug, excerpt, tags, and cover media. The slug is
 * **freely editable until first publish, then locked** (§3.6) — once locked the field is
 * disabled and carries an explanatory tooltip, because changing it breaks every inbound
 * link. Cover selection reuses {@link MediaIdField} → the shared MediaPicker. MUI + `sx`.
 */
import { Box, Stack, TextField, Tooltip, Typography } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TagsInput from './TagsInput';
import MediaIdField from '../forms/MediaIdField';

export interface PostMetadataValue {
  title: string;
  slug: string;
  excerpt: string;
  tags: string[];
  cover_media_id: string | null;
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

export default function PostMetadataEditor({
  value,
  onChange,
  slugLocked,
}: PostMetadataEditorProps) {
  const set = <K extends keyof PostMetadataValue>(key: K, v: PostMetadataValue[K]) =>
    onChange({ ...value, [key]: v });

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
        label="Excerpt"
        fullWidth
        multiline
        minRows={2}
        size="small"
        value={value.excerpt}
        onChange={(e) => set('excerpt', e.target.value)}
        helperText="Short summary shown in blog teasers."
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
