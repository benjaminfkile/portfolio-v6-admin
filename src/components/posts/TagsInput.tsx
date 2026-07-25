/**
 * Simple tag chip input for a post's `tags` (§3.2, §3.6). Type a tag and press Enter (or
 * comma) to add it; click a chip's × to remove it. Kept deliberately small — no
 * Autocomplete, no async suggestion source — because post tags are free-form strings the
 * owner types, not a controlled vocabulary. Styling is MUI theme + `sx` only (§14.4).
 */
import { useState, type KeyboardEvent } from 'react';
import { Box, Chip, Stack, TextField, Typography } from '@mui/material';

interface TagsInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  label?: string;
}

export default function TagsInput({ value, onChange, label = 'Tags' }: TagsInputProps) {
  const [draft, setDraft] = useState('');
  const tags = Array.isArray(value) ? value : [];

  const commit = () => {
    const tag = draft.trim();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setDraft('');
  };

  const removeAt = (index: number) => onChange(tags.filter((_, i) => i !== index));

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      removeAt(tags.length - 1);
    }
  };

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        {label}
      </Typography>
      {tags.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 1 }}>
          {tags.map((tag, index) => (
            <Chip
              key={`${tag}-${index}`}
              label={tag}
              onDelete={() => removeAt(index)}
              size="small"
            />
          ))}
        </Stack>
      )}
      <TextField
        size="small"
        fullWidth
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder="Add a tag and press Enter"
        slotProps={{ htmlInput: { 'aria-label': 'Add a tag' } }}
        helperText="Press Enter or comma to add each tag."
      />
    </Box>
  );
}
