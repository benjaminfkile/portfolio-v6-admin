/**
 * Bespoke editor for the `media` block (§3.7): the reusable {@link MediaIdField} (which
 * opens the shared MediaPicker, task #446) plus an optional caption. Reusing MediaIdField
 * keeps the choose/upload flow identical to the section editors. MUI theme + `sx` (§14.4).
 */
import { Stack, TextField } from '@mui/material';
import type { Block } from '../../../types/content';
import MediaIdField from '../../forms/MediaIdField';

type MediaBlock = Extract<Block, { type: 'media' }>;

interface MediaBlockEditorProps {
  block: MediaBlock;
  onChange: (block: MediaBlock) => void;
}

export default function MediaBlockEditor({ block, onChange }: MediaBlockEditorProps) {
  return (
    <Stack spacing={2}>
      <MediaIdField
        label="Media"
        required
        value={block.media_id}
        onChange={(media_id) => onChange({ ...block, media_id })}
        helperText="Choose an image or video from the library."
      />
      <TextField
        label="Caption (optional)"
        size="small"
        fullWidth
        value={block.caption ?? ''}
        onChange={(e) => {
          const caption = e.target.value;
          const next = { ...block };
          if (caption) next.caption = caption;
          else delete next.caption;
          onChange(next);
        }}
      />
    </Stack>
  );
}
